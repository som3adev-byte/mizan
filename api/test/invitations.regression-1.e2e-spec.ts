import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { encryptSecret, hashPassword } from '../src/auth/crypto.js';
import { currentStep, generateTotpSecret, totpAt } from '../src/auth/totp.js';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_MIGRATE_DATABASE_URL;
if (!process.env.DATABASE_URL || !OWNER_URL) throw new Error('Test database URLs are not set (see api/.env.example)');

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const run = Date.now().toString(36);
const mail = (name: string) => `${name}+invite-reg-${run}@test.invalid`;

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: OWNER_URL }) });
let app: INestApplication;
type Agent = ReturnType<typeof request.agent>;
const secrets = new Map<string, string>();

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

// Regression: ISSUE-001 — an invitation was created for a malformed email ("not-an-email")
// Found by /qa on 2026-09-24
// Report: .gstack/qa-reports/qa-report-localhost-2026-09-24.md

let entityA: string;
let adminA: Agent;

beforeAll(async () => {
  const { AppModule } = await import('../src/app.module.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  entityA = (await owner.entity.create({ data: { name: `جهة الدعوات ${run}` } })).id;
  await seedUser(entityA, 'admin', 'ADMIN');
  adminA = await signIn(mail('admin'));
});

afterAll(async () => {
  await app.close();
  await owner.$disconnect();
});

describe('invitation email', () => {
  it.each(['not-an-email', 'a@b', '@example.com', 'name@', 'two words@example.com', `${'x'.repeat(250)}@example.com`])(
    'rejects %s and creates nothing',
    async (email) => {
      expect((await post(adminA, '/auth/invitations', { email, role: 'CONTROL_OWNER' }).expect(400)).body.code).toBe('invalid_input');
    },
  );

  it('still accepts a normal address, trimmed and lower-cased', async () => {
    await post(adminA, '/auth/invitations', { email: `  New.Person+${run}@Example.gov.sa `, role: 'CONTROL_OWNER' }).expect(201);
    const invitations = await owner.invitation.findMany({ where: { entityId: entityA } });
    expect(invitations.map((i) => i.email)).toEqual([`new.person+${run}@example.gov.sa`]);
  });
});
