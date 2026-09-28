import crypto from 'node:crypto';
import { query } from './db.js';

const code = String(process.env.BOOTSTRAP_ADMIN_CODE || '').trim();
if (!code) process.exit(0);

const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
const tokenHash = crypto.createHash('sha256').update(normalized).digest('hex');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    const admins = await query("SELECT count(*)::int AS n FROM users WHERE is_platform_admin=true AND status='active'");
    if (admins.rows[0].n > 0) {
      console.log('[varangym] bootstrap invite not needed: platform admin already exists');
      process.exit(0);
    }

    const existing = await query('SELECT 1 FROM invites WHERE token_hash=$1', [tokenHash]);
    if (!existing.rowCount) {
      await query(
        `INSERT INTO invites(token_hash,target_role,max_uses,use_count,expires_at,metadata)
         VALUES ($1,'platform_admin',1,0,now()+interval '7 days',$2::jsonb)`,
        [tokenHash, JSON.stringify({ source: 'env-bootstrap' })]
      );
    }
    console.log('[varangym] bootstrap platform-admin invite ready');
    process.exit(0);
  } catch (err) {
    if (attempt === 29) {
      console.error('[varangym] bootstrap invite failed', err?.message || err);
      process.exit(1);
    }
    await sleep(1000);
  }
}
