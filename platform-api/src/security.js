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
  const raw = String(code || '').trim().toUpperCase();
  const normalized = normalizeInviteCode(raw);
  // Early staging bootstrap invites were generated as 3x5 groups and hashed
  // with separators included. Keep compatibility for those one-time codes;
  // all current inviteCode() formats continue to use normalized hashing.
  if (normalized.length === 15 && /^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(raw)) {
    return hashToken(raw);
  }
  return hashToken(normalized);
}

function inviteEncryptionKey() {
  const raw = process.env.INVITE_ENCRYPTION_KEY || '';
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptInviteCode(code) {
  const key = inviteEncryptionKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(code), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptInviteCode(value) {
  const key = inviteEncryptionKey();
  if (!key || !value) return null;
  try {
    const [version, ivRaw, tagRaw, cipherRaw] = String(value).split('.');
    if (version !== 'v1' || !ivRaw || !tagRaw || !cipherRaw) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(cipherRaw, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
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
