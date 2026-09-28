import crypto from 'node:crypto';

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function normalizeInviteCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function inviteCode(groups = 2, groupSize = 4) {
  const chars = [];
  const total = groups * groupSize;
  const bytes = crypto.randomBytes(total);
  for (let i = 0; i < total; i += 1) chars.push(INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length]);
  const out = [];
  for (let i = 0; i < groups; i += 1) out.push(chars.slice(i * groupSize, (i + 1) * groupSize).join(''));
  return out.join('-');
}

export function inviteHash(code) {
  return hashToken(normalizeInviteCode(code));
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (!key) continue;
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  }
  return out;
}

export function safeEqualText(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export function slugify(value) {
  const base = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return base || 'workspace';
}
