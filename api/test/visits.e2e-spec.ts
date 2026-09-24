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
const mail = (name: string) => `${name}+visits-${run}@test.invalid`;

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

const day = (offset: number) => new Date(riyadhToday().getTime() + offset * 86_400_000).toISOString().slice(0, 10);

let entityA: string;
let adminA: Agent;

beforeAll(async () => {
  const { AppModule } = await import('../src/app.module.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  entityA = (await owner.entity.create({ data: { name: `جهة الزيارات أ ${run}` } })).id;
  const entityB = (await owner.entity.create({ data: { name: `جهة الزيارات ب ${run}` } })).id;
  await seedUser(entityA, 'admin', 'ADMIN');
  await seedUser(entityA, 'auditor', 'AUDITOR');
  await seedUser(entityA, 'owner', 'CONTROL_OWNER');
  await seedUser(entityB, 'adminb', 'ADMIN');
  await owner.controlStatus.createMany({
    data: [
      { entityId: entityA, controlCode: '1-1-1', status: 'NON_COMPLIANT' },
      { entityId: entityA, controlCode: '1-1-2', status: 'PARTIAL' },
      { entityId: entityA, controlCode: '1-1-3', status: 'COMPLIANT' },
    ],
  });
  adminA = await signIn(mail('admin'));
});

afterAll(async () => {
  await app.close();
  await owner.$disconnect();
});

let soonId: string;

describe('auditor visits', () => {
  it('lets the Admin schedule visits and audits it; the nearest upcoming is next', async () => {
    await post(adminA, '/visits', { visitDate: day(40), notes: 'مراجعة سنوية' }).expect(201);
    soonId = (await post(adminA, '/visits', { visitDate: day(10) }).expect(201)).body.id;
    await owner.auditVisit.create({ data: { entityId: entityA, visitDate: new Date(`${day(-30)}T00:00:00Z`), notes: 'زيارة سابقة', createdById: (await owner.user.findFirstOrThrow({ where: { entityId: entityA, role: 'ADMIN' } })).id } });

    expect((await adminA.get('/visits/next').expect(200)).body.next).toMatchObject({ id: soonId, visitDate: day(10) });
    const list = (await adminA.get('/visits').expect(200)).body;
    expect(list.upcoming.map((v: { visitDate: string }) => v.visitDate)).toEqual([day(10), day(40)]);
    expect(list.past.map((v: { notes: string }) => v.notes)).toEqual(['زيارة سابقة']);
    expect(await owner.auditLog.count({ where: { entityId: entityA, action: 'visit.scheduled' } })).toBe(2);
  });

  it('raises an alert within 14 days, with the open gaps, for every role', async () => {
    for (const who of ['admin', 'owner']) {
      const agent = who === 'admin' ? adminA : await signIn(mail(who));
      const alert = (await agent.get('/alerts').expect(200)).body.alerts.find((a: { kind: string }) => a.kind === 'audit_visit');
      expect(alert).toMatchObject({ severity: 'medium', days: 10, controlCode: null, openGaps: 2 });
    }
  });

  it('moves, annotates and cancels; cancelled visits drop out', async () => {
    await post(adminA, `/visits/${soonId}`, { visitDate: day(2), notes: 'تم تقديم الموعد' }).expect(200);
    const alert = (await adminA.get('/alerts').expect(200)).body.alerts.find((a: { kind: string }) => a.kind === 'audit_visit');
    expect(alert).toMatchObject({ severity: 'high', days: 2 });
    await post(adminA, `/visits/${soonId}/cancel`).expect(204);
    expect((await adminA.get('/visits/next').expect(200)).body.next.visitDate).toBe(day(40));
    expect((await adminA.get('/alerts').expect(200)).body.alerts.some((a: { kind: string }) => a.kind === 'audit_visit')).toBe(false);
  });

  it('is the Admin’s to change, visible to all, and isolated per entity', async () => {
    const auditor = await signIn(mail('auditor'));
    await auditor.get('/visits').expect(200);
    await post(auditor, '/visits', { visitDate: day(5) }).expect(403);
    await post(adminA, '/visits', { visitDate: '5/10/2026' }).expect(400);
    await post(adminA, '/visits', { notes: 'بدون تاريخ' }).expect(400);
    const adminB = await signIn(mail('adminb'));
    expect((await adminB.get('/visits').expect(200)).body).toEqual({ upcoming: [], past: [] });
    await post(adminB, `/visits/${soonId}/cancel`).expect(404);
  });
});
