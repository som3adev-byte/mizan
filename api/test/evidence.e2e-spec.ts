import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { encryptSecret, hashPassword } from '../src/auth/crypto.js';
import { currentStep, generateTotpSecret, totpAt } from '../src/auth/totp.js';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const storageDir = mkdtempSync(join(tmpdir(), 'mizan-evidence-'));
process.env.EVIDENCE_DIR = storageDir;
const OWNER_URL = process.env.TEST_MIGRATE_DATABASE_URL;
if (!process.env.DATABASE_URL || !OWNER_URL) throw new Error('Test database URLs are not set (see api/.env.example)');

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const run = Date.now().toString(36);
const mail = (name: string) => `${name}+evidence-${run}@test.invalid`;

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


const PDF = Buffer.from('%PDF-1.7\n% سياسة النسخ الاحتياطية\n%%EOF\n');
const upload = (agent: Agent, fields: Record<string, string>, file = PDF, name = 'سياسة.pdf', origin: string | null = ORIGIN) => {
  const req = agent.post('/evidence');
  if (origin) req.set('Origin', origin);
  for (const [k, v] of Object.entries(fields)) req.field(k, v);
  return req.attach('file', file, name);
};

let entityA: string;
let adminA: Agent;
let ownerA: Agent;
let adminB: Agent;

beforeAll(async () => {
  const { AppModule } = await import('../src/app.module.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();

  entityA = (await owner.entity.create({ data: { name: `جهة الأدلة أ ${run}` } })).id;
  const entityB = (await owner.entity.create({ data: { name: `جهة الأدلة ب ${run}` } })).id;
  await seedUser(entityA, 'admin', 'ADMIN');
  const controlOwner = await seedUser(entityA, 'owner', 'CONTROL_OWNER');
  await seedUser(entityA, 'owner2', 'CONTROL_OWNER');
  await seedUser(entityA, 'executive', 'EXECUTIVE');
  await seedUser(entityB, 'adminb', 'ADMIN');
  await owner.controlStatus.create({ data: { entityId: entityA, controlCode: '2-9-3', ownerId: controlOwner.id } });
  adminA = await signIn(mail('admin'));
  ownerA = await signIn(mail('owner'));
  adminB = await signIn(mail('adminb'));
});

afterAll(async () => {
  await app.close();
  await owner.$disconnect();
  rmSync(storageDir, { recursive: true, force: true });
});

let evidenceId: string;

describe('uploading evidence', () => {
  it('lets a Control Owner attach a file to their control, and audits it', async () => {
    const { body } = await upload(ownerA, { controlCode: '2-9-3', title: 'سياسة النسخ الاحتياطية', expiresOn: '2027-06-30' }).expect(201);
    expect(body).toMatchObject({ controlCode: '2-9-3', fileName: 'سياسة.pdf', mimeType: 'application/pdf', size: PDF.length, expiresOn: '2027-06-30' });
    evidenceId = body.id;
    const entry = await owner.auditLog.findFirst({ where: { entityId: entityA, action: 'evidence.uploaded', target: '2-9-3' } });
    expect(entry?.meta).toMatchObject({ evidenceId, fileName: 'سياسة.pdf' });

    const controls = (await adminA.get('/controls').expect(200)).body;
    const control = controls.domains.flatMap((d: any) => d.subdomains.flatMap((s: any) => s.controls)).find((c: any) => c.code === '2-9-3');
    expect(control.evidenceCount).toBe(1);
  });

  it('refuses controls that are not theirs, and non-editors', async () => {
    await upload(ownerA, { controlCode: '1-1-1', title: 'دليل' }).expect(403);
    await upload(await signIn(mail('executive')), { controlCode: '2-9-3', title: 'دليل' }).expect(403);
    await upload(adminA, { controlCode: '2-9-3-1', title: 'دليل' }).expect(400); // subcontrols take no evidence
    await upload(adminA, { controlCode: '9-9-9', title: 'دليل' }).expect(404);
  });

  it('refuses files that are not what they claim, and bad input', async () => {
    expect((await upload(adminA, { controlCode: '2-9-3', title: 'دليل' }, Buffer.from('MZ\x90\x00'), 'report.pdf').expect(422)).body.code).toBe('file_type');
    await upload(adminA, { controlCode: '2-9-3', title: 'دليل' }, Buffer.from('MZ'), 'tool.exe').expect(422);
    await upload(adminA, { controlCode: '2-9-3', title: '' }).expect(400);
    await upload(adminA, { controlCode: '2-9-3', title: 'دليل', expiresOn: '30/06/2027' }).expect(400);
  });

  it('refuses files over 20 MB', async () => {
    await upload(adminA, { controlCode: '2-9-3', title: 'كبير' }, Buffer.concat([PDF, Buffer.alloc(20 * 1024 * 1024)])).expect(413);
  });

  it('needs the web app’s Origin and a multipart body', async () => {
    await upload(adminA, { controlCode: '2-9-3', title: 'دليل' }, PDF, 'a.pdf', null).expect(403);
    await upload(adminA, { controlCode: '2-9-3', title: 'دليل' }, PDF, 'a.pdf', 'https://evil.example').expect(403);
    await adminA.post('/evidence').set('Origin', ORIGIN).send({ controlCode: '2-9-3', title: 'x' }).expect(403);
  });
});

describe('reading evidence', () => {
  it('lists and downloads the same bytes, as an attachment, for every role', async () => {
    const executive = await signIn(mail('executive'));
    const list = (await executive.get('/evidence?control=2-9-3').expect(200)).body;
    expect(list.map((e: { id: string }) => e.id)).toEqual([evidenceId]);
    expect(JSON.stringify(list)).not.toMatch(/storageKey|sha256/);

    const res = await executive.get(`/evidence/${evidenceId}/file`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(Buffer.compare(res.body as Buffer, PDF)).toBe(0);
    expect(res.headers['content-disposition']).toMatch(/^attachment;/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(await owner.auditLog.count({ where: { entityId: entityA, action: 'evidence.downloaded' } })).toBe(1);
  });

  it('summarizes counts for the rail card', async () => {
    // One file, expiring 2027-06-30: counted, neither expired nor within 30 days.
    expect((await adminA.get('/evidence/summary').expect(200)).body).toEqual({ total: 1, expired: 0, expiring: 0 });
    expect((await adminB.get('/evidence/summary').expect(200)).body).toEqual({ total: 0, expired: 0, expiring: 0 });
  });

  it('keeps another entity out', async () => {
    expect((await adminB.get('/evidence').expect(200)).body).toEqual([]);
    await adminB.get(`/evidence/${evidenceId}/file`).expect(404);
    await adminB.post(`/evidence/${evidenceId}/remove`).set('Origin', ORIGIN).send({}).expect(404);
  });
});

describe('removing evidence', () => {
  it('only the uploader or an Admin can remove it; the row is kept', async () => {
    await (await signIn(mail('owner2'))).post(`/evidence/${evidenceId}/remove`).set('Origin', ORIGIN).send({}).expect(403);
    await ownerA.post(`/evidence/${evidenceId}/remove`).set('Origin', ORIGIN).send({}).expect(204);
    expect((await adminA.get('/evidence').expect(200)).body).toEqual([]);
    await adminA.get(`/evidence/${evidenceId}/file`).expect(404);
    const row = await owner.evidence.findUniqueOrThrow({ where: { id: evidenceId } });
    expect(row.removedAt).not.toBeNull();
  });
});
