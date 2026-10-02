import type { DocKind, ExtractedField } from './types';

const MAX_FIELDS = 40;

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

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE =
  /(?:\+\d{1,3}[\s().-]*)(?:\d[\s().-]*){7,14}\d|\(\d{2,4}\)[\s.-]*\d{3,4}[\s.-]*\d{3,4}|\b\d{2,4}[\s.-]\d{3,4}[\s.-]\d{3,4}(?:[\s.-]\d{2,4})?\b/g;
const DATE =
  /\b(?:\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{4})\b|[०-९]{1,2}[/.][०-९]{1,2}[/.][०-९]{4}/gi;
const URL = /\bhttps?:\/\/[^\s<>"']+/gi;
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
const AMOUNT = /[$€£₹]\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\b(?:USD|EUR|GBP|INR|CAD|AUD|Rs\.?)\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b/gi;
const LABELED = /^([\p{L}][\p{L}\p{M}\p{N}&/'(). ]{0,42}?)\s*(?::|：|\s[-–]\s)\s*(.+)$/u;
const SKIP_LABEL = /^(?:page|pages|note|notes|see|the|and|or|to|a|an|of|by|for|with)$/i;

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/[.,;]+$/g, '');
}

function readable(value: string): boolean {
  return value.length >= 2 && value.length <= 120 && /[\p{L}\p{N}]/u.test(value);
}

function captured(fields: ExtractedField[], value: string): boolean {
  const needle = value.toLowerCase();
  return fields.some((item) => {
    const hay = item.value.toLowerCase();
    if (hay === needle) return true;
    return needle.length >= 6 && hay.includes(needle);
  });
}

function pushField(fields: ExtractedField[], field: ExtractedField) {
  if (fields.length >= MAX_FIELDS) return;
  const value = clean(field.value);
  const label = field.label.replace(/\s+/g, ' ').trim();
  if (!label && !readable(value)) return;
  if (value && (!readable(value) || captured(fields, value))) return;
  const sameKey = new RegExp(`^${field.key}(?:-\\d+)?$`);
  const repeats = fields.filter((item) => sameKey.test(item.key)).length;
  const key = repeats === 0 ? field.key : `${field.key}-${repeats + 1}`;
  const nextLabel = !label ? '' : repeats === 0 ? label : `${label} ${repeats + 1}`;
  fields.push({ ...field, key, label: nextLabel, value });
}

function matches(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[0]);
}

function collect(fields: ExtractedField[], values: string[], key: string, label: string, confidence: number) {
  for (const value of values) {
    pushField(fields, { key, label, value, confidence });
  }
}

function phoneNumber(value: string): string | null {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  if (!trimmed.startsWith('+') && !/[\s().-]/.test(trimmed)) return null;
  if (/^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}$/.test(trimmed)) return null;
  return trimmed;
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

function readLabeled(line: string, fields: ExtractedField[]) {
  const match = line.match(LABELED);
  if (!match?.[1] || !match[2]) return;
  const label = clean(match[1]);
  if (!label || SKIP_LABEL.test(label) || label.split(' ').length > 6) return;
  const raw = clean(match[2]);
  if (!readable(raw) || raw.split(' ').length > 8) return;
  const entities = [
    ...matches(raw, EMAIL),
    ...matches(raw, URL),
    ...matches(raw, IBAN),
    ...matches(raw, AMOUNT),
    ...matches(raw, DATE),
    ...matches(raw, PHONE).filter((item) => phoneNumber(item)),
  ];
  if (entities.length > 1) return;
  const value = entities.length === 1 && raw.toLowerCase().includes(entities[0].toLowerCase()) ? entities[0] : raw;
  const key = label.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 32) || 'field';
  pushField(fields, { key, label, value, confidence: 0.84 });
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

  for (const line of lines) {
    if (/^[A-Z0-9<]{30,44}$/.test(line)) continue;
    readLabeled(line, fields);
  }

  collect(fields, matches(text, EMAIL), 'email', 'Email', 0.8);
  collect(
    fields,
    matches(text, PHONE).map(phoneNumber).filter((item): item is string => !!item),
    'phone',
    'Phone',
    0.78,
  );
  collect(fields, matches(text, DATE), 'date', 'Date', 0.76);
  collect(fields, matches(text, URL).map((item) => item.replace(/[.,;)]+$/g, '')), 'url', 'Link', 0.8);
  collect(fields, matches(text, IBAN), 'iban', 'IBAN', 0.74);
  collect(fields, matches(text, AMOUNT), 'amount', 'Amount', 0.7);
  collect(fields, matches(text, /\b(?:\d{4}\s\d{4}\s\d{4}|[A-Z]{5}\d{4}[A-Z]|[A-Z]{1,3}\d{6,12})\b/g), 'id', '', 0.66);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (/^[A-Z0-9<]{30,44}$/.test(line)) continue;
    const labelOnly = line.match(/^([\p{L}][\p{L}\p{M}\p{N}&/'(). ]{0,32}?)\s*[:：]\s*$/u);
    if (labelOnly?.[1]) {
      const label = clean(labelOnly[1]);
      if (!label || SKIP_LABEL.test(label)) continue;
      const next = lines[index + 1] ?? '';
      const nextIsValue = readable(next) && !next.includes(':') && next.split(' ').length <= 8 && !/^[A-Z0-9<]{30,44}$/.test(next);
      const key = label.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 32) || 'field';
      pushField(fields, { key, label, value: nextIsValue ? next : '', confidence: 0.8 });
      if (nextIsValue) index += 1;
      continue;
    }
    if (fields.some((item) => item.value && line.toLowerCase().includes(item.value.toLowerCase()))) continue;
    if (readable(line) && line.split(' ').length <= 6 && /[\p{N}]/u.test(line) && !line.includes(':')) {
      pushField(fields, { key: 'value', label: '', value: line, confidence: 0.62 });
    }
  }

  if (fields.length === 0) {
    for (const line of lines) {
      if (!readable(line) || line.split(' ').length > 8 || /^[A-Z0-9<]{30,44}$/.test(line)) continue;
      pushField(fields, { key: 'value', label: '', value: line, confidence: 0.55 });
    }
  }

  return fields;
}

export function inferKind(text: string): DocKind {
  const haystack = text.toLowerCase();
  if (/passport|driver|national id|identity card|aadhaar|aadhar/.test(haystack)) return 'identity';
  if (/debit card|atm card|rupay|maestro|visa debit/.test(haystack)) return 'card';
  if (/boarding|itinerary|visa|ticket/.test(haystack)) return 'travel';
  if (/patient|clinic|prescription|health/.test(haystack)) return 'health';
  if (/invoice|account|iban|statement|tax|policy|premium/.test(haystack)) return 'finance';
  if (/agreement|contract|notary|deed/.test(haystack)) return 'legal';
  return 'other';
}
