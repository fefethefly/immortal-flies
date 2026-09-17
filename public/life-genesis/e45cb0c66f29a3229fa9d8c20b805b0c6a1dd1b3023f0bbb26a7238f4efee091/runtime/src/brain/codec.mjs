export class BrainError extends Error {
  constructor(code, message) { super(message); this.name = 'BrainError'; this.code = code; }
}
export function requireValue(ok, code, message = code) {
  if (!ok) throw new BrainError(code, message);
}
export function integer(n, min, max, name) {
  requireValue(Number.isSafeInteger(n) && n >= min && n <= max, 'INVALID_VALUE', `${name} 超出范围`);
  return n;
}
export function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') { requireValue(Number.isFinite(value), 'INVALID_NUMBER'); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  requireValue(value && Object.getPrototypeOf(value) === Object.prototype, 'INVALID_OBJECT');
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export async function hashBytes(bytes) {
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return '0x' + Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join('');
}
export const hash = value => hashBytes(new TextEncoder().encode(canonical(value)));
export const clone = value => structuredClone(value);
export const ZERO_HASH = `0x${'0'.repeat(64)}`;
export function identifier(value, label = 'ID') {
  requireValue(typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value), 'INVALID_ID', `${label} 格式错误`);
  return value;
}

