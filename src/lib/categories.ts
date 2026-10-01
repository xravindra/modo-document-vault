import { isDocKind, KINDS } from './types';

export const CATEGORY_LIMIT = 30;

export function normalizeCategory(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 40);
}

export function sameCategory(left: string, right: string): boolean {
  return normalizeCategory(left).toLocaleLowerCase() === normalizeCategory(right).toLocaleLowerCase();
}

export function canonicalCategory(categories: string[], name: string): string {
  const clean = normalizeCategory(name);
  if (!clean) return '';
  const builtIn = KINDS.find(
    (item) => item.id.toLocaleLowerCase() === clean.toLocaleLowerCase() || sameCategory(item.label, clean),
  );
  if (builtIn) return builtIn.id;
  return categories.find((item) => sameCategory(item, clean)) ?? clean;
}

export function rememberCategory(categories: string[], name: string): string[] {
  const stored = canonicalCategory(categories, name);
  if (!stored || isDocKind(stored) || categories.some((item) => sameCategory(item, stored))) return categories;
  return [...categories, stored].slice(0, CATEGORY_LIMIT);
}
