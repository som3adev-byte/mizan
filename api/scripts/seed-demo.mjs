// Seeds a realistic demo entity so the dashboard looks alive: one entity, a
// team, a believable spread of control statuses, evidence, remediation steps
// and an upcoming auditor visit. Fake data only.
//
//   npm run build && node scripts/seed-demo.mjs
//
// Writes demo-credentials.json (gitignored) with each user's sign-in details
// and an otpauth:// link to add their two-step code to an authenticator app.
import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { hashPassword, encryptSecret } from '../dist/auth/crypto.js';
import { generateTotpSecret, otpauthUrl } from '../dist/auth/totp.js';

const PASSWORD = 'Demo!2026';
const EVIDENCE_DIR = resolve(process.env.EVIDENCE_DIR ?? 'storage/evidence');
const today = new Date();
const day = (offset) => new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

const c = new pg.Client({ connectionString: process.env.MIGRATE_DATABASE_URL });
await c.connect();

// Fresh start: drop any previous demo entity (cascade by hand — RLS-free owner conn).
const prior = await c.query(`SELECT id FROM entities WHERE name = $1`, ['هيئة الواحة للخدمات الرقمية']);
for (const { id } of prior.rows) {
  for (const t of ['audit_log', 'audit_visits', 'remediation_tasks', 'evidence', 'control_statuses', 'sessions', 'invitations', 'users']) {
    await c.query(`DELETE FROM ${t} WHERE entity_id = $1`, [id]).catch(() => {});
  }
  await c.query(`DELETE FROM entities WHERE id = $1`, [id]);
}

const { rows: [entity] } = await c.query(
  `INSERT INTO entities (id, name, name_en, uses_cloud) VALUES (gen_random_uuid(), $1, $2, true) RETURNING id`,
  ['هيئة الواحة للخدمات الرقمية', 'Al Waha Digital Services Authority'],
);
const eid = entity.id;

const people = [
  ['admin', 'سارة المطيري', 'ADMIN'],
  ['khalid', 'خالد الحربي', 'CONTROL_OWNER'],
  ['noura', 'نورة القحطاني', 'CONTROL_OWNER'],
  ['faisal', 'فيصل الدوسري', 'CONTROL_OWNER'],
  ['exec', 'عبدالله المنصور', 'EXECUTIVE'],
  ['auditor', 'هند الشهري', 'AUDITOR'],
];
const users = {};
const pwHash = await hashPassword(PASSWORD);
for (const [key, name, role] of people) {
  const secret = generateTotpSecret();
  const email = `${key}@waha.demo`;
  const { rows: [u] } = await c.query(
    `INSERT INTO users (id, entity_id, email, name, role, password_hash, mfa_secret, mfa_enabled)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true) RETURNING id`,
    [eid, email, name, role, pwHash, encryptSecret(secret)],
  );
  users[key] = { id: u.id, name, email, role, secret, otpauth: otpauthUrl('Mizan', email, secret) };
}
const owners = [users.khalid.id, users.noura.id, users.faisal.id];

// A believable status per control. Domain 1 is mostly in hand; domain 2 is the
// live work; 3 and 4 lag. Weighted, then made deterministic per control code.
const weights = {
  '1': [['COMPLIANT', 6], ['PARTIAL', 2], ['NON_COMPLIANT', 1], ['NOT_STARTED', 2]],
  '2': [['COMPLIANT', 3], ['PARTIAL', 3], ['NON_COMPLIANT', 2], ['NOT_STARTED', 4]],
  '3': [['PARTIAL', 1], ['NON_COMPLIANT', 1], ['NOT_STARTED', 2]],
  '4': [['NOT_STARTED', 2], ['PARTIAL', 1], ['NON_COMPLIANT', 1]],
};
const pick = (domain, n) => {
  const bag = [];
  for (const [s, w] of weights[domain]) for (let i = 0; i < w; i++) bag.push(s);
  return bag[n % bag.length];
};

const controls = (await c.query(`SELECT code FROM ecc_controls WHERE parent_code IS NULL ORDER BY sort`)).rows;
let i = 0;
for (const { code } of controls) {
  const domain = code.split('-')[0];
  const status = pick(domain, i);
  const owner = status === 'NOT_STARTED' && i % 3 === 0 ? null : owners[i % owners.length];
  // Give roughly a third of active controls a due date; scatter a few overdue.
  let due = null;
  if (status === 'PARTIAL' || status === 'NON_COMPLIANT') due = day([-12, -4, 8, 20, 45][i % 5]);
  await c.query(
    `INSERT INTO control_statuses (id, entity_id, control_code, status, owner_id, due_date, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now())`,
    [eid, code, status, owner, due],
  );
  i++;
}

// Evidence: three files against controls that are in hand, one expiring soon.
mkdirSync(EVIDENCE_DIR, { recursive: true });
const pdf = (title) => Buffer.from(`%PDF-1.4\n% ${title}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);
const evidence = [
  ['2-9-1', 'سياسة النسخ الاحتياطية المعتمدة', 'backup-policy.pdf', day(180)],
  ['2-2-1', 'إجراءات إدارة هويات الدخول', 'iam-procedures.pdf', day(21)],
  ['1-3-1', 'سياسات الأمن السيبراني المعتمدة', 'security-policies.pdf', null],
];
for (const [code, title, fileName, expires] of evidence) {
  const id = randomUUID();
  const key = `${eid}/${id}`;
  const buf = pdf(title);
  const full = resolve(EVIDENCE_DIR, key);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, buf);
  await c.query(
    `INSERT INTO evidence (id, entity_id, control_code, title, file_name, mime_type, size, sha256, storage_key, expires_on, uploaded_by_id, created_at)
     VALUES ($1,$2,$3,$4,$5,'application/pdf',$6,$7,$8,$9,$10, now())`,
    [id, eid, code, title, fileName, buf.length, createHash('sha256').update(buf).digest('hex'), key, expires, users.khalid.id],
  );
}

// Remediation steps on a couple of gaps, one overdue.
const tasks = [
  ['1-1-3', 'اعتماد الإستراتيجية المحدّثة من صاحب الصلاحية', users.khalid.id, day(-3)],
  ['2-9-3', 'تفعيل الفحص الدوري لاستعادة النسخ الاحتياطية', users.noura.id, day(14)],
  ['2-2-3', 'تطبيق المصادقة متعددة العناصر على الحسابات الحساسة', users.khalid.id, day(9)],
];
for (const [code, title, owner, due] of tasks) {
  await c.query(
    `INSERT INTO remediation_tasks (id, entity_id, control_code, title, owner_id, due_date, created_by_id, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now())`,
    [eid, code, title, owner, due, users.admin.id],
  );
}

// Upcoming auditor visit → rail countdown + an alert.
await c.query(
  `INSERT INTO audit_visits (id, entity_id, visit_date, notes, created_by_id, created_at)
   VALUES (gen_random_uuid(), $1, $2, $3, $4, now())`,
  [eid, day(12), 'مراجعة المجالين 1 و 2', users.admin.id],
);

await c.end();

const creds = {
  url: process.env.DEMO_URL ?? '(set after deploy)',
  entity: 'هيئة الواحة للخدمات الرقمية',
  password: PASSWORD,
  note: 'Every user shares the password above. Add the otpauth link to an authenticator app (Google Authenticator, etc.) for the two-step code.',
  users: Object.fromEntries(Object.entries(users).map(([k, u]) => [k, { name: u.name, email: u.email, role: u.role, otpauth: u.otpauth }])),
};
writeFileSync(new URL('../demo-credentials.json', import.meta.url), JSON.stringify(creds, null, 2));
console.log(`Seeded entity ${eid}: ${controls.length} controls, ${evidence.length} evidence, ${tasks.length} tasks, 1 visit.`);
console.log('Credentials written to api/demo-credentials.json');
