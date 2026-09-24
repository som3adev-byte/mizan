import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashToken, newToken } from '../src/auth/crypto.js';
import { currentStep, totpAt } from '../src/auth/totp.js';

// The API under test connects to the test database as mizan_app.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_MIGRATE_DATABASE_URL;
if (!process.env.DATABASE_URL || !OWNER_URL) throw new Error('Test database URLs are not set (see api/.env.example)');

const ORIGIN = 'http://localhost:3000';
const run = Date.now().toString(36);
const mail = (name: string) => `${name}+${run}@test.invalid`;
const PASSWORD = 'correct horse battery staple';

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: OWNER_URL }) });
let app: INestApplication;
let entityId: string;
/** The Admin's TOTP secret, set when the Admin enrolls. */
const adminMfa: { secret?: string } = {};

async function invite(email: string, role: 'ADMIN' | 'AUDITOR') {
  const token = newToken();
  await owner.invitation.create({
    data: { tokenHash: hashToken(token), entityId, email, role, expiresAt: new Date(Date.now() + 60_000) },
  });
  return token;
}

const post = (agent: ReturnType<typeof request.agent>, path: string, body: object = {}) =>
  agent.post(path).set('Origin', ORIGIN).send(body);

/** Signs in and passes MFA; returns an agent carrying the session cookie. */
async function signedIn(email: string, secretRef: { secret?: string }) {
  const agent = request.agent(app.getHttpServer());
  const login = await post(agent, '/auth/login', { email, password: PASSWORD }).expect(200);
  if (login.body.next === 'mfa_enroll') {
    const { body } = await post(agent, '/auth/mfa/enroll').expect(200);
    secretRef.secret = body.secret;
    await post(agent, '/auth/mfa/enroll/confirm', { code: totpAt(body.secret, currentStep()) }).expect(204);
  } else {
    await post(agent, '/auth/mfa/verify', { code: totpAt(secretRef.secret!, currentStep() + 1) }).expect(204);
  }
  return agent;
}

beforeAll(async () => {
  const { AppModule } = await import('../src/app.module.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  entityId = (await owner.entity.create({ data: { name: `جهة الدخول ${run}` } })).id;
});

afterAll(async () => {
  await app.close();
  await owner.$disconnect();
});

describe('invitations', () => {
  it('rejects a short password and an unknown token', async () => {
    const token = await invite(mail('short'), 'AUDITOR');
    const agent = request.agent(app.getHttpServer());
    const weak = await post(agent, '/auth/invitations/accept', { token, name: 'x', password: 'short' }).expect(400);
    expect(weak.body.code).toBe('weak_password');
    const unknown = await post(agent, '/auth/invitations/accept', { token: newToken(), name: 'x', password: PASSWORD }).expect(410);
    expect(unknown.body.code).toBe('invalid_invitation');
  });

  it('accepts once and never twice', async () => {
    const token = await invite(mail('admin'), 'ADMIN');
    const agent = request.agent(app.getHttpServer());
    await post(agent, '/auth/invitations/accept', { token, name: 'مدير الاختبار', password: PASSWORD }).expect(200);
    await post(agent, '/auth/invitations/accept', { token, name: 'مرة ثانية', password: PASSWORD }).expect(410);
  });
});

describe('sign-in', () => {
  it('gives the same answer for a wrong password and an unknown email', async () => {
    const agent = request.agent(app.getHttpServer());
    const wrong = await post(agent, '/auth/login', { email: mail('admin'), password: 'wrong password here' }).expect(401);
    const unknown = await post(agent, '/auth/login', { email: mail('nobody'), password: PASSWORD }).expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.code).toBe('invalid_credentials');
  });

  it('requires MFA enrollment before anything else', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await post(agent, '/auth/login', { email: mail('admin'), password: PASSWORD }).expect(200);
    expect(login.body.next).toBe('mfa_enroll');
    expect(login.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);

    const blocked = await agent.get('/auth/me').expect(401);
    expect(blocked.body.code).toBe('mfa_required');

    const { body } = await post(agent, '/auth/mfa/enroll').expect(200);
    expect(body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    const bad = await post(agent, '/auth/mfa/enroll/confirm', { code: '000000' }).expect(400);
    expect(bad.body.code).toBe('invalid_code');

    adminMfa.secret = body.secret;
    await post(agent, '/auth/mfa/enroll/confirm', { code: totpAt(body.secret, currentStep()) }).expect(204);

    const me = await agent.get('/auth/me').expect(200);
    expect(me.body).toMatchObject({ email: mail('admin'), role: 'ADMIN', entity: { id: entityId } });
  });

  it('rejects a replayed code and accepts a fresh one', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await post(agent, '/auth/login', { email: mail('admin'), password: PASSWORD }).expect(200);
    expect(login.body.next).toBe('mfa_verify');

    const replay = await post(agent, '/auth/mfa/verify', { code: totpAt(adminMfa.secret!, currentStep()) }).expect(400);
    expect(replay.body.code).toBe('invalid_code');
    await post(agent, '/auth/mfa/verify', { code: totpAt(adminMfa.secret!, currentStep() + 1) }).expect(204);
    await agent.get('/auth/me').expect(200);
  });

  it('ends the session on logout', async () => {
    await owner.user.updateMany({ where: { email: mail('admin') }, data: { mfaLastStep: null } });
    const agent = await signedIn(mail('admin'), adminMfa);
    await post(agent, '/auth/logout').expect(204);
    await agent.get('/auth/me').expect(401);
  });

  it('locks the account after five wrong passwords', async () => {
    const token = await invite(mail('locked'), 'AUDITOR');
    const agent = request.agent(app.getHttpServer());
    await post(agent, '/auth/invitations/accept', { token, name: 'مدقق', password: PASSWORD }).expect(200);
    for (let i = 0; i < 5; i++) {
      await post(agent, '/auth/login', { email: mail('locked'), password: 'not the password' }).expect(401);
    }
    const locked = await post(agent, '/auth/login', { email: mail('locked'), password: PASSWORD }).expect(429);
    expect(locked.body.code).toBe('account_locked');
  });
});

describe('guards', () => {
  it('lets only an Admin invite people', async () => {
    const auditorMfa: { secret?: string } = {};
    const token = await invite(mail('auditor'), 'AUDITOR');
    await post(request.agent(app.getHttpServer()), '/auth/invitations/accept', { token, name: 'مدقق', password: PASSWORD }).expect(200);
    const auditor = await signedIn(mail('auditor'), auditorMfa);
    await post(auditor, '/auth/invitations', { email: mail('new'), role: 'AUDITOR' }).expect(403);

    await owner.user.updateMany({ where: { email: mail('admin') }, data: { mfaLastStep: null } });
    const admin = await signedIn(mail('admin'), adminMfa);
    const invited = await post(admin, '/auth/invitations', { email: mail('new'), role: 'AUDITOR' }).expect(201);
    expect(invited.body.token).toEqual(expect.any(String));
    const taken = await post(admin, '/auth/invitations', { email: mail('auditor'), role: 'AUDITOR' }).expect(409);
    expect(taken.body.code).toBe('email_taken');
  });

  it('blocks cross-site and non-JSON writes (CSRF)', async () => {
    const agent = request.agent(app.getHttpServer());
    const evil = await agent.post('/auth/login').set('Origin', 'https://evil.example').send({ email: 'a', password: 'b' }).expect(403);
    expect(evil.body.code).toBe('bad_origin');
    const form = await agent.post('/auth/login').set('Origin', ORIGIN).type('form').send('email=a&password=b').expect(403);
    expect(form.body.code).toBe('json_required');
  });

  it('keeps the health check public', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { ok: true });
  });
});

describe('audit log', () => {
  it('recorded the sign-in events and cannot be changed', async () => {
    const actions = (await owner.auditLog.findMany({ where: { entityId } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['auth.login_failed', 'auth.mfa_enrolled', 'auth.login_succeeded', 'auth.logout', 'auth.account_locked']));
    await expect(owner.auditLog.updateMany({ where: { entityId }, data: { action: 'edited' } })).rejects.toThrow();
    await expect(owner.auditLog.deleteMany({ where: { entityId } })).rejects.toThrow();
  });
});
