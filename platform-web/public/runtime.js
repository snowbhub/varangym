const VG_RECENT_KEY = 'varangym_recent_invites_v1';

function vgReadRecent() {
  try { return JSON.parse(localStorage.getItem(VG_RECENT_KEY) || '{}') || {}; }
  catch { return {}; }
}

function vgWriteRecent(value) {
  try { localStorage.setItem(VG_RECENT_KEY, JSON.stringify(value)); } catch {}
}

function vgEsc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function vgInviteUrl(code) {
  const u = new URL('/', location.origin);
  u.searchParams.set('invite', code);
  return u.toString();
}

function vgStatus(invite) {
  if (invite.revoked_at) return 'revoked';
  if (Number(invite.use_count) >= Number(invite.max_uses)) return 'used';
  if (new Date(invite.expires_at).getTime() <= Date.now()) return 'expired';
  return 'active';
}

async function vgApi(path) {
  const r = await fetch(path, { credentials: 'include', headers: { 'content-type': 'application/json' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

async function vgGuardManagement() {
  try {
    const me = await vgApi('/api/me');
    const memberships = me.memberships || [];
    const allowed = !!me.user?.is_platform_admin || memberships.some(m => ['owner', 'admin', 'trainer'].includes(m.role));
    if (!allowed) location.replace('/');
  } catch {
    // Unauthenticated management login is allowed; permissions are enforced by the API.
  }
}
vgGuardManagement();

function vgPatchManagementNav() {
  const training = document.querySelector('[data-tab="training"]');
  if (training && training.dataset.realApp !== '1') {
    training.dataset.realApp = '1';
    training.textContent = 'Training App';
    training.onclick = e => {
      e.preventDefault();
      location.href = '/';
    };
  }
}

async function vgRenderInviteHistory() {
  const host = document.querySelector('#inviteResult');
  if (!host) return;

  // app.js had an early staging-only history renderer. Hide it now that the access service
  // can safely recover encrypted invite codes for authorized managers.
  const legacy = document.querySelector('#inviteHistory');
  if (legacy) legacy.style.display = 'none';

  let box = document.querySelector('#vgInviteHistory');
  if (!box) {
    box = document.createElement('div');
    box.id = 'vgInviteHistory';
    box.style.marginTop = '20px';
    host.insertAdjacentElement('afterend', box);
  }
  box.innerHTML = '<div class="empty">Завантажую створені запрошення…</div>';

  const admin = [...document.querySelectorAll('#roleBadges .badge')].some(x => x.textContent.includes('Platform Admin'));
  const workspaceId = document.querySelector('#inviteWorkspace')?.value || '';
  if (!admin && !workspaceId) {
    box.innerHTML = '<div class="empty">Оберіть workspace, щоб побачити його запрошення.</div>';
    return;
  }

  try {
    const d = await vgApi(admin && !workspaceId ? '/api/invites' : `/api/invites?workspaceId=${encodeURIComponent(workspaceId)}`);
    const recent = vgReadRecent();
    const items = d.invites || [];
    box.innerHTML = `
      <div class="section-title"><h3>Створені запрошення</h3><span class="badge">${items.length}</span></div>
      <div class="list">${items.length ? items.map(i => {
        const local = recent[i.id];
        const status = vgStatus(i);
        const code = i.code || local?.code || '';
        const link = code ? vgInviteUrl(code) : '';
        return `<div class="row" style="align-items:flex-start">
          <div class="row-main">
            <div class="row-title">${vgEsc(i.target_role)} · ${vgEsc(status)}</div>
            <div class="row-sub">Використано ${i.use_count}/${i.max_uses} · до ${new Date(i.expires_at).toLocaleString()}</div>
            ${code ? `<div class="code" style="margin-top:8px;font-size:18px">${vgEsc(code)}</div>` : '<div class="row-sub" style="margin-top:8px">Старий код був створений до ввімкнення зашифрованого відновлення.</div>'}
          </div>
          ${code ? `<div class="actions"><button class="ghost vg-copy-code" data-code="${vgEsc(code)}">Код</button><button class="ghost vg-copy-link" data-link="${vgEsc(link)}">Лінк</button></div>` : ''}
        </div>`;
      }).join('') : '<div class="empty">Запрошень ще немає.</div>'}</div>`;

    box.querySelectorAll('.vg-copy-code').forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.code));
    box.querySelectorAll('.vg-copy-link').forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.link));
  } catch (e) {
    box.innerHTML = `<div class="empty">Не вдалося завантажити запрошення: ${vgEsc(e.message)}</div>`;
  }
}

const vgOriginalFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await vgOriginalFetch(...args);
  try {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    const method = String(args[1]?.method || 'GET').toUpperCase();
    if (method === 'POST' && url.endsWith('/api/invites') && response.ok) {
      const data = await response.clone().json();
      if (data?.invite?.id && data?.code) {
        const recent = vgReadRecent();
        recent[data.invite.id] = { code: data.code, createdAt: Date.now() };
        vgWriteRecent(recent);
        setTimeout(vgRenderInviteHistory, 100);
      }
    }
  } catch {}
  return response;
};

const inviteFromUrl = new URLSearchParams(location.search).get('invite');
if (inviteFromUrl) {
  const fill = () => {
    const input = document.querySelector('#regCode');
    if (input) input.value = inviteFromUrl;
    else setTimeout(fill, 50);
  };
  fill();
}

const observer = new MutationObserver(() => {
  vgPatchManagementNav();
  if (document.querySelector('#inviteResult') && !document.querySelector('#vgInviteHistory')) vgRenderInviteHistory();
});
observer.observe(document.documentElement, { childList: true, subtree: true });
vgPatchManagementNav();

document.addEventListener('change', e => {
  if (e.target?.id === 'inviteWorkspace') vgRenderInviteHistory();
});
