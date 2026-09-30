export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatWhen(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(ms);
}

export function shareSummary(title: string, fields: { label: string; value: string }[]): string {
  const lines = fields
    .map((field) => `${field.label}: ${field.value}`.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 2);
  return [title.trim(), ...lines].filter(Boolean).join('\n');
}

export function engineLabel(engine: string): string {
  if (engine === 'pdf-text') return 'PDF text';
  if (engine === 'ocr') return 'Recognized text';
  if (engine === 'text') return 'Text file';
  return 'File only';
}
