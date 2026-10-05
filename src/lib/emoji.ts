import { isDocKind } from './types';

export const EMOJI_CHOICES = [
  '👨',
  '👩',
  '👦',
  '👧',
  '🧑',
  '👴',
  '👵',
  '👶',
  '👰',
  '🧔',
  '👱',
  '😀',
  '😊',
  '😎',
  '🤓',
  '😇',
  '🤠',
  '🐶',
  '🐱',
  '🦊',
  '🐻',
  '🐼',
  '🦁',
  '🐸',
  '🐵',
  '🦄',
  '🌸',
  '🌻',
  '⭐',
  '🌙',
  '🔥',
  '💎',
  '🏠',
  '🪪',
  '💳',
  '✈️',
  '🧳',
  '🩺',
  '💊',
  '💰',
  '🏦',
  '⚖️',
  '📜',
  '📄',
  '🔑',
  '🎓',
  '🛂',
  '📦',
  '🧾',
  '📚',
  '🎵',
  '⚽',
  '🎨',
  '🚗',
] as const;

const CHOICE_SET = new Set<string>(EMOJI_CHOICES);

const ROLE_EMOJI = {
  Father: '👨',
  Mother: '👩',
  Brother: '👦',
  Sister: '👧',
  Wife: '👰',
  Self: '🧑',
} as const;

const KIND_EMOJI: Record<string, string> = {
  identity: '🪪',
  card: '💳',
  travel: '✈️',
  health: '🩺',
  finance: '💰',
  legal: '⚖️',
  other: '📄',
};

const MEMBER_POOL = ['😀', '😊', '😎', '🤓', '😇', '🤠', '🐶', '🐱', '🦊', '🐻', '🐼', '🦁', '🐸', '🐵', '🦄', '🌸', '🌻', '⭐'];
const CATEGORY_POOL = ['🏠', '💎', '🔑', '🎓', '🛂', '📦', '🧾', '📚', '🎵', '⚽', '🎨', '🚗', '🌙', '🔥', '🏦', '📜'];

export function isEmojiChoice(value: string): boolean {
  return CHOICE_SET.has(value);
}

export function sanitizeEmojiMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const clean = key.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!clean || typeof value !== 'string' || !isEmojiChoice(value)) continue;
    next[clean] = value;
  }
  return next;
}

function pick(name: string, pool: readonly string[]): string {
  let hash = 0;
  for (const char of Array.from(name.toLocaleLowerCase())) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return pool[hash % pool.length] ?? pool[0] ?? '⭐';
}

export function memberMark(name: string, overrides?: Record<string, string>): string {
  const role = (Object.keys(ROLE_EMOJI) as (keyof typeof ROLE_EMOJI)[]).find(
    (item) => item.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
  );
  const key = role ?? name.replace(/\s+/g, ' ').trim();
  const chosen = overrides?.[key];
  if (chosen && isEmojiChoice(chosen)) return chosen;
  if (role) return ROLE_EMOJI[role];
  return pick(key || name, MEMBER_POOL);
}

export function categoryMark(kind: string, overrides?: Record<string, string>): string {
  const chosen = overrides?.[kind];
  if (chosen && isEmojiChoice(chosen)) return chosen;
  if (isDocKind(kind)) return KIND_EMOJI[kind] ?? '📄';
  return pick(kind, CATEGORY_POOL);
}
