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
const mail = (name: string) => `${name}+tasks-${run}@test.invalid`;

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

let entityA: string;
let adminA: Agent;
let ownerA: Agent;
let ownerId: string;
let owner2Id: string;
let outsiderId: string;

beforeAll(async () => {
  const { AppModule } = await import('../src/app.module.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();

  entityA = (await owner.entity.create({ data: { name: `جهة المهام أ ${run}` } })).id;
  const entityB = (await owner.entity.create({ data: { name: `جهة المهام ب ${run}` } })).id;
  await seedUser(entityA, 'admin', 'ADMIN');
  ownerId = (await seedUser(entityA, 'owner', 'CONTROL_OWNER')).id;
  owner2Id = (await seedUser(entityA, 'owner2', 'CONTROL_OWNER')).id;
  await seedUser(entityA, 'auditor', 'AUDITOR');
  outsiderId = (await seedUser(entityB, 'outsider', 'CONTROL_OWNER')).id;
  await seedUser(entityB, 'adminb', 'ADMIN');
  await owner.controlStatus.create({ data: { entityId: entityA, controlCode: '2-10-3', ownerId, status: 'NON_COMPLIANT' } });
  adminA = await signIn(mail('admin'));
  ownerA = await signIn(mail('owner'));
});

afterAll(async () => {
  await app.close();
  await owner.$disconnect();
});

let taskId: string;

describe('planning remediation', () => {
  it('lets the control’s owner add steps, and audits them', async () => {
    const { body } = await post(ownerA, '/tasks', { controlCode: '2-10-3', title: 'تفعيل الفحص الأسبوعي للثغرات', ownerId: owner2Id, dueDate: '2026-10-31' }).expect(201);
    expect(body).toMatchObject({ controlCode: '2-10-3', owner: { id: owner2Id }, dueDate: '2026-10-31', done: false });
    taskId = body.id;
    expect(await owner.auditLog.count({ where: { entityId: entityA, action: 'task.created', target: '2-10-3' } })).toBe(1);
  });

  it('refuses controls that are not theirs, owners from elsewhere, and bad input', async () => {
    await post(ownerA, '/tasks', { controlCode: '1-1-1', title: 'خطوة' }).expect(403);
    await post(await signIn(mail('auditor')), '/tasks', { controlCode: '2-10-3', title: 'خطوة' }).expect(403);
    expect((await post(adminA, '/tasks', { controlCode: '2-10-3', title: 'خطوة', ownerId: outsiderId }).expect(422)).body.code).toBe('invalid_owner');
    await post(adminA, '/tasks', { controlCode: '2-10-3', title: 'x' }).expect(400);
    await post(adminA, '/tasks', { controlCode: '2-10-3', title: 'خطوة', done: true }).expect(400);
    await post(adminA, '/tasks', { controlCode: '9-9-9', title: 'خطوة' }).expect(404);
  });
});

describe('working the plan', () => {
  it('lets the step’s owner mark it done and reopen it, but not edit it', async () => {
    const owner2 = await signIn(mail('owner2'));
    expect((await post(owner2, `/tasks/${taskId}`, { done: true }).expect(200)).body.done).toBe(true);
    expect(await owner.auditLog.count({ where: { entityId: entityA, action: 'task.done' } })).toBe(1);
    await post(owner2, `/tasks/${taskId}`, { title: 'عنوان آخر' }).expect(403);
    await post(owner2, `/tasks/${taskId}/remove`).expect(403);
    expect((await post(owner2, `/tasks/${taskId}`, { done: false }).expect(200)).body.done).toBe(false);
  });

  it('lists open steps for everyone, and "mine" for the step owner', async () => {
    const all = (await (await signIn(mail('auditor'))).get('/tasks').expect(200)).body;
    expect(all.map((t: { id: string }) => t.id)).toEqual([taskId]);
    expect((await ownerA.get('/tasks?mine=1').expect(200)).body).toEqual([]);
    expect((await (await signIn(mail('owner2'))).get('/tasks?mine=1').expect(200)).body).toHaveLength(1);
  });

  it('keeps another entity out', async () => {
    const adminB = await signIn(mail('adminb'));
    expect((await adminB.get('/tasks').expect(200)).body).toEqual([]);
    await post(adminB, `/tasks/${taskId}`, { done: true }).expect(404);
  });

  it('planners remove steps; the row is kept', async () => {
    await post(ownerA, `/tasks/${taskId}/remove`).expect(204);
    expect((await adminA.get('/tasks').expect(200)).body).toEqual([]);
    expect((await owner.remediationTask.findUniqueOrThrow({ where: { id: taskId } })).removedAt).not.toBeNull();
  });
});
