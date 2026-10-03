import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { purchase, restorePurchases } from '@/lib/billing';
import { freshRecord, parseRecord, planStatus, renewalFrom, TRIAL_DAYS, type PlanId, type PlanRecord, type PlanStatus } from '@/lib/plan';
import { readPlanRecord, writePlanRecord } from '@/lib/planStore';

type PlanApi = {
  ready: boolean;
  status: PlanStatus;
  /** False once the trial ends without a subscription. Viewing and exporting stay free. */
  canCreate: boolean;
  subscribe: (plan: PlanId) => Promise<void>;
  restore: () => Promise<boolean>;
  /** Development builds only: jump to a fresh trial or an ended one. */
  simulate: (state: 'fresh' | 'ended') => Promise<void>;
};

const DAY = 24 * 60 * 60 * 1000;

const PlanContext = createContext<PlanApi | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const [record, setRecord] = useState<PlanRecord>(() => freshRecord());
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let live = true;
    void (async () => {
      const stored = parseRecord(await readPlanRecord());
      const next = stored ?? freshRecord();
      if (!stored) await writePlanRecord(JSON.stringify(next)).catch(() => undefined);
      if (!live) return;
      setRecord(next);
      setReady(true);
    })();
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  const save = useCallback(async (next: PlanRecord) => {
    setRecord(next);
    setNow(Date.now());
    await writePlanRecord(JSON.stringify(next)).catch(() => undefined);
  }, []);

  const value = useMemo<PlanApi>(() => {
    const status = planStatus(record, now);
    return {
      ready,
      status,
      canCreate: status.kind !== 'expired',
      subscribe: async (plan) => {
        const bought = await purchase(plan);
        const since = Date.now();
        await save({ ...record, subscription: { plan: bought.plan, since, renewsAt: renewalFrom(bought.plan, since) } });
      },
      restore: async () => {
        const found = await restorePurchases();
        if (!found) return false;
        const since = Date.now();
        await save({ ...record, subscription: { plan: found.plan, since, renewsAt: renewalFrom(found.plan, since) } });
        return true;
      },
      simulate: async (state) => {
        if (!__DEV__) return;
        const start = state === 'fresh' ? Date.now() : Date.now() - (TRIAL_DAYS + 1) * DAY;
        await save({ trialStartedAt: start, subscription: null });
      },
    };
  }, [now, ready, record, save]);

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const value = useContext(PlanContext);
  if (!value) throw new Error('usePlan must be used inside PlanProvider.');
  return value;
}
