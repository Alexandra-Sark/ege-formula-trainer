import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function configFromEnv(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const origin = new URL(env.PUBLIC_ORIGIN || 'http://localhost:3000');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
    throw new Error('PUBLIC_ORIGIN must be an origin without a path');
  if (production && origin.protocol !== 'https:') throw new Error('Production PUBLIC_ORIGIN must use HTTPS');
  const enabled = env.ACCOUNTS_ENABLED === 'true';
  if (env.ACCOUNTS_ENABLED && !['true','false'].includes(env.ACCOUNTS_ENABLED)) throw new Error('ACCOUNTS_ENABLED must be true or false');
  const secret = env.AUTH_SECRET || '';
  if (enabled && (!/^[A-Za-z0-9_-]{43,}$/.test(secret) || Buffer.from(secret, 'base64url').length < 32))
    throw new Error('AUTH_SECRET must contain at least 32 random bytes in base64url format');
  const integer = (name, fallback, min, max) => {
    const value = Number(env[name] || fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error('Invalid ' + name);
    return value;
  };
  const sslMode = env.PG_SSL_MODE || 'disable';
  if (!['disable','verify-full'].includes(sslMode)) throw new Error('PG_SSL_MODE must be disable or verify-full');
  return {
    production, origin: origin.origin, enabled, secret,
    port: integer('PORT', 3000, 1, 65535),
    trustProxy: integer('TRUST_PROXY_HOPS', 0, 0, 3),
    legalDir: resolve(env.LEGAL_DIR || fileURLToPath(new URL('../legal/', import.meta.url))),
    sessionHours: integer('SESSION_HOURS', 168, 1, 720),
    db: {
      host: env.PGHOST, port: integer('PGPORT', 5432, 1, 65535),
      database: env.PGDATABASE, user: env.PGUSER, password: env.PGPASSWORD,
      max: integer('PG_POOL_MAX', 5, 1, 20), connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000, statement_timeout: 10000,
      ssl: sslMode === 'verify-full' ? {
        rejectUnauthorized: true,
        ...(env.PG_SSL_CA_FILE ? {ca: readFileSync(env.PG_SSL_CA_FILE, 'utf8')} : {})
      } : false
    },
    smtp: {
      host: env.SMTP_HOST, port: integer('SMTP_PORT', 587, 1, 65535),
      secure: env.SMTP_SECURE === 'true', user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD, from: env.MAIL_FROM
    }
  };
}
