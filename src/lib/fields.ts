import type { DocKind, ExtractedField } from './types';

const LABELS: { key: string; label: string; pattern: RegExp }[] = [
  { key: 'surname', label: 'Surname', pattern: /^surname\s*[:\-]\s*(.+)$/i },
  { key: 'given', label: 'Given names', pattern: /^given names?\s*[:\-]\s*(.+)$/i },
  { key: 'passport', label: 'Passport number', pattern: /^passport\s*(?:no\.?|number)?\s*[:\-]\s*([A-Z0-9]+)$/i },
  { key: 'nationality', label: 'Nationality', pattern: /^nationality\s*[:\-]\s*(.+)$/i },
  { key: 'dob', label: 'Date of birth', pattern: /^(?:date of birth|dob)\s*[:\-]\s*(.+)$/i },
  { key: 'expiry', label: 'Date of expiry', pattern: /^(?:date of expiry|date of expiration|expiry|expires)\s*[:\-]\s*(.+)$/i },
  { key: 'docType', label: 'Document type', pattern: /^document type\s*[:\-]\s*(.+)$/i },
  { key: 'policy', label: 'Policy number', pattern: /^policy\s*(?:no\.?|number)?\s*[:\-]\s*(.+)$/i },
  { key: 'member', label: 'Member ID', pattern: /^member\s*(?:id|no\.?|number)?\s*[:\-]\s*(.+)$/i },
  { key: 'account', label: 'Account', pattern: /^(?:account|acct)\s*(?:no\.?|number)?\s*[:\-]\s*(.+)$/i },
];

function pushField(fields: ExtractedField[], field: ExtractedField) {
  const value = field.value.replace(/\s+/g, ' ').trim();
  if (value.length < 2 || value.length > 120) return;
  if (fields.some((item) => item.key === field.key || item.value.toLowerCase() === value.toLowerCase())) return;
  fields.push({ ...field, value });
}

function readMrz(lines: string[], fields: ExtractedField[]) {
  const mrz = lines.filter((line) => /^[A-Z0-9<]{30,44}$/.test(line));
  if (mrz.length < 2) return;
  const nameLine = mrz[0] ?? '';
  const detail = mrz[1] ?? '';
  if (nameLine.startsWith('P<')) {
    const names = nameLine.slice(5).split('<<');
    const surname = (names[0] ?? '').replace(/</g, ' ').trim();
    const given = (names[1] ?? '').replace(/</g, ' ').trim();
    if (surname) pushField(fields, { key: 'surname', label: 'Surname', value: surname, confidence: 0.86 });
    if (given) pushField(fields, { key: 'given', label: 'Given names', value: given, confidence: 0.86 });
  }
  const number = detail.slice(0, 9).replace(/</g, '').trim();
  if (number.length >= 6) {
    pushField(fields, { key: 'passport', label: 'Passport number', value: number, confidence: 0.9 });
  }
}

export function parseFields(text: string): ExtractedField[] {
  const fields: ExtractedField[] = [];
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    for (const label of LABELS) {
      const match = line.match(label.pattern);
      if (match?.[1]) {
        pushField(fields, { key: label.key, label: label.label, value: match[1], confidence: 0.92 });
      }
    }
  }

  readMrz(lines, fields);

  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email?.[0]) pushField(fields, { key: 'email', label: 'Email', value: email[0], confidence: 0.8 });

  const iban = text.match(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/);
  if (iban?.[0]) pushField(fields, { key: 'iban', label: 'IBAN', value: iban[0], confidence: 0.74 });

  for (const line of lines) {
    if (!/total|amount|balance|premium/i.test(line)) continue;
    const amount = line.match(/[$€£]\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})|\b\d{1,3}(?:,\d{3})*\.\d{2}\b/);
    if (amount?.[0]) {
      pushField(fields, { key: 'amount', label: 'Amount', value: amount[0], confidence: 0.7 });
      break;
    }
  }

  return fields.slice(0, 12);
}

export function inferKind(text: string): DocKind {
  const haystack = text.toLowerCase();
  if (/passport|driver|national id|identity card/.test(haystack)) return 'identity';
  if (/boarding|itinerary|visa|ticket/.test(haystack)) return 'travel';
  if (/patient|clinic|prescription|health/.test(haystack)) return 'health';
  if (/invoice|account|iban|statement|tax|policy|premium/.test(haystack)) return 'finance';
  if (/agreement|contract|notary|deed/.test(haystack)) return 'legal';
  return 'other';
}
