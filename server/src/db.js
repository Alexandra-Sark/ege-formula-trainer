import pg from 'pg';
import { readFileSync } from 'node:fs';

export function createPool(config) {
  if (!config.db.host || !config.db.database || !config.db.user || !config.db.password)
    throw new Error('Set PGHOST, PGDATABASE, PGUSER and PGPASSWORD');
  const pool = new pg.Pool(config.db);
  pool.on('error', () => console.error('Database connection error'));
  return pool;
}
export async function transaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
export async function migrate(pool) {
  const sql = readFileSync(new URL('../migrations/001_accounts.sql', import.meta.url), 'utf8');
  await transaction(pool, async client => {
    await client.query('SELECT pg_advisory_xact_lock(862301)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    if ((await client.query("SELECT version FROM schema_migrations WHERE version='001_accounts'")).rowCount) return;
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations(version) VALUES('001_accounts')");
  });
}
export async function cleanup(pool) {
  await transaction(pool, async client => {
    await client.query('DELETE FROM auth_challenges WHERE expires_at < now()');
    await client.query('DELETE FROM sessions WHERE expires_at < now()');
    await client.query("DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour'");
  });
}
