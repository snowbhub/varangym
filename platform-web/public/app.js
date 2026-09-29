const $ = s => document.querySelector(s);
const authView = $('#authView');
const appView = $('#appView');
const bootView = $('#bootView');
const managementSurface = $('#managementSurface');
const trainingSurface = $('#trainingSurface');
const panel = $('#panel');
const bottomNav = $('#bottomNav');
let me = null;
let trainingLoaded = false;
let activeRoute = 'training';

function toast(message, ms = 3000) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), ms);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

function b64urlToBuffer(v) {
  const s = String(v).replace(/-/g, '+').replace(/_/g, '/');
  const pad = '='.repeat((4 - s.length % 4) % 4);
  const bin = atob(s + pad);
  return Uint8Array.from(bin, c => c.charCodeAt(0)).buffer;
}

function bufferToB64url(v) {
  if (v == null) return null;
  const bytes = new Uint8Array(v);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function creationOptions(raw) {
  const o = structuredClone(raw);
  o.challenge = b64urlToBuffer(o.challenge);
  o.user.id = b64urlToBuffer(o.user.id);
  if (o.excludeCredentials) o.excludeCredentials = o.excludeCredentials.map(x => ({ ...x, id: b64urlToBuffer(x.id) }));
  return o;
}

function requestOptions(raw) {
  const o = structuredClone(raw);
  o.challenge = b64urlToBuffer(o.challenge);
  if (o.allowCredentials) o.allowCredentials = o.allowCredentials.map(x => ({ ...x, id: b64urlToBuffer(x.id) }));
  return o;
}

function serializeCredential(cred) {
  const response = cred.response;
  const out = {
    id: cred.id,
    rawId: bufferToB64url(cred.rawId),
    type: cred.type,
    response: { clientDataJSON: bufferToB64url(response.clientDataJSON) },
    clientExtensionResults: cred.getClientExtensionResults?.() || {}
  };
  if ('attestationObject' in response) {
    out.response.attestationObject = bufferToB64url(response.attestationObject);
    out.response.transports = response.getTransports?.() || [];
  }
  if ('authenticatorData' in response) {
    out.response.authenticatorData = bufferToB64url(response.authenticatorData);
    out.response.signature = bufferToB64url(response.signature);
    out.response.userHandle = bufferToB64url(response.userHandle);
  }
  return out;
}

async function register() {
  if (!window.PublicKeyCredential) throw new Error('Цей браузер не підтримує Passkeys');
  const code = $('#regCode').value.trim();
  const name = $('#regName').value.trim();
  const email = $('#regEmail').value.trim();
  const locale = $('#regLocale').value;
  if (!code || !name) throw new Error('Введи код і імʼя');
  const start = await api('/api/auth/register/options', {
    method: 'POST', body: JSON.stringify({ code, name, email: email || null })
  });
  $('#regRole').textContent = `Роль із запрошення: ${start.targetRole}`;
  const credential = await navigator.credentials.create({ publicKey: creationOptions(start.options) });
  me = await api('/api/auth/register/verify', {
    method: 'POST',
    body: JSON.stringify({ cid: start.cid, credential: serializeCredential(credential), locale })
  });
  toast('Профіль створено');
  showApp();
}

async function login() {
  if (!window.PublicKeyCredential) throw new Error('Цей браузер не підтримує Passkeys');
  const start = await api('/api/auth/login/options', { method: 'POST', body: '{}' });
  const credential = await navigator.credentials.get({ publicKey: requestOptions(start.options) });
  me = await api('/api/auth/login/verify', {
    method: 'POST', body: JSON.stringify({ cid: start.cid, credential: serializeCredential(credential) })
  });
  toast('Вхід виконано');
  showApp();
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function memberships() { return me?.memberships || []; }
function isAdmin() { return !!me?.user?.is_platform_admin; }
function coachMemberships() { return memberships().filter(x => ['owner', 'admin', 'trainer'].includes(x.role)); }
function businessMemberships() { return memberships().filter(x => x.workspace_type === 'organization' && ['owner', 'admin'].includes(x.role)); }
function canInvite() { return isAdmin() || coachMemberships().length > 0 || businessMemberships().length > 0; }

function icon(name) {
  const paths = {
    training: '<path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/>',
    trainer: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    business: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 21V3h8v18M8 9h8M8 13h8M8 17h8"/>',
    admin: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 22a8 8 0 0 1 16 0"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    invite: '<path d="M12 5v14M5 12h14"/><circle cx="12" cy="12" r="10"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    refresh: '<path d="M20 11a8.1 8.1 0 1 0 2 5.3"/><path d="M20 4v7h-7"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.profile}</svg>`;
}

function navItems() {
  const items = [{ id: 'training', label: 'Тренування', icon: 'training' }];
  if (coachMemberships().length || isAdmin()) items.push({ id: 'trainer', label: 'Тренер', icon: 'trainer' });
  if (businessMemberships().length) items.push({ id: 'business', label: 'Бізнес', icon: 'business' });
  if (isAdmin()) items.push({ id: 'admin', label: 'Адмін', icon: 'admin' });
  items.push({ id: 'profile', label: 'Профіль', icon: 'profile' });
  return items;
}

function normalizeRoute(value) {
  const requested = String(value || '').replace(/^#\/?/, '').split('?')[0] || 'training';
  const allowed = new Set(navItems().map(x => x.id).concat(canInvite() ? ['invites'] : []));
  return allowed.has(requested) ? requested : 'training';
}

function setRoute(route) {
  const next = normalizeRoute(route);
  if (location.hash !== `#/${next}`) location.hash = `#/${next}`;
  else renderRoute();
}

function renderBottomNav() {
  bottomNav.innerHTML = navItems().map(item => `
    <button type="button" class="bottom-nav-item ${activeRoute === item.id ? 'active' : ''}" data-route="${item.id}" aria-label="${esc(item.label)}">
      <span class="bottom-nav-icon">${icon(item.icon)}</span><span>${esc(item.label)}</span>
    </button>`).join('');
  bottomNav.querySelectorAll('[data-route]').forEach(b => b.onclick = () => setRoute(b.dataset.route));
}

async function ensureTraining() {
  if (trainingLoaded) return;
  trainingLoaded = true;
  try {
    await import('/training.js');
  } catch (e) {
    trainingLoaded = false;
    $('#loading').classList.add('hidden');
    $('#signedOut').classList.remove('hidden');
    $('#signedOut').querySelector('p').textContent = 'Не вдалося завантажити тренувальний модуль. Онови сторінку.';
  }
}

function setTrainingMode(targetMode) {
  let attempts = 0;
  const clickMode = () => {
    const btn = document.querySelector(`#modeTabs [data-mode="${targetMode}"]`);
    if (btn) { btn.click(); return; }
    if (++attempts < 40) setTimeout(clickMode, 60);
  };
  setTimeout(clickMode, 0);
}

function showManagement() {
  trainingSurface.classList.add('hidden');
  managementSurface.classList.remove('hidden');
}

async function showTraining(mode = 'client') {
  managementSurface.classList.add('hidden');
  trainingSurface.classList.remove('hidden');
  await ensureTraining();
  setTrainingMode(mode);
}

function screenHeader(title, subtitle = '') {
  return `<div class="screen-head"><div><div class="eyebrow">VARANGYM</div><h1>${esc(title)}</h1>${subtitle ? `<p class="muted">${esc(subtitle)}</p>` : ''}</div></div>`;
}

function roleText(m) {
  const map = { owner: 'Власник', admin: 'Адміністратор', trainer: 'Тренер', client: 'Клієнт' };
  return map[m.role] || m.role;
}

function settingsRow({ id = '', iconName = 'profile', tint = '', title, subtitle = '', danger = false }) {
  return `<button type="button" ${id ? `id="${id}"` : ''} class="settings-row ${danger ? 'danger-row' : ''}">
    <span class="settings-icon ${tint}">${icon(iconName)}</span>
    <span class="settings-copy"><strong>${esc(title)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</span>
    <span class="settings-chevron">${icon('chevron')}</span>
  </button>`;
}

function renderProfile() {
  const roles = memberships();
  const roleBadges = [isAdmin() ? '<span class="badge">Platform Admin</span>' : '', ...roles.map(m => `<span class="badge">${esc(m.workspace_name)} · ${esc(roleText(m))}</span>`)].join('');
  panel.innerHTML = `${screenHeader('Профіль')}
    <section class="profile-card">
      <div class="avatar">${esc((me.user.display_name || '?').slice(0, 1).toUpperCase())}</div>
      <div><h2>${esc(me.user.display_name)}</h2><p class="muted">${esc(me.user.email || `ID ${me.user.id}`)}</p></div>
    </section>
    <div class="badges profile-badges">${roleBadges}</div>
    <section class="settings-section">
      ${coachMemberships().length || isAdmin() ? settingsRow({ id: 'trainerPanelRow', iconName: 'trainer', tint: 'indigo', title: 'Панель тренера', subtitle: 'Клієнти, програми та прогрес' }) : ''}
      ${businessMemberships().length ? settingsRow({ id: 'businessPanelRow', iconName: 'business', tint: 'blue', title: 'Бізнес-панель', subtitle: 'Тренери, клієнти та статистика' }) : ''}
      ${isAdmin() ? settingsRow({ id: 'adminPanelRow', iconName: 'admin', tint: 'red', title: 'Адмін-панель', subtitle: 'Користувачі та workspaces платформи' }) : ''}
      ${canInvite() ? settingsRow({ id: 'invitesRow', iconName: 'invite', tint: 'green', title: 'Запрошення', subtitle: 'Створення кодів для нових користувачів' }) : ''}
    </section>
    <section class="settings-section">
      ${settingsRow({ id: 'refreshAccountRow', iconName: 'refresh', title: 'Оновити доступи', subtitle: 'Перевірити актуальні ролі та workspaces' })}
      ${settingsRow({ id: 'logoutRow', iconName: 'logout', title: 'Вийти', danger: true })}
    </section>`;
  $('#trainerPanelRow')?.addEventListener('click', () => setRoute('trainer'));
  $('#businessPanelRow')?.addEventListener('click', () => setRoute('business'));
  $('#adminPanelRow')?.addEventListener('click', () => setRoute('admin'));
  $('#invitesRow')?.addEventListener('click', () => setRoute('invites'));
  $('#refreshAccountRow')?.addEventListener('click', async () => {
    try { me = await api('/api/me'); renderBottomNav(); renderProfile(); toast('Доступи оновлено'); }
    catch (e) { toast(e.message, 5000); }
  });
  $('#logoutRow')?.addEventListener('click', logout);
}

function workspaceOptions(list = memberships()) {
  return list.map(m => `<option value="${esc(m.workspace_id)}">${esc(m.workspace_name)} · ${esc(m.role)}</option>`).join('');
}

async function renderInvites() {
  const ms = memberships();
  panel.innerHTML = `${screenHeader('Запрошення', 'Новий користувач входить у той самий VARANGYM через свій Passkey.')}
    <section class="card">
      <div class="form-grid">
        <label>Тип<select id="inviteRole">
          ${isAdmin() ? '<option value="solo_client">Solo client</option><option value="independent_trainer">Independent trainer</option><option value="organization_owner">Organization owner</option><option value="platform_admin">Platform admin</option>' : ''}
          <option value="client">Client</option><option value="trainer">Trainer</option><option value="organization_admin">Organization admin</option>
        </select></label>
        <label>Workspace<select id="inviteWorkspace"><option value="">— без workspace —</option>${workspaceOptions(ms)}</select></label>
        <label>Email<input id="inviteEmail" type="email" placeholder="необовʼязково" /></label>
        <label>Trainer user ID<input id="inviteTrainer" placeholder="для client за потреби" /></label>
        <label>Кількість використань<input id="inviteUses" type="number" min="1" max="500" value="1" /></label>
        <label>Днів дії<input id="inviteDays" type="number" min="1" max="365" value="7" /></label>
        <label class="span-2">Назва organization/workspace<input id="inviteOrgName" placeholder="для Organization owner / Independent trainer" /></label>
        <button id="createInviteBtn" class="primary span-2">Створити код</button>
      </div>
      <div id="inviteResult"></div>
    </section>`;
  $('#createInviteBtn').onclick = async () => {
    try {
      const body = {
        targetRole: $('#inviteRole').value,
        workspaceId: $('#inviteWorkspace').value || null,
        trainerUserId: $('#inviteTrainer').value.trim() || null,
        email: $('#inviteEmail').value.trim() || null,
        maxUses: +$('#inviteUses').value || 1,
        expiresInDays: +$('#inviteDays').value || 7,
        metadata: {
          organizationName: $('#inviteOrgName').value.trim() || undefined,
          workspaceName: $('#inviteOrgName').value.trim() || undefined
        }
      };
      const r = await api('/api/invites', { method: 'POST', body: JSON.stringify(body) });
      $('#inviteResult').innerHTML = `<div class="invite-result"><div class="eyebrow">Новий код</div><h2 class="code">${esc(r.code)}</h2><p class="muted">${esc(r.invite.target_role)} · дійсний до ${new Date(r.invite.expires_at).toLocaleString()}</p><button id="copyInvite" class="ghost">Скопіювати</button></div>`;
      $('#copyInvite').onclick = () => navigator.clipboard.writeText(r.code).then(() => toast('Код скопійовано'));
    } catch (e) { toast(e.message, 5000); }
  };
}

async function renderBusiness() {
  const choices = businessMemberships();
  if (!choices.length) {
    panel.innerHTML = `${screenHeader('Бізнес-панель')}<div class="empty-state">Немає Business workspace у твоєму профілі.</div>`;
    return;
  }
  const m = choices[0];
  const d = await api(`/api/business/overview?workspaceId=${encodeURIComponent(m.workspace_id)}`);
  panel.innerHTML = `${screenHeader('Бізнес-панель', d.workspace.name)}
    <div class="metric-grid"><div class="metric"><span>Тренери</span><b>${d.stats.trainers}</b></div><div class="metric"><span>Клієнти</span><b>${d.stats.clients}</b></div><div class="metric"><span>Менеджери</span><b>${d.stats.managers}</b></div></div>
    <section class="card"><div class="section-title"><h2>Тренери</h2></div><div class="native-list">${d.trainers.length ? d.trainers.map(t => `<div class="native-list-row"><div><strong>${esc(t.display_name)}</strong><small>${esc(t.email || t.id)}</small></div><span class="badge">${t.clients} clients</span></div>`).join('') : '<div class="empty-state compact">Ще немає тренерів.</div>'}</div></section>`;
}

async function renderAdmin() {
  const [d, ws] = await Promise.all([api('/api/admin/overview'), api('/api/admin/workspaces')]);
  panel.innerHTML = `${screenHeader('Адмін-панель', 'VARANGYM Platform')}
    <div class="metric-grid"><div class="metric"><span>Користувачі</span><b>${d.users.total}</b></div><div class="metric"><span>Організації</span><b>${d.workspaces.organizations}</b></div><div class="metric"><span>Trainer-client links</span><b>${d.trainerClientLinks}</b></div></div>
    <section class="card"><div class="section-title"><h2>Workspaces</h2></div><div class="native-list">${ws.workspaces.map(w => `<div class="native-list-row"><div><strong>${esc(w.name)}</strong><small>${esc(w.type)} · ${esc(w.slug)}</small></div><div class="badges"><span class="badge">${w.trainers} trainers</span><span class="badge">${w.clients} clients</span></div></div>`).join('')}</div></section>`;
}

async function renderRoute() {
  if (!me) return;
  activeRoute = normalizeRoute(location.hash);
  renderBottomNav();
  try {
    if (activeRoute === 'training') return showTraining('client');
    if (activeRoute === 'trainer') return showTraining('coach');
    showManagement();
    panel.innerHTML = '<div class="skeleton-page"><div></div><div></div><div></div></div>';
    if (activeRoute === 'profile') return renderProfile();
    if (activeRoute === 'invites') return renderInvites();
    if (activeRoute === 'business') return renderBusiness();
    if (activeRoute === 'admin') return renderAdmin();
  } catch (e) {
    showManagement();
    panel.innerHTML = `${screenHeader('Помилка')}<div class="empty-state">${esc(e.message)}</div>`;
  }
}

function showApp() {
  bootView.classList.add('hidden');
  authView.classList.add('hidden');
  appView.classList.remove('hidden');
  const initials = (me.user.display_name || '?').slice(0, 1).toUpperCase();
  $('#accountBtn').textContent = initials;
  $('#accountBtn').title = me.user.display_name || 'Profile';
  if (!location.hash) history.replaceState(null, '', '#/training');
  renderRoute();
}

function showAuth() {
  bootView.classList.add('hidden');
  appView.classList.add('hidden');
  authView.classList.remove('hidden');
}

async function logout() {
  try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch {}
  location.hash = '';
  location.reload();
}

$('#registerBtn').onclick = () => register().catch(e => toast(e.message, 5000));
$('#loginBtn').onclick = () => login().catch(e => toast(e.message, 5000));
$('#accountBtn').onclick = () => setRoute('profile');
$('#brandBtn').onclick = () => setRoute('training');
window.addEventListener('hashchange', () => renderRoute());

(async () => {
  try { me = await api('/api/me'); showApp(); }
  catch { showAuth(); }
})();
