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
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  forEntity(entityId: string) {
    return scopeToEntity(this, entityId);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
