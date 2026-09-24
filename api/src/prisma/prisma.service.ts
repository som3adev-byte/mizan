import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { scopeToEntity } from './entity-scope.js';

/**
 * Connects as mizan_app (DATABASE_URL), so row-level security always applies.
 * Use `forEntity(id)` for any read or write of tenant data; queries on the
 * bare client see no tenant rows at all.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    super({
      adapter: new PrismaPg({ connectionString }),
      // Every tenant query runs in a transaction (see entity-scope). A serverless
      // database (e.g. Neon) can scale its compute to zero when idle, so the first
      // request after a pause waits for a cold start. The default 2s maxWait is too
      // tight for that; allow the wake-up before giving up.
      transactionOptions: { maxWait: 15_000, timeout: 20_000 },
    });
  }

  forEntity(entityId: string) {
    return scopeToEntity(this, entityId);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
