const COLORS = ['#E0C08A', '#9ECBB2', '#E08B7A', '#C9B7E0', '#8FB8D6', '#E2B07A', '#B7C98F', '#E0A8C0'];

function firstGrapheme(word: string): string {
  const chars = Array.from(word);
  let token = chars[0] ?? '';
  for (let index = 1; index < chars.length; index += 1) {
    const char = chars[index] ?? '';
    if (!/\p{M}/u.test(char)) break;
    token += char;
  }
  return token;
}

export function initials(name: string): string {
  const words = name.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 2);
  const mark = words.map((word) => firstGrapheme(word)).join('');
  return mark ? mark.toLocaleUpperCase() : '?';
}

export function avatarColor(name: string): string {
  let hash = 0;
  for (const char of Array.from(name.toLocaleLowerCase())) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return COLORS[hash % COLORS.length] ?? COLORS[0];
}
