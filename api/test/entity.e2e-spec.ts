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
const mail = (name: string) => `${name}+entity-${run}@test.invalid`;

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

type Listing = { usesCloud: boolean | null; summary: { counts: Record<string, number>; score: number | null }; domains: { subdomains: { controls: { code: string; status: string }[] }[] }[] };
const statusOf = (b: Listing, code: string) => b.domains.flatMap((d) => d.subdomains.flatMap((s) => s.controls)).find((c) => c.code === code)!.status;

let entityA: string;
let adminA: Agent;

beforeAll(async () => {
  const { AppModule } = await import('../src/app.module.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();

  entityA = (await owner.entity.create({ data: { name: `جهة السحابة أ ${run}` } })).id;
  const entityB = (await owner.entity.create({ data: { name: `جهة السحابة ب ${run}` } })).id;
  await seedUser(entityA, 'admin', 'ADMIN');
  await seedUser(entityA, 'executive', 'EXECUTIVE');
  await seedUser(entityB, 'adminb', 'ADMIN');
  await owner.controlStatus.create({ data: { entityId: entityA, controlCode: '4-2-1', status: 'PARTIAL' } });
  adminA = await signIn(mail('admin'));
});

afterAll(async () => {
  await app.close();
  await owner.$disconnect();
});

describe('the cloud question', () => {
  it('starts unanswered', async () => {
    expect((await adminA.get('/entity').expect(200)).body).toMatchObject({ id: entityA, usesCloud: null });
  });

  it('"no" makes 4-2 not applicable, audited, and locks it there', async () => {
    expect((await post(adminA, '/entity/cloud', { usesCloud: false }).expect(200)).body.usesCloud).toBe(false);
    const body = (await adminA.get('/controls').expect(200)).body as Listing;
    expect(body.usesCloud).toBe(false);
    for (const code of ['4-2-1', '4-2-2', '4-2-3', '4-2-4']) expect(statusOf(body, code)).toBe('NOT_APPLICABLE');
    expect(body.summary.counts.NOT_APPLICABLE).toBe(4);

    const entry = await owner.auditLog.findFirst({ where: { entityId: entityA, action: 'entity.cloud_changed' } });
    expect(entry?.meta).toMatchObject({ from: null, to: false, controls: ['4-2-1', '4-2-2', '4-2-3', '4-2-4'] });

    expect((await post(adminA, '/controls/4-2-2', { status: 'COMPLIANT' }).expect(409)).body.code).toBe('cloud_not_used');
    await post(adminA, '/controls/bulk', { codes: ['1-1-1', '4-2-3'], status: 'PARTIAL' }).expect(409);
    await post(adminA, '/controls/4-2-2', { status: 'NOT_APPLICABLE' }).expect(204);
  });

  it('"yes" returns them to not started', async () => {
    await post(adminA, '/entity/cloud', { usesCloud: true }).expect(200);
    const body = (await adminA.get('/controls').expect(200)).body as Listing;
    for (const code of ['4-2-1', '4-2-2', '4-2-3', '4-2-4']) expect(statusOf(body, code)).toBe('NOT_STARTED');
    await post(adminA, '/controls/4-2-2', { status: 'COMPLIANT' }).expect(204);
  });

  it('is the Admin’s call, for their own entity only', async () => {
    await post(await signIn(mail('executive')), '/entity/cloud', { usesCloud: false }).expect(403);
    await post(adminA, '/entity/cloud', { usesCloud: 'no' }).expect(400);
    await post(adminA, '/entity/cloud', { usesCloud: false, name: 'x' }).expect(400);
    const adminB = await signIn(mail('adminb'));
    await post(adminB, '/entity/cloud', { usesCloud: false }).expect(200);
    expect((await owner.entity.findUniqueOrThrow({ where: { id: entityA } })).usesCloud).toBe(true);
  });

  it('keeps the entity’s names, with the English one optional, editable by the Admin', async () => {
    expect((await post(adminA, '/entity/names', { name: 'جهة معدّلة', nameEn: '  Revised Entity  ' }).expect(200)).body).toMatchObject({ name: 'جهة معدّلة', nameEn: 'Revised Entity' });
    expect((await adminA.get('/auth/me').expect(200)).body.entity).toMatchObject({ name: 'جهة معدّلة', nameEn: 'Revised Entity' });
    expect((await post(adminA, '/entity/names', { name: 'جهة معدّلة', nameEn: '' }).expect(200)).body.nameEn).toBeNull();
    expect(await owner.auditLog.count({ where: { entityId: entityA, action: 'entity.renamed' } })).toBe(2);
    await post(adminA, '/entity/names', { name: 'x', nameEn: null }).expect(400);
    await post(adminA, '/entity/names', { name: 'جهة', usesCloud: true }).expect(400);
    await post(await signIn(mail('executive')), '/entity/names', { name: 'جهة أخرى', nameEn: null }).expect(403);
  });
});
