const PLAN = 'modo.plan';

export async function readPlanRecord(): Promise<string | null> {
  try {
    return localStorage.getItem(PLAN);
  } catch {
    return null;
  }
}

export async function writePlanRecord(value: string): Promise<void> {
  localStorage.setItem(PLAN, value);
}
