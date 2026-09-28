import test from 'node:test';
import assert from 'node:assert/strict';
import { inviteCode, inviteHash, normalizeInviteCode, parseCookies, slugify } from '../src/security.js';

test('invite codes normalize independent of separators/case', () => {
  assert.equal(normalizeInviteCode('ab12-cd34'), 'AB12CD34');
  assert.equal(inviteHash('ab12-cd34'), inviteHash('AB12 CD34'));
});

test('generated invite code avoids ambiguous characters and has groups', () => {
  const code = inviteCode(3, 4);
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2}$/);
});

test('cookie parser keeps values', () => {
  assert.deepEqual(parseCookies('a=1; vg_session=abc%2D123; x=y'), { a: '1', vg_session: 'abc-123', x: 'y' });
});

test('slugify creates a safe workspace slug', () => {
  assert.equal(slugify('  My Gym Berlin!  '), 'my-gym-berlin');
});
