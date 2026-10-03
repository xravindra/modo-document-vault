export const TRIAL_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

export type PlanId = 'monthly' | 'yearly';

/** Display prices only. The store returns the real localized price once billing is connected. */
export const PLANS: { id: PlanId; title: string; price: string; period: string; note: string; badge?: string }[] = [
  { id: 'yearly', title: 'Yearly', price: '₹799', period: 'per year', note: 'Just ₹67 a month', badge: 'Save 33%' },
  { id: 'monthly', title: 'Monthly', price: '₹99', period: 'per month', note: 'Cancel anytime' },
];

export type PlanRecord = {
  trialStartedAt: number;
  subscription: { plan: PlanId; since: number; renewsAt: number } | null;
};

export type PlanStatus =
  | { kind: 'trial'; daysLeft: number; endsAt: number }
  | { kind: 'active'; plan: PlanId; renewsAt: number }
  | { kind: 'expired'; endedAt: number };

export function freshRecord(now = Date.now()): PlanRecord {
  return { trialStartedAt: now, subscription: null };
}

export function parseRecord(raw: string | null): PlanRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PlanRecord>;
    if (typeof parsed.trialStartedAt !== 'number' || !Number.isFinite(parsed.trialStartedAt)) return null;
    const sub = parsed.subscription;
    const subscription =
      sub && (sub.plan === 'monthly' || sub.plan === 'yearly') && typeof sub.since === 'number' && typeof sub.renewsAt === 'number'
        ? { plan: sub.plan, since: sub.since, renewsAt: sub.renewsAt }
        : null;
    return { trialStartedAt: parsed.trialStartedAt, subscription };
  } catch {
    return null;
  }
}

export function planStatus(record: PlanRecord, now = Date.now()): PlanStatus {
  if (record.subscription && record.subscription.renewsAt > now) {
    return { kind: 'active', plan: record.subscription.plan, renewsAt: record.subscription.renewsAt };
  }
  const endsAt = record.trialStartedAt + TRIAL_DAYS * DAY;
  if (now < endsAt) {
    return { kind: 'trial', daysLeft: Math.max(1, Math.ceil((endsAt - now) / DAY)), endsAt };
  }
  return { kind: 'expired', endedAt: record.subscription?.renewsAt ?? endsAt };
}

export function renewalFrom(plan: PlanId, now = Date.now()): number {
  return now + (plan === 'yearly' ? 365 : 30) * DAY;
}
