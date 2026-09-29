export const KINDS = [
  { id: 'identity', label: 'Identity' },
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
};

export type VaultDocument = {
  id: string;
  title: string;
  kind: DocKind;
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  createdAt: number;
  favorite: boolean;
  extraction: Extraction;
};

export type ActivityType =
  | 'create'
  | 'unlock'
  | 'add'
  | 'view'
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
};

export function emptyCatalog(): Catalog {
  return {
    documents: [],
    activity: [],
    settings: { autoLockMs: 0, biometrics: false },
  };
}

export function kindLabel(kind: DocKind): string {
  return KINDS.find((item) => item.id === kind)?.label ?? 'Other';
}
