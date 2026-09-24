import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { encryptSecret, hashPassword } from '../src/auth/crypto.js';
import { currentStep, generateTotpSecret, totpAt } from '../src/auth/totp.js';
import { riyadhToday } from '../src/alerts/alerts.service.js';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_MIGRATE_DATABASE_URL;
if (!process.env.DATABASE_URL || !OWNER_URL) throw new Error('Test database URLs are not set (see api/.env.example)');

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const run = Date.now().toString(36);
const mail = (name: string) => `${name}+alerts-${run}@test.invalid`;

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


const day = (offset: number) => new Date(riyadhToday().getTime() + offset * 86_400_000);

let adminA: Agent;
let ownerA: Agent;

beforeAll(async () => {
  const { AppModule } = await import('../src/app.module.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();

  const entityA = (await owner.entity.create({ data: { name: `جهة التنبيهات أ ${run}` } })).id;
  const entityB = (await owner.entity.create({ data: { name: `جهة التنبيهات ب ${run}` } })).id;
  const admin = await seedUser(entityA, 'admin', 'ADMIN');
  const me = await seedUser(entityA, 'owner', 'CONTROL_OWNER');
  const other = await seedUser(entityA, 'owner2', 'CONTROL_OWNER');
  await seedUser(entityB, 'adminb', 'ADMIN');

  await owner.controlStatus.createMany({
    data: [
      { entityId: entityA, controlCode: '1-1-1', status: 'PARTIAL', ownerId: me.id, dueDate: day(-5) }, // overdue
      { entityId: entityA, controlCode: '1-1-2', status: 'NON_COMPLIANT', ownerId: other.id, dueDate: day(40) }, // gap, due later
      { entityId: entityA, controlCode: '1-1-3', status: 'PARTIAL', ownerId: other.id, dueDate: day(3) }, // due soon
      { entityId: entityA, controlCode: '1-2-1', status: 'COMPLIANT', ownerId: me.id, dueDate: day(-9) }, // done: no alert
      { entityId: entityA, controlCode: '1-2-2', status: 'PARTIAL', ownerId: me.id, dueDate: day(60) }, // far: no alert
      { entityId: entityB, controlCode: '1-1-1', status: 'NON_COMPLIANT' }, // other entity
    ],
  });
  await owner.remediationTask.createMany({
    data: [
      { entityId: entityA, controlCode: '1-1-2', title: 'خطوة متأخرة', ownerId: me.id, dueDate: day(-1), createdById: admin.id },
      { entityId: entityA, controlCode: '1-1-2', title: 'خطوة منجزة', ownerId: me.id, dueDate: day(-1), doneAt: new Date(), createdById: admin.id },
    ],
  });
  await owner.evidence.createMany({
    data: [
      { entityId: entityA, controlCode: '1-2-2', title: 'شهادة منتهية', fileName: 'a.pdf', mimeType: 'application/pdf', size: 1, sha256: 'x', storageKey: `${entityA}/a-${run}`, expiresOn: day(-2), uploadedById: me.id },
      { entityId: entityA, controlCode: '1-2-2', title: 'شهادة تنتهي قريبًا', fileName: 'b.pdf', mimeType: 'application/pdf', size: 1, sha256: 'x', storageKey: `${entityA}/b-${run}`, expiresOn: day(20), uploadedById: me.id },
    ],
  });
  adminA = await signIn(mail('admin'));
  ownerA = await signIn(mail('owner'));
});

afterAll(async () => {
  await app.close();
  await owner.$disconnect();
});

type Alerts = { high: number; alerts: { kind: string; severity: string; controlCode: string; days: number | null; title: string | null }[] };

describe('alerts', () => {
  it('derives every kind from the current state, most urgent first', async () => {
    const body = (await adminA.get('/alerts').expect(200)).body as Alerts;
    expect(body.alerts.map((a) => [a.kind, a.controlCode, a.days])).toEqual([
      ['control_overdue', '1-1-1', 5],
      ['evidence_expired', '1-2-2', 2],
      ['task_overdue', '1-1-2', 1],
      ['control_gap', '1-1-2', 40],
      ['control_due_soon', '1-1-3', 3],
      ['evidence_expiring', '1-2-2', 20],
    ]);
    expect(body.high).toBe(4);
  });

  it('shows a Control Owner only what concerns them', async () => {
    const body = (await ownerA.get('/alerts').expect(200)).body as Alerts;
    // Their overdue control, their overdue step (on someone else's control), their uploads' expiry.
    expect(body.alerts.map((a) => a.kind).sort()).toEqual(['control_overdue', 'evidence_expired', 'evidence_expiring', 'task_overdue']);
  });

  it('keeps another entity out', async () => {
    const body = (await (await signIn(mail('adminb'))).get('/alerts').expect(200)).body as Alerts;
    expect(body.alerts.map((a) => a.kind)).toEqual(['control_gap']);
  });
});
