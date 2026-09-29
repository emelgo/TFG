import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const supabaseDir = path.resolve(path.dirname(currentFile), '..');
const schemasDir = path.join(supabaseDir, 'schemas');
const migrationPath = path.join(
  supabaseDir,
  'migrations',
  '20260705174251_initial.sql',
);

const schemaFiles = (await readdir(schemasDir))
  .filter((file) => file.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b));

const sections = await Promise.all(
  schemaFiles.map(async (file) => {
    const body = (
      await readFile(path.join(schemasDir, file), 'utf8')
    ).trimEnd();

    return [
      `-- -----------------------------------------------------------------------------`,
      `-- Source: apps/web/supabase/schemas/${file}`,
      `-- -----------------------------------------------------------------------------`,
      body,
      '',
    ].join('\n');
  }),
);

const header = [
  `-- This migration is generated from apps/web/supabase/schemas/*.sql.`,
  `-- Do not edit it by hand. Run: pnpm --filter web supabase:build-initial-migration`,
  '',
].join('\n');

await writeFile(migrationPath, `${header}${sections.join('\n')}`, 'utf8');
