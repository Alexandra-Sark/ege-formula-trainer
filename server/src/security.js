import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
export const fail = (status, code) => { throw new HttpError(status, code); };
export const hash = (secret, value) => createHmac('sha256', secret).update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export const code = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export function equal(a, b) {
  return typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b)
    && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export const record = value => value && typeof value === 'object' && !Array.isArray(value);
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function email(value) {
  if (typeof value !== 'string' || value.length > 254) fail(400, 'INVALID_EMAIL');
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(normalized)
      || normalized.split('@')[0].length > 64) fail(400, 'INVALID_EMAIL');
  return normalized;
}
export function nickname(value) {
  if (typeof value !== 'string') fail(400, 'INVALID_NICKNAME');
  const normalized = value.trim().normalize('NFC');
  if ([...normalized].length < 2 || [...normalized].length > 40 || /[\p{C}<>]/u.test(normalized)) fail(400, 'INVALID_NICKNAME');
  return normalized;
}
export function canonical(value) {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (record(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function cookieValue(header, name) {
  return (header || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) || '';
}
