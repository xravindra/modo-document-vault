export const KINDS = [
  { id: 'identity', label: 'Identity' },
  { id: 'card', label: 'Debit cards' },
  { id: 'travel', label: 'Travel' },
  { id: 'health', label: 'Health' },
  { id: 'finance', label: 'Finance' },
  { id: 'legal', label: 'Legal' },
  { id: 'other', label: 'Other' },
] as const;

export type DocKind = (typeof KINDS)[number]['id'];

export type ExtractedField = {
  key: string;
  label: string;
  value: string;
  confidence: number;
};

export type Extraction = {
  engine: 'pdf-text' | 'ocr' | 'text' | 'metadata';
  text: string;
  fields: ExtractedField[];
  note: string;
  /** Text before Clear noise. Kept so the original wording can be restored. */
  sourceText?: string;
  noiseCleared?: boolean;
};

export type PageCopy = {
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  extraction?: Extraction;
};

export type DocumentPage = {
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  extraction?: Extraction;
  /** True when the copy on screen is the password-protected file. */
  locked?: boolean;
  /** The other copy, kept so Lock file and Unlock file can switch. */
  twin?: PageCopy;
};

export type VaultDocument = {
  id: string;
  title: string;
  /** A built-in category id, or a name created in the vault. */
  kind: string;
  /** Family member this document is filed under. Empty for documents sealed before members existed. */
  member: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  createdAt: number;
  favourite?: boolean;
  /** Quarter turns clockwise: 0, 90, 180, or 270. */
  rotation?: number;
  extraction: Extraction;
  pages?: DocumentPage[];
};

export type ActivityType =
  | 'create'
  | 'unlock'
  | 'add'
  | 'view'
  | 'rename'
  | 'edit'
  | 'delete'
  | 'export'
  | 'import'
  | 'pin-change'
  | 'destroy';

export type ActivityEvent = {
  id: string;
  at: number;
  type: ActivityType;
  detail: string;
};

export type Settings = {
  autoLockMs: number;
  biometrics: boolean;
};

export type Catalog = {
  documents: VaultDocument[];
  activity: ActivityEvent[];
  settings: Settings;
  members: string[];
  /** Category names created in this vault. Built-in categories are not listed here. */
  categories: string[];
  /** Emoji chosen for a family member, keyed by the stored name. */
  memberEmoji: Record<string, string>;
  /** Emoji chosen for a category, keyed by the category id or custom name. */
  categoryEmoji: Record<string, string>;
};

export function emptyCatalog(): Catalog {
  return {
    documents: [],
    activity: [],
    settings: { autoLockMs: 0, biometrics: false },
    members: [],
    categories: [],
    memberEmoji: {},
    categoryEmoji: {},
  };
}

export function kindLabel(kind: string): string {
  return KINDS.find((item) => item.id === kind)?.label ?? (kind.trim() || 'Other');
}

export function isDocKind(value: string): value is DocKind {
  return KINDS.some((item) => item.id === value);
}

export function groupByKind(
  documents: VaultDocument[],
  categories: string[] = [],
): { kind: string; label: string; documents: VaultDocument[] }[] {
  const seen = new Set<string>();
  const groups: { kind: string; label: string; documents: VaultDocument[] }[] = [];
  const take = (kind: string, label: string) => {
    if (seen.has(kind)) return;
    const rows = documents.filter((doc) => doc.kind === kind);
    if (rows.length === 0) return;
    seen.add(kind);
    groups.push({ kind, label, documents: rows });
  };
  for (const kind of KINDS) take(kind.id, kind.label);
  for (const name of categories) take(name, kindLabel(name));
  for (const doc of documents) take(doc.kind, kindLabel(doc.kind));
  return groups;
}
