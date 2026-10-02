import { canonicalCategory, rememberCategory } from './categories';
import { sanitizeEmojiMap } from './emoji';
import { isDocKind, type Catalog, type VaultDocument } from './types';

export const UNASSIGNED = 'Unassigned';
export const MEMBER_ROLES = ['Father', 'Mother', 'Brother', 'Sister', 'Self'] as const;
export const SELF = 'Self';
export const MEMBER_LIMIT = 30;

export function normalizeMember(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 40);
}

export function sameMember(left: string, right: string): boolean {
  return normalizeMember(left).toLocaleLowerCase() === normalizeMember(right).toLocaleLowerCase();
}

export function memberRole(name: string): string {
  return MEMBER_ROLES.find((role) => sameMember(role, name)) ?? '';
}

export function documentMember(doc: Pick<VaultDocument, 'member'>): string {
  return memberRole(doc.member ?? '') || normalizeMember(doc.member ?? '') || SELF;
}

export function canonicalMember(members: string[], name: string): string {
  const clean = normalizeMember(name);
  if (!clean) return '';
  const role = memberRole(clean);
  if (role) return role;
  return members.find((item) => sameMember(item, clean)) ?? clean;
}

export function rememberMember(members: string[], name: string): string[] {
  const stored = canonicalMember(members, name);
  if (!stored || memberRole(stored) || members.some((item) => sameMember(item, stored))) return members;
  return [...members, stored].slice(0, MEMBER_LIMIT);
}

export function compareMembers(left: string, right: string): number {
  if (sameMember(left, UNASSIGNED)) return 1;
  if (sameMember(right, UNASSIGNED)) return -1;
  const leftRole = MEMBER_ROLES.findIndex((role) => sameMember(role, left));
  const rightRole = MEMBER_ROLES.findIndex((role) => sameMember(role, right));
  if (leftRole !== -1 && rightRole !== -1) return leftRole - rightRole;
  if (leftRole !== -1) return -1;
  if (rightRole !== -1) return 1;
  return left.localeCompare(right);
}

export function settleCatalog(catalog: Catalog): Catalog {
  let members: string[] = [];
  for (const name of Array.isArray(catalog.members) ? catalog.members : []) {
    if (typeof name === 'string') members = rememberMember(members, name);
  }
  let categories: string[] = [];
  for (const name of Array.isArray(catalog.categories) ? catalog.categories : []) {
    if (typeof name === 'string') categories = rememberCategory(categories, name);
  }
  const documents = catalog.documents.map((doc) => {
    const member = canonicalMember(members, typeof doc.member === 'string' ? doc.member : '') || SELF;
    if (!memberRole(member)) members = rememberMember(members, member);
    const kind = canonicalCategory(categories, typeof doc.kind === 'string' ? doc.kind : '') || 'other';
    if (!isDocKind(kind)) categories = rememberCategory(categories, kind);
    const rotation = doc.rotation === 90 || doc.rotation === 180 || doc.rotation === 270 ? doc.rotation : 0;
    return { ...doc, member, kind, favourite: doc.favourite === true, rotation };
  });
  const memberEmoji: Record<string, string> = {};
  for (const [key, emoji] of Object.entries(sanitizeEmojiMap(catalog.memberEmoji))) {
    const name = canonicalMember(members, key) || memberRole(key);
    if (name) memberEmoji[name] = emoji;
  }
  const categoryEmoji: Record<string, string> = {};
  for (const [key, emoji] of Object.entries(sanitizeEmojiMap(catalog.categoryEmoji))) {
    const kind = canonicalCategory(categories, key);
    if (kind) categoryEmoji[kind] = emoji;
  }
  return { ...catalog, documents, members, categories, memberEmoji, categoryEmoji };
}
