import 'dotenv/config';
import { execSync } from 'node:child_process';

/** Brings the test database up to the latest migration before any e2e test runs. */
export default function setup() {
  const url = process.env.TEST_MIGRATE_DATABASE_URL;
  if (!url) throw new Error('TEST_MIGRATE_DATABASE_URL is not set (see api/.env.example)');
  execSync('npx prisma migrate deploy', { env: { ...process.env, MIGRATE_DATABASE_URL: url }, stdio: 'pipe' });
}
