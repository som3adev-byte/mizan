import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { encryptSecret, hashPassword, hashToken, newToken } from '../src/auth/crypto.js';
import { currentStep, generateTotpSecret, totpAt } from '../src/auth/totp.js';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_MIGRATE_DATABASE_URL;
if (!process.env.DATABASE_URL || !OWNER_URL) throw new Error('Test database URLs are not set (see api/.env.example)');

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const run = Date.now().toString(36);
const mail = (name: string) => `${name}+users-${run}@test.invalid`;

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: OWNER_URL }) });
let app: INestApplication;
type Agent = ReturnType<typeof request.agent>;
const secrets = new Map<string, string>();

/** Creates a ready user (password + MFA on) straight in the database. */
async function seedUser(entityId: string, name: string, role: 'ADMIN' | 'CONTROL_OWNER' | 'EXECUTIVE' | 'AUDITOR') {
  const secret = generateTotpSecret();
  const user = await owner.user.create({
    data: { entityId, email: mail(name), name, role, passwordHash: await hashPassword(PASSWORD), mfaEnabled: true, mfaSecret: encryptSecret(secret) },
  });
  secrets.set(user.email, secret);
  return user;
}

async function signIn(email: string): Promise<Agent> {
  await owner.user.update({ where: { email }, data: { mfaLastStep: null } });
  const agent = request.agent(app.getHttpServer());
  await agent.post('/auth/login').set('Origin', ORIGIN).send({ email, password: PASSWORD }).expect(200);
  await agent.post('/auth/mfa/verify').set('Origin', ORIGIN).send({ code: totpAt(secrets.get(email)!, currentStep()) }).expect(204);
  return agent;
}

const post = (agent: Agent, path: string, body: object = {}) => agent.post(path).set('Origin', ORIGIN).send(body);

let entityA: string;
let entityB: string;
let adminA: Agent;
let auditorId: string;
let ownerId: string;
let outsiderId: string;

beforeAll(async () => {
  const { AppModule } = await import('../src/app.module.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();

  entityA = (await owner.entity.create({ data: { name: `جهة المستخدمين أ ${run}` } })).id;
  entityB = (await owner.entity.create({ data: { name: `جهة المستخدمين ب ${run}` } })).id;
  await seedUser(entityA, 'admin', 'ADMIN');
  auditorId = (await seedUser(entityA, 'auditor', 'AUDITOR')).id;
  ownerId = (await seedUser(entityA, 'owner', 'CONTROL_OWNER')).id;
  outsiderId = (await seedUser(entityB, 'outsider', 'ADMIN')).id;
  await owner.invitation.create({
    data: { tokenHash: hashToken(newToken()), entityId: entityA, email: mail('pending'), role: 'EXECUTIVE', expiresAt: new Date(Date.now() + 60_000) },
  });
  adminA = await signIn(mail('admin'));
});

afterAll(async () => {
  await app.close();
  await owner.$disconnect();
});

describe('who may see the list', () => {
  it('shows the Admin their entity’s people and pending invitations only', async () => {
    const { body } = await adminA.get('/users').expect(200);
    const emails = body.users.map((u: { email: string }) => u.email);
    expect(emails).toEqual(expect.arrayContaining([mail('admin'), mail('auditor'), mail('owner')]));
    expect(emails).not.toContain(mail('outsider'));
    expect(body.invitations.map((i: { email: string }) => i.email)).toEqual([mail('pending')]);
    expect(JSON.stringify(body)).not.toMatch(/password|mfaSecret/i);
  });

  it('lets an Auditor look but not change anything', async () => {
    const auditor = await signIn(mail('auditor'));
    await auditor.get('/users').expect(200);
    await post(auditor, `/users/${ownerId}/role`, { role: 'ADMIN' }).expect(403);
    await post(auditor, `/users/${ownerId}/disable`).expect(403);
  });

  it('keeps everyone else out', async () => {
    const controlOwner = await signIn(mail('owner'));
    await controlOwner.get('/users').expect(403);
  });
});

describe('changes by the Admin', () => {
  it('cannot change their own role or disable themselves', async () => {
    const me = (await adminA.get('/auth/me').expect(200)).body;
    expect((await post(adminA, `/users/${me.id}/role`, { role: 'AUDITOR' }).expect(409)).body.code).toBe('cannot_change_self');
    expect((await post(adminA, `/users/${me.id}/disable`).expect(409)).body.code).toBe('cannot_change_self');
  });

  it('changes a role and records it in the audit log', async () => {
    await post(adminA, `/users/${auditorId}/role`, { role: 'EXECUTIVE' }).expect(204);
    expect((await owner.user.findUniqueOrThrow({ where: { id: auditorId } })).role).toBe('EXECUTIVE');
    const entry = await owner.auditLog.findFirst({ where: { entityId: entityA, action: 'user.role_changed', target: auditorId } });
    expect(entry?.meta).toMatchObject({ from: 'AUDITOR', to: 'EXECUTIVE' });
  });

  it('disabling signs the person out everywhere and blocks sign-in; enabling restores it', async () => {
    const victim = await signIn(mail('owner'));
    await victim.get('/auth/me').expect(200);

    await post(adminA, `/users/${ownerId}/disable`).expect(204);
    await victim.get('/auth/me').expect(401);
    await post(request.agent(app.getHttpServer()), '/auth/login', { email: mail('owner'), password: PASSWORD }).expect(401);

    await post(adminA, `/users/${ownerId}/enable`).expect(204);
    await signIn(mail('owner'));
  });

  it('cannot touch a user from another entity', async () => {
    await post(adminA, `/users/${outsiderId}/disable`).expect(404);
    await post(adminA, `/users/${outsiderId}/role`, { role: 'AUDITOR' }).expect(404);
    const outsider = await owner.user.findUniqueOrThrow({ where: { id: outsiderId } });
    expect(outsider).toMatchObject({ status: 'ACTIVE', role: 'ADMIN', entityId: entityB });
  });

  it('revokes a pending invitation once', async () => {
    const [invitation] = (await adminA.get('/users').expect(200)).body.invitations;
    await post(adminA, `/users/invitations/${invitation.id}/revoke`).expect(204);
    await post(adminA, `/users/invitations/${invitation.id}/revoke`).expect(404);
  });

  it('treats a malformed id as not found', async () => {
    await post(adminA, '/users/not-a-uuid/disable').expect(404);
  });
});
