import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const ssl = /^(1|true|require)$/i.test(process.env.PGSSL || '')
  ? { rejectUnauthorized: false }
  : undefined;

export const pool = new Pool({ connectionString: databaseUrl, ssl, max: +(process.env.PGPOOL_MAX || 10) });

export const query = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

export async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.resolve(here, '../migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  for (const name of files) {
    const seen = await query('SELECT 1 FROM schema_migrations WHERE name=$1', [name]);
    if (seen.rowCount) continue;
    const sql = fs.readFileSync(path.join(dir, name), 'utf8');
    await tx(async client => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
    });
    console.log('[db] applied migration', name);
  }
}

export async function ping() {
  const { rows } = await query('SELECT now() AS now');
  return rows[0].now;
}

export async function close() {
  await pool.end();
}
