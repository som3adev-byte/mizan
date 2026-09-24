import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, hashPassword, hashToken, verifyPassword } from './crypto.js';

// The test brings its own key instead of relying on a local .env.
process.env.MFA_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');

describe('crypto', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const stored = await hashPassword('كلمة مرور طويلة 123');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('كلمة مرور طويلة 123', stored)).toBe(true);
    expect(await verifyPassword('كلمة مرور طويلة 124', stored)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same password here')).not.toBe(await hashPassword('same password here'));
  });

  it('hashes tokens deterministically', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('encrypts MFA secrets so they round-trip and fail when tampered', () => {
    const sealed = encryptSecret('JBSWY3DPEHPK3PXP');
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(sealed)).toBe('JBSWY3DPEHPK3PXP');
    const parts = sealed.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });
});
