/** 20 MB per file. */
export const MAX_EVIDENCE_BYTES = 20 * 1024 * 1024;

type Kind = { mime: string; check: (b: Buffer) => boolean };

const starts = (sig: number[]) => (b: Buffer) => sig.every((byte, i) => b[i] === byte);
const zip = starts([0x50, 0x4b, 0x03, 0x04]); // docx, xlsx and pptx are zip files
const text = (b: Buffer) => !b.subarray(0, 8192).includes(0);

/** Allowed evidence files by extension, each with a check of the file's first bytes. */
export const EVIDENCE_TYPES: Record<string, Kind> = {
  pdf: { mime: 'application/pdf', check: starts([0x25, 0x50, 0x44, 0x46]) },
  png: { mime: 'image/png', check: starts([0x89, 0x50, 0x4e, 0x47]) },
  jpg: { mime: 'image/jpeg', check: starts([0xff, 0xd8, 0xff]) },
  jpeg: { mime: 'image/jpeg', check: starts([0xff, 0xd8, 0xff]) },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', check: zip },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', check: zip },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', check: zip },
  txt: { mime: 'text/plain', check: text },
  csv: { mime: 'text/csv', check: text },
};

/** The type of an upload, or null when its name or content is not allowed. */
export function evidenceType(fileName: string, data: Buffer) {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  const kind = Object.hasOwn(EVIDENCE_TYPES, ext) ? EVIDENCE_TYPES[ext] : undefined;
  return kind && data.length > 0 && kind.check(data) ? kind.mime : null;
}

/** Multer decodes names as latin1; browsers send UTF-8. Also drops paths and control characters. */
export function cleanFileName(raw: string) {
  const utf8 = Buffer.from(raw, 'latin1').toString('utf8');
  const base = utf8.split(/[\\/]/).pop() ?? '';
  // oxlint-disable-next-line no-control-regex -- removing control characters is the point
  return base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200) || 'file';
}
