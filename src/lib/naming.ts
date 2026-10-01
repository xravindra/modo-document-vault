import { safeFileName } from './bytes';
import type { ExtractedField } from './types';
import { isDocKind, kindLabel } from './types';

const GENERIC_NAME =
  /^(?:img|dsc|dscn|photo|image|scan|document|untitled|whatsapp|screenshot|pic|camera|file)(?:[-_ ]?\d+)?$/i;

const SPECIFIC_KIND = new Set([
  'Passport',
  'Aadhaar',
  'Driving licence',
  'Identity card',
  'Debit card',
  'Boarding pass',
  'Visa',
  'Prescription',
  'Invoice',
  'Statement',
  'Policy',
  'Agreement',
]);

function extension(fileName: string, mimeType: string): string {
  const fromName = fileName.match(/(\.[A-Za-z0-9]{1,8})$/)?.[1]?.toLowerCase() ?? '';
  if (fromName && fromName !== '.bin') return fromName;
  if (mimeType.includes('pdf')) return '.pdf';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType.startsWith('image/')) return '.jpg';
  if (mimeType.startsWith('text/')) return '.txt';
  return fromName || '.bin';
}

function fieldValue(fields: ExtractedField[], key: string): string {
  return fields.find((item) => item.key === key)?.value.trim() ?? '';
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function holder(fields: ExtractedField[]): string {
  const surname = fieldValue(fields, 'surname');
  if (surname) return titleCase(surname);
  const given = fieldValue(fields, 'given');
  if (given) return titleCase(given);
  const named = fields.find((item) => /^(?:name|full name|holder|cardholder)$/i.test(item.label))?.value.trim() ?? '';
  return named ? titleCase(named) : '';
}

function identifier(fields: ExtractedField[]): string {
  const passport = fieldValue(fields, 'passport');
  if (passport) return passport.toUpperCase();
  const policy = fieldValue(fields, 'policy');
  if (policy) return policy;
  const account = fieldValue(fields, 'account').replace(/\s/g, '');
  if (!account) return '';
  const digits = account.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : account.slice(-4);
}

function kindWord(kind: string, text: string, fields: ExtractedField[]): string {
  const hay = text.toLowerCase();
  if (fieldValue(fields, 'passport') || /\bpassport\b/.test(hay)) return 'Passport';
  if (/aadhaar|aadhar/.test(hay)) return 'Aadhaar';
  if (/driving licence|driving license|driver/.test(hay)) return 'Driving licence';
  if (/national id|identity card/.test(hay)) return 'Identity card';
  if (kind === 'card' || /debit card|atm card|rupay|visa debit/.test(hay)) return 'Debit card';
  if (/\bboarding\b/.test(hay)) return 'Boarding pass';
  if (/\bvisa\b/.test(hay)) return 'Visa';
  if (/\bprescription\b/.test(hay)) return 'Prescription';
  if (/\binvoice\b/.test(hay)) return 'Invoice';
  if (/\bstatement\b/.test(hay)) return 'Statement';
  if (/\bpolicy\b/.test(hay)) return 'Policy';
  if (/\b(?:agreement|contract)\b/.test(hay)) return 'Agreement';
  if (kind === 'identity') return 'Identity';
  if (kind === 'other' || !kind.trim()) return '';
  if (isDocKind(kind)) return kind === 'card' ? 'Debit card' : kindLabel(kind);
  return kind.trim();
}

function cleanedOriginal(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function smartDocumentName(input: {
  fileName: string;
  mimeType: string;
  kind: string;
  member: string;
  fields: ExtractedField[];
  text: string;
}): { title: string; fileName: string } {
  const ext = extension(input.fileName, input.mimeType);
  const kindName = kindWord(input.kind, input.text, input.fields);
  const person = holder(input.fields);
  const id = identifier(input.fields);
  const original = cleanedOriginal(input.fileName);
  const meaningful = original.length > 1 && !GENERIC_NAME.test(original);
  const member = input.member.trim();
  const includeMember = member.length > 0 && member.toLowerCase() !== 'self';
  let title = '';
  if (person || id) {
    title = [kindName, person, id].filter(Boolean).join(' ');
    if (includeMember && !title.toLowerCase().includes(member.toLowerCase())) title = `${member} ${title}`;
  } else if (meaningful) {
    const alreadyNamed = kindName && SPECIFIC_KIND.has(kindName) && original.toLowerCase().includes(kindName.toLowerCase());
    title = kindName && SPECIFIC_KIND.has(kindName) && !alreadyNamed ? `${kindName} ${original}` : original;
  } else {
    const day = new Date().toISOString().slice(0, 10);
    title = [includeMember ? member : '', kindName || 'Document', day].filter(Boolean).join(' ');
  }
  title = title.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Document';
  const base = title.slice(0, Math.max(1, 80 - ext.length)).trim();
  return { title, fileName: safeFileName(`${base}${ext}`) };
}
