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
const mail = (name: string) => `${name}+controls-${run}@test.invalid`;

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

type Control = { code: string; textEn: string | null; status: string; owner: { id: string; name: string } | null; dueDate: string | null; subcontrols: { code: string; textEn: string | null }[] };
type Listing = {
  summary: { total: number; score: number | null; counts: Record<string, number> };
  domains: { code: string; summary: { total: number }; subdomains: { code: string; controls: Control[] }[] }[];
};
const controlsOf = (body: Listing) => body.domains.flatMap((d) => d.subdomains.flatMap((s) => s.controls));
const find = (body: Listing, code: string) => controlsOf(body).find((c) => c.code === code)!;

let entityA: string;
let entityB: string;
let adminA: Agent;
let adminB: Agent;
let controlOwnerId: string;
let otherOwnerId: string;
let outsiderId: string;

beforeAll(async () => {
  const { AppModule } = await import('../src/app.module.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();

  entityA = (await owner.entity.create({ data: { name: `جهة الضوابط أ ${run}` } })).id;
  entityB = (await owner.entity.create({ data: { name: `جهة الضوابط ب ${run}` } })).id;
  await seedUser(entityA, 'admin', 'ADMIN');
  await seedUser(entityA, 'executive', 'EXECUTIVE');
  await seedUser(entityA, 'auditor', 'AUDITOR');
  controlOwnerId = (await seedUser(entityA, 'owner', 'CONTROL_OWNER')).id;
  otherOwnerId = (await seedUser(entityA, 'owner2', 'CONTROL_OWNER')).id;
  outsiderId = (await seedUser(entityB, 'outsider', 'CONTROL_OWNER')).id;
  await seedUser(entityB, 'adminb', 'ADMIN');
  adminA = await signIn(mail('admin'));
  adminB = await signIn(mail('adminb'));
});

afterAll(async () => {
  await app.close();
  await owner.$disconnect();
});

describe('the catalog', () => {
  it('lists all 108 main controls with their 92 subcontrols, not started', async () => {
    const body = (await adminA.get('/controls').expect(200)).body as Listing;
    expect(body.domains.map((d) => d.code)).toEqual(['1', '2', '3', '4']);
    expect(body.domains.flatMap((d) => d.subdomains)).toHaveLength(28);
    const controls = controlsOf(body);
    expect(controls).toHaveLength(108);
    expect(controls.flatMap((c) => c.subcontrols)).toHaveLength(92);
    expect(body.summary).toMatchObject({ total: 108, score: 0, counts: { NOT_STARTED: 108 } });
    expect(find(body, '1-5-3').subcontrols.map((s) => s.code)).toEqual(['1-5-3-1', '1-5-3-2', '1-5-3-3', '1-5-3-4']);
    expect(controls.every((c) => c.textEn && c.subcontrols.every((s) => s.textEn))).toBe(true);
  });

  it('is readable by every role', async () => {
    for (const name of ['executive', 'auditor', 'owner']) {
      await (await signIn(mail(name))).get('/controls').expect(200);
    }
  });
});

describe('updates by the Admin', () => {
  it('assigns an owner and a due date, sets a status, and records it', async () => {
    await post(adminA, '/controls/2-9-3', { ownerId: controlOwnerId, dueDate: '2026-12-31', status: 'PARTIAL' }).expect(204);
    const body = (await adminA.get('/controls').expect(200)).body as Listing;
    expect(find(body, '2-9-3')).toMatchObject({ status: 'PARTIAL', owner: { id: controlOwnerId, name: 'owner' }, dueDate: '2026-12-31' });
    expect(body.summary.counts).toMatchObject({ PARTIAL: 1, NOT_STARTED: 107 });

    const entry = await owner.auditLog.findFirst({ where: { entityId: entityA, action: 'control.updated', target: '2-9-3' } });
    expect(entry?.meta).toMatchObject({ before: { status: 'NOT_STARTED', ownerId: null }, change: { status: 'PARTIAL' } });
  });

  it('keeps one entity’s progress away from another', async () => {
    const body = (await adminB.get('/controls').expect(200)).body as Listing;
    expect(find(body, '2-9-3')).toMatchObject({ status: 'NOT_STARTED', owner: null, dueDate: null });
  });

  it('cannot assign a user from another entity, or someone who cannot own controls', async () => {
    expect((await post(adminA, '/controls/2-9-4', { ownerId: outsiderId }).expect(422)).body.code).toBe('invalid_owner');
    const executive = await owner.user.findUniqueOrThrow({ where: { email: mail('executive') } });
    expect((await post(adminA, '/controls/2-9-4', { ownerId: executive.id }).expect(422)).body.code).toBe('invalid_owner');
  });

  it('rejects subcontrols, unknown codes and bad input', async () => {
    await post(adminA, '/controls/1-5-3-1', { status: 'COMPLIANT' }).expect(404);
    await post(adminA, '/controls/9-9-9', { status: 'COMPLIANT' }).expect(404);
    await post(adminA, '/controls/1-1-1', { status: 'DONE' }).expect(400);
    await post(adminA, '/controls/1-1-1', { dueDate: '31/12/2026' }).expect(400);
    await post(adminA, '/controls/1-1-1', { ownerId: 'x' }).expect(400);
    await post(adminA, '/controls/1-1-1', { note: 'hi' }).expect(400);
    await post(adminA, '/controls/1-1-1', {}).expect(400);
  });
});

describe('updates by others', () => {
  it('lets a Control Owner change the status of their own control only', async () => {
    const controlOwner = await signIn(mail('owner'));
    await post(controlOwner, '/controls/2-9-3', { status: 'COMPLIANT' }).expect(204);
    await post(controlOwner, '/controls/2-9-3', { dueDate: '2027-01-31' }).expect(403);
    await post(controlOwner, '/controls/2-9-3', { ownerId: otherOwnerId }).expect(403);
    await post(controlOwner, '/controls/1-1-1', { status: 'COMPLIANT' }).expect(403);

    const body = (await adminA.get('/controls').expect(200)).body as Listing;
    expect(find(body, '2-9-3').status).toBe('COMPLIANT');
    expect(find(body, '1-1-1').status).toBe('NOT_STARTED');
  });

  it('keeps Executives and Auditors read-only', async () => {
    for (const name of ['executive', 'auditor']) {
      await post(await signIn(mail(name)), '/controls/2-9-3', { status: 'NON_COMPLIANT' }).expect(403);
    }
  });
});

describe('bulk updates', () => {
  it('assigns many controls at once and audits each one', async () => {
    const codes = ['2-1-1', '2-1-2', '2-1-3'];
    await post(adminA, '/controls/bulk', { codes, ownerId: otherOwnerId, dueDate: '2026-11-30' }).expect(204);
    const body = (await adminA.get('/controls').expect(200)).body as Listing;
    for (const code of codes) expect(find(body, code)).toMatchObject({ owner: { id: otherOwnerId }, dueDate: '2026-11-30', status: 'NOT_STARTED' });
    const entries = await owner.auditLog.count({ where: { entityId: entityA, action: 'control.updated', target: { in: codes } } });
    expect(entries).toBe(3);
  });

  it('changes nothing when any code is wrong or the owner is invalid', async () => {
    await post(adminA, '/controls/bulk', { codes: ['2-2-1', '2-2-3-1'], status: 'COMPLIANT' }).expect(404);
    await post(adminA, '/controls/bulk', { codes: ['2-2-1', '2-2-2'], ownerId: outsiderId }).expect(422);
    const body = (await adminA.get('/controls').expect(200)).body as Listing;
    expect(find(body, '2-2-1')).toMatchObject({ status: 'NOT_STARTED', owner: null });
  });

  it('rejects bad input and non-Admins', async () => {
    await post(adminA, '/controls/bulk', { codes: [], status: 'COMPLIANT' }).expect(400);
    await post(adminA, '/controls/bulk', { codes: ['2-2-1'] }).expect(400);
    await post(adminA, '/controls/bulk', { codes: '2-2-1', status: 'COMPLIANT' }).expect(400);
    const controlOwner = await signIn(mail('owner'));
    await post(controlOwner, '/controls/bulk', { codes: ['2-9-3'], status: 'COMPLIANT' }).expect(403);
  });
});
