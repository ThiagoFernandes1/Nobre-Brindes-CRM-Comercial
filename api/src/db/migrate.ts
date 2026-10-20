import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPool, withTransaction, type Db } from './pool.js';

const MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations');

export async function migrate(db: Db, { reset = false } = {}): Promise<string[]> {
  if (reset) {
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const { rows } = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((row) => row.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    await withTransaction(db, async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    newlyApplied.push(file);
  }
  return newlyApplied;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { config } = await import('../config.js');
  const db = createPool(config.DATABASE_URL);
  try {
    const applied = await migrate(db, { reset: process.argv.includes('--reset') });
    console.log(applied.length ? `Migrações aplicadas: ${applied.join(', ')}` : 'Banco já está atualizado.');
  } finally {
    await db.end();
  }
}
