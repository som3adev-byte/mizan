import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { scopeToEntity } from '../src/prisma/entity-scope.js';

/**
 * The most important test in the project:
 * a user of entity A must never see or change entity B's data.
 *
 * `owner` connects as the table owner and is used only to seed and to check
 * the ground truth. `app` connects as mizan_app, exactly like the API does.
 */

const APP_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_MIGRATE_DATABASE_URL;

if (!APP_URL || !OWNER_URL) {
  throw new Error('TEST_DATABASE_URL and TEST_MIGRATE_DATABASE_URL must be set (see api/.env.example)');
}

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: OWNER_URL }) });
const app = new PrismaClient({ adapter: new PrismaPg({ connectionString: APP_URL }) });

let entityA: string;
let entityB: string;
let bStatusId: string;
const run = Date.now().toString(36);
const mail = (name: string) => `${name}+${run}@test.invalid`;

beforeAll(async () => {
  // No cleanup: audit_log is append-only and references entities, so each run
  // creates fresh entities and unique emails instead of truncating.
  entityA = (await owner.entity.create({ data: { name: 'جهة أ (اختبار)' } })).id;
  entityB = (await owner.entity.create({ data: { name: 'جهة ب (اختبار)' } })).id;

  await owner.user.createMany({
    data: [
      { entityId: entityA, email: mail('admin-a'), name: 'مدير أ', role: 'ADMIN' },
      { entityId: entityA, email: mail('owner-a'), name: 'مالك أ', role: 'CONTROL_OWNER' },
      { entityId: entityB, email: mail('admin-b'), name: 'مدير ب', role: 'ADMIN' },
    ],
  });

  await owner.controlStatus.create({ data: { entityId: entityA, controlCode: '2-9-3', status: 'PARTIAL' } });
  bStatusId = (
    await owner.controlStatus.create({ data: { entityId: entityB, controlCode: '2-9-3', status: 'NON_COMPLIANT' } })
  ).id;
});

afterAll(async () => {
  await owner.$disconnect();
  await app.$disconnect();
});

describe('tenant isolation', () => {
  it('lists only the current entity’s users', async () => {
    const users = await scopeToEntity(app, entityA).user.findMany();
    expect(users).toHaveLength(2);
    expect(users.every((u) => u.entityId === entityA)).toBe(true);
  });

  it('returns only the current entity’s own entity row', async () => {
    const entities = await scopeToEntity(app, entityA).entity.findMany();
    expect(entities.map((e) => e.id)).toEqual([entityA]);
  });

  it('cannot read another entity’s row even by its exact id', async () => {
    const row = await scopeToEntity(app, entityA).controlStatus.findUnique({ where: { id: bStatusId } });
    expect(row).toBeNull();
  });

  it('cannot update another entity’s rows', async () => {
    const result = await scopeToEntity(app, entityA).controlStatus.updateMany({
      where: { id: bStatusId },
      data: { status: 'COMPLIANT' },
    });
    expect(result.count).toBe(0);

    const truth = await owner.controlStatus.findUniqueOrThrow({ where: { id: bStatusId } });
    expect(truth.status).toBe('NON_COMPLIANT');
  });

  it('cannot delete another entity’s rows', async () => {
    const result = await scopeToEntity(app, entityA).controlStatus.deleteMany({ where: { id: bStatusId } });
    expect(result.count).toBe(0);
    expect(await owner.controlStatus.count({ where: { id: bStatusId } })).toBe(1);
  });

  it('cannot insert a row into another entity', async () => {
    await expect(
      scopeToEntity(app, entityA).user.create({
        data: { entityId: entityB, email: mail('intruder'), name: 'دخيل', role: 'ADMIN' },
      }),
    ).rejects.toThrow();
    expect(await owner.user.count({ where: { email: mail('intruder') } })).toBe(0);
  });

  it('cannot move its own row into another entity', async () => {
    await expect(
      scopeToEntity(app, entityA).user.updateMany({
        where: { email: mail('owner-a') },
        data: { entityId: entityB },
      }),
    ).rejects.toThrow();
    const truth = await owner.user.findFirstOrThrow({ where: { email: mail('owner-a') } });
    expect(truth.entityId).toBe(entityA);
  });

  it('sees nothing when no entity is set (fails closed)', async () => {
    expect(await app.user.findMany()).toEqual([]);
    expect(await app.entity.findMany()).toEqual([]);
    expect(await app.controlStatus.findMany()).toEqual([]);
  });

  it('cannot create entities with the app connection', async () => {
    await expect(app.entity.create({ data: { name: 'جهة مزيفة' } })).rejects.toThrow();
  });

  it('rejects an entity id that is not a UUID', () => {
    expect(() => scopeToEntity(app, "x' OR '1'='1")).toThrow();
  });

  it('does not leak the entity setting to later queries on the same pool', async () => {
    await scopeToEntity(app, entityA).user.findMany();
    expect(await app.user.findMany()).toEqual([]);
  });
});
