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
const mail = (name: string) => `${name}+audit-${run}@test.invalid`;

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


let entityA: string;
let entityB: string;
let adminA: Agent;

beforeAll(async () => {
  const { AppModule } = await import('../src/app.module.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();

  entityA = (await owner.entity.create({ data: { name: `جهة السجل أ ${run}` } })).id;
  entityB = (await owner.entity.create({ data: { name: `جهة السجل ب ${run}` } })).id;
  await seedUser(entityA, 'admin', 'ADMIN');
  await seedUser(entityA, 'auditor', 'AUDITOR');
  await seedUser(entityA, 'owner', 'CONTROL_OWNER');
  await seedUser(entityB, 'adminb', 'ADMIN');
  // 60 old control events for A, and one for B that A must never see.
  await owner.auditLog.createMany({
    data: Array.from({ length: 60 }, (_, i) => ({ entityId: entityA, action: 'control.updated', target: `1-1-${(i % 3) + 1}`, meta: { n: i } })),
  });
  await owner.auditLog.create({ data: { entityId: entityB, action: 'control.updated', target: '9-9-9', meta: { secret: true } } });
  adminA = await signIn(mail('admin'));
});

afterAll(async () => {
  await app.close();
  await owner.$disconnect();
});

type Page = { entries: { id: string; action: string; target: string | null; actorId: string | null }[]; people: Record<string, string>; nextBefore: string | null };

describe('the audit log', () => {
  it('pages through the entity’s own entries, newest first', async () => {
    const first = (await adminA.get('/audit-log?category=control').expect(200)).body as Page;
    expect(first.entries).toHaveLength(50);
    expect(first.nextBefore).not.toBeNull();
    const ids = first.entries.map((e) => BigInt(e.id));
    expect([...ids].sort((a, b) => (a > b ? -1 : 1))).toEqual(ids);

    const second = (await adminA.get(`/audit-log?category=control&before=${first.nextBefore}`).expect(200)).body as Page;
    expect(second.entries).toHaveLength(10);
    expect(second.nextBefore).toBeNull();
    const all = [...first.entries, ...second.entries];
    expect(all.every((e) => e.target !== '9-9-9')).toBe(true);
  });

  it('filters by category and names the people involved', async () => {
    const page = (await adminA.get('/audit-log?category=auth').expect(200)).body as Page;
    expect(page.entries.length).toBeGreaterThan(0);
    expect(page.entries.every((e) => e.action.startsWith('auth.'))).toBe(true);
    const actor = page.entries.find((e) => e.actorId)!.actorId!;
    expect(page.people[actor]).toBe('admin');
  });

  it('is for Admins and Auditors only, and cannot be changed', async () => {
    await (await signIn(mail('auditor'))).get('/audit-log').expect(200);
    await (await signIn(mail('owner'))).get('/audit-log').expect(403);
    await adminA.post('/audit-log').set('Origin', ORIGIN).send({}).expect(404);
    await adminA.delete('/audit-log').set('Origin', ORIGIN).expect(404);
  });

  it('rejects bad paging input', async () => {
    await adminA.get('/audit-log?before=abc').expect(400);
    await adminA.get('/audit-log?category=secrets').expect(400);
  });
});
