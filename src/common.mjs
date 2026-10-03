import { createHash, randomUUID } from 'node:crypto';

export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export class AppError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export function text(value, name, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new AppError('invalid_input', `${name} must contain 1–${max} characters.`);
  return value.trim();
}
export function tags(value = []) {
  const list = typeof value === 'string' ? value.split(/[,，]/) : value;
  if (!Array.isArray(list) || list.length > 12 || list.some(t => typeof t !== 'string' || t.length > 40)) throw new AppError('invalid_input', 'Use at most 12 topics, each no longer than 40 characters.');
  return [...new Set(list.map(t => t.trim().toLowerCase()).filter(Boolean))];
}
export function requireId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new AppError('not_found', 'This project or record was not found.', 404);
  return value;
}
