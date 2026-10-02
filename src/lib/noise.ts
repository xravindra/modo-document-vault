export function clearNoise(text: string): string {
  const kept: string[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/[ \t]+/g, ' ').trim();
    if (!line) continue;
    if (/^(?:page|pg\.?)\s*\d+(\s*(?:of|\/)\s*\d+)?$/i.test(line)) continue;
    if (/^[\p{P}\p{S}\s]+$/u.test(line)) continue;
    const letters = line.match(/\p{L}/gu)?.length ?? 0;
    const digits = line.match(/\p{N}/gu)?.length ?? 0;
    if (letters < 2 && digits < 3) continue;
    if (line.length > 180) continue;
    if (kept[kept.length - 1] === line) continue;
    kept.push(line);
  }
  return kept.join('\n').trim();
}
