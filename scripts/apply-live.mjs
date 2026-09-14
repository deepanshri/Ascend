import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const projectRef = process.env.SUPABASE_PROJECT_REF || 'dpgupbcbhkmjtyqkljpr';
const files = [
  'supabase/migrations/011_schema_reconciliation.sql',
  'supabase/migrations/012_purge_integrity_test_accounts.sql',
];

if (!process.env.SUPABASE_ACCESS_TOKEN && !process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
  console.error(
    'Set SUPABASE_ACCESS_TOKEN (supabase login) or DATABASE_URL to apply live SQL.'
  );
  process.exit(2);
}

for (const file of files) {
  const args = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
    ? ['supabase', 'db', 'query', '--db-url', process.env.DATABASE_URL || process.env.SUPABASE_DB_URL, '-f', file]
    : ['supabase', 'db', 'query', '--linked', '--project-ref', projectRef, '-f', file];
  console.log('Applying', file);
  const result = spawnSync('npx', args, { stdio: 'inherit', shell: true, cwd: resolve(process.cwd()) });
  if (result.status !== 0) process.exit(result.status || 1);
}
