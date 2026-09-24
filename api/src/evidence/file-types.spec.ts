import { cleanFileName, evidenceType } from './file-types.js';

describe('evidence file checks', () => {
  it('accepts a file whose content matches its extension', () => {
    expect(evidenceType('policy.pdf', Buffer.from('%PDF-1.7 ...'))).toBe('application/pdf');
    expect(evidenceType('list.CSV', Buffer.from('a,b\n1,2'))).toBe('text/csv');
  });

  it('rejects renamed, empty or unlisted files', () => {
    expect(evidenceType('policy.pdf', Buffer.from('MZ\x90\x00'))).toBeNull();
    expect(evidenceType('notes.txt', Buffer.from([0x41, 0x00, 0x42]))).toBeNull();
    expect(evidenceType('run.exe', Buffer.from('MZ'))).toBeNull();
    expect(evidenceType('empty.pdf', Buffer.alloc(0))).toBeNull();
    expect(evidenceType('constructor', Buffer.from('x'))).toBeNull();
  });

  it('restores UTF-8 names and strips paths', () => {
    const latin1 = Buffer.from('سياسة.pdf', 'utf8').toString('latin1');
    expect(cleanFileName(latin1)).toBe('سياسة.pdf');
    expect(cleanFileName('..\\..\\evil\u0000.pdf')).toBe('evil.pdf');
  });
});
