import 'dotenv/config';
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { hashToken, newToken } from '../auth/crypto.js';
import { INVITATION_TTL_MS } from '../auth/auth.types.js';

/**
 * Provisions an entity and invites its first Admin. Runs with the owner
 * connection because the API role cannot create entities.
 *
 *   npm run create-entity -- --name "هيئة ..." --name-en "... Authority" --admin-email admin@example.gov.sa
 *
 * --name-en is optional; the English interface falls back to --name.
 */
const { values } = parseArgs({ options: { name: { type: 'string' }, 'name-en': { type: 'string' }, 'admin-email': { type: 'string' } } });
const name = values.name?.trim();
const nameEn = values['name-en']?.trim() || null;
const email = values['admin-email']?.trim().toLowerCase();
if (!name || !email) {
  console.error('Usage: npm run create-entity -- --name "<entity name>" [--name-en "<English name>"] --admin-email <email>');
  process.exit(1);
}

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) throw new Error('MIGRATE_DATABASE_URL is not set');
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  const token = newToken();
  const entity = await owner.entity.create({ data: { name, nameEn } });
  await owner.invitation.create({
    data: { tokenHash: hashToken(token), entityId: entity.id, email, role: 'ADMIN', expiresAt: new Date(Date.now() + INVITATION_TTL_MS) },
  });
  await owner.auditLog.create({ data: { entityId: entity.id, action: 'entity.created', meta: { firstAdmin: email } } });

  const web = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];
  console.log(`Entity created: ${entity.id}`);
  console.log(`First Admin invitation for ${email} (valid 7 days):`);
  console.log(`${web}/invite/${token}`);
} finally {
  await owner.$disconnect();
}
