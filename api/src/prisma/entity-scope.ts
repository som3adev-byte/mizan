import type { PrismaClient } from '../generated/prisma/client.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns a client whose every query runs inside a transaction that first sets
 * `app.entity_id`. Row-level security in PostgreSQL then limits each query to
 * that entity's rows, even if the calling code forgets a `where` clause.
 *
 * `set_config(..., true)` is transaction-local, so the setting never leaks to
 * another request that reuses the same pooled connection.
 */
export function scopeToEntity(client: PrismaClient, entityId: string) {
  if (!UUID.test(entityId)) {
    throw new Error('scopeToEntity: entityId must be a UUID');
  }

  return client.$extends({
    name: 'entity-scope',
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await client.$transaction([
            client.$executeRaw`SELECT set_config('app.entity_id', ${entityId}, true)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

export type EntityScopedClient = ReturnType<typeof scopeToEntity>;
