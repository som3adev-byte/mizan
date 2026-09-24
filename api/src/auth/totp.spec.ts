import { base32Decode, base32Encode, totpAt, verifyTotp } from './totp.js';

// RFC 6238, Appendix B (SHA-1). The RFC prints 8 digits; we use the last 6.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
const vectors: Array<[number, string]> = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
];

describe('totp', () => {
  it.each(vectors)('matches RFC 6238 at t=%i', (seconds, code) => {
    expect(totpAt(RFC_SECRET, Math.floor(seconds / 30))).toBe(code);
  });

  it('round-trips base32', () => {
    const bytes = Buffer.from('hello mizan');
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  });

  it('accepts up to two steps of drift and returns the matched step', () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 1000 / 30);
    expect(verifyTotp(totpAt(RFC_SECRET, step - 2), RFC_SECRET, now)).toBe(step - 2);
    expect(verifyTotp(totpAt(RFC_SECRET, step - 1), RFC_SECRET, now)).toBe(step - 1);
    expect(verifyTotp(totpAt(RFC_SECRET, step + 1), RFC_SECRET, now)).toBe(step + 1);
    expect(verifyTotp(totpAt(RFC_SECRET, step + 2), RFC_SECRET, now)).toBe(step + 2);
    expect(verifyTotp(totpAt(RFC_SECRET, step + 3), RFC_SECRET, now)).toBeNull();
  });

  it('rejects malformed codes', () => {
    expect(verifyTotp('12345', RFC_SECRET)).toBeNull();
    expect(verifyTotp('abcdef', RFC_SECRET)).toBeNull();
  });
});
