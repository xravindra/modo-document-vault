import type { PlanId } from './plan';

export class BillingUnavailable extends Error {}

/**
 * Store purchases are not connected yet. Development builds simulate a successful
 * purchase so the subscription screens can be exercised end to end.
 */
export async function purchase(plan: PlanId): Promise<{ plan: PlanId }> {
  if (__DEV__) return { plan };
  throw new BillingUnavailable('Subscriptions open soon. You can keep using MODO in the meantime.');
}

export async function restorePurchases(): Promise<{ plan: PlanId } | null> {
  if (__DEV__) return null;
  throw new BillingUnavailable('Restoring purchases opens with subscriptions.');
}
