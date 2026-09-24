import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Migrations run as the table owner; the API itself connects as mizan_app.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('MIGRATE_DATABASE_URL') },
});
