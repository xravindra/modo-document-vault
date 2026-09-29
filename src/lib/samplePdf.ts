export function buildSamplePassportPdf(): Uint8Array {
  const content = [
    'BT',
    '/F1 12 Tf',
    '72 740 Td',
    '(REPUBLIC OF EXAMPLE) Tj',
    '0 -28 Td',
    '(PASSPORT) Tj',
    '0 -36 Td',
    '(Surname: ADEYEMI) Tj',
    '0 -22 Td',
    '(Given names: MODO) Tj',
    '0 -22 Td',
    '(Passport No: E12345678) Tj',
    '0 -22 Td',
    '(Nationality: EXAMPLE) Tj',
    '0 -22 Td',
    '(Date of birth: 14 MAR 1992) Tj',
    '0 -22 Td',
    '(Date of expiry: 01 JAN 2031) Tj',
    '0 -22 Td',
    '(Document type: Identity) Tj',
    'ET',
  ].join('\n');
  const stream = `${content}\n`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xrefAt = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return new TextEncoder().encode(body + xref + trailer);
}
