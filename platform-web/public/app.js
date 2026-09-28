const $ = s => document.querySelector(s);
const authView = $('#authView');
const appView = $('#appView');
const panel = $('#panel');
let me = null;
let activeTab = 'home';

function toast(message, ms = 3000) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), ms);
}

async function api(path, options = {}) {
  const res = await fetch(path, { credentials: 'include', ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
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
    response: {
      clientDataJSON: bufferToB64url(response.clientDataJSON)
    },
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
  const start = await api('/api/auth/register/options', { method: 'POST', body: JSON.stringify({ code, name, email: email || null }) });
  $('#regRole').textContent = `Роль із запрошення: ${start.targetRole}`;
  const credential = await navigator.credentials.create({ publicKey: creationOptions(start.options) });
  const result = await api('/api/auth/register/verify', { method: 'POST', body: JSON.stringify({ cid: start.cid, credential: serializeCredential(credential), locale }) });
  me = result;
  toast('Профіль створено');
  showApp();
}

async function login() {
  if (!window.PublicKeyCredential) throw new Error('Цей браузер не підтримує Passkeys');
  const start = await api('/api/auth/login/options', { method: 'POST', body: '{}' });
  const credential = await navigator.credentials.get({ publicKey: requestOptions(start.options) });
  me = await api('/api/auth/login/verify', { method: 'POST', body: JSON.stringify({ cid: start.cid, credential: serializeCredential(credential) }) });
  toast('Вхід виконано');
  showApp();
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function memberships() { return me?.memberships || []; }
function isAdmin() { return !!me?.user?.is_platform_admin; }
function coachMemberships() { return memberships().filter(x => ['owner','admin','trainer'].includes(x.role)); }
function businessMemberships() { return memberships().filter(x => x.workspace_type === 'organization' && ['owner','admin'].includes(x.role)); }

function showApp() {
  authView.classList.add('hidden');
  appView.classList.remove('hidden');
  $('#logoutBtn').classList.remove('hidden');
  $('#hello').textContent = `Привіт, ${me.user.display_name}`;
  $('#identity').textContent = me.user.email || `ID ${me.user.id}`;
  $('#roleBadges').innerHTML = [isAdmin() ? '<span class="badge">Platform Admin</span>' : '', ...memberships().map(m => `<span class="badge">${esc(m.workspace_name)} · ${esc(m.role)}</span>`)].join('');
  renderTabs();
  renderActive();
}

function showAuth() {
  appView.classList.add('hidden');
  authView.classList.remove('hidden');
  $('#logoutBtn').classList.add('hidden');
}

function renderTabs() {
  const tabs = [{ id: 'home', label: 'Огляд' }, { id: 'invites', label: 'Запрошення' }];
  if (coachMemberships().length || isAdmin()) tabs.push({ id: 'coach', label: 'Coach' });
  if (businessMemberships().length || isAdmin()) tabs.push({ id: 'business', label: 'Business' });
  if (isAdmin()) tabs.push({ id: 'admin', label: 'Admin' });
  $('#tabs').innerHTML = tabs.map(t => `<button class="tab ${activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('');
  $('#tabs').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { activeTab = b.dataset.tab; renderTabs(); renderActive(); });
}

async function renderActive() {
  panel.innerHTML = '<div class="empty">Завантаження…</div>';
  try {
    if (activeTab === 'home') return renderHome();
    if (activeTab === 'invites') return renderInvites();
    if (activeTab === 'coach') return renderCoach();
    if (activeTab === 'business') return renderBusiness();
    if (activeTab === 'admin') return renderAdmin();
  } catch (e) { panel.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

function renderHome() {
  const ms = memberships();
  panel.innerHTML = `
    <div class="section-title"><h2>Твій varangym</h2></div>
    <div class="grid">
      <div class="metric"><span class="muted">Workspaces</span><b>${ms.length}</b></div>
      <div class="metric"><span class="muted">Ролі</span><b>${new Set(ms.map(x => x.role)).size + (isAdmin() ? 1 : 0)}</b></div>
      <div class="metric"><span class="muted">Мова</span><b>${esc(me.user.locale)}</b></div>
    </div>
    <div class="list">${ms.length ? ms.map(m => `<div class="row"><div class="row-main"><div class="row-title">${esc(m.workspace_name)}</div><div class="row-sub">${esc(m.workspace_type)} · ${esc(m.role)}</div></div><span class="badge">${esc(m.workspace_slug)}</span></div>`).join('') : '<div class="empty">Немає workspace memberships.</div>'}</div>`;
}

function workspaceOptions(list = memberships()) {
  return list.map(m => `<option value="${esc(m.workspace_id)}">${esc(m.workspace_name)} · ${esc(m.role)}</option>`).join('');
}

async function renderInvites() {
  const ms = memberships();
  panel.innerHTML = `
    <div class="section-title"><h2>Створити запрошення</h2></div>
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
    <div id="inviteResult"></div>`;
  $('#createInviteBtn').onclick = async () => {
    try {
      const body = {
        targetRole: $('#inviteRole').value,
        workspaceId: $('#inviteWorkspace').value || null,
        trainerUserId: $('#inviteTrainer').value.trim() || null,
        email: $('#inviteEmail').value.trim() || null,
        maxUses: +$('#inviteUses').value || 1,
        expiresInDays: +$('#inviteDays').value || 7,
        metadata: { organizationName: $('#inviteOrgName').value.trim() || undefined, workspaceName: $('#inviteOrgName').value.trim() || undefined }
      };
      const r = await api('/api/invites', { method: 'POST', body: JSON.stringify(body) });
      $('#inviteResult').innerHTML = `<div class="card" style="margin-top:16px"><div class="eyebrow">Новий код</div><h2 class="code">${esc(r.code)}</h2><p class="muted">${esc(r.invite.target_role)} · дійсний до ${new Date(r.invite.expires_at).toLocaleString()}</p><button id="copyInvite" class="ghost">Скопіювати</button></div>`;
      $('#copyInvite').onclick = () => navigator.clipboard.writeText(r.code).then(() => toast('Код скопійовано'));
    } catch (e) { toast(e.message, 5000); }
  };
}

async function renderCoach() {
  const choices = coachMemberships();
  if (!choices.length && !isAdmin()) { panel.innerHTML = '<div class="empty">Немає Coach workspace.</div>'; return; }
  const workspaceId = choices[0]?.workspace_id;
  if (!workspaceId) { panel.innerHTML = '<div class="empty">Для Platform Admin відкрий конкретний workspace через Business/Admin; глобального списку клієнтів тут навмисно немає.</div>'; return; }
  const data = await api(`/api/coach/clients?workspaceId=${encodeURIComponent(workspaceId)}`);
  panel.innerHTML = `<div class="section-title"><div><h2>Coach</h2><div class="muted">${esc(choices[0].workspace_name)}</div></div><span class="badge">${data.clients.length} clients</span></div>
    <div class="list">${data.clients.length ? data.clients.map(c => `<div class="row"><div class="row-main"><div class="row-title">${esc(c.display_name)}</div><div class="row-sub">Trainer: ${esc(c.trainer_name)} · 30 днів: ${c.workouts_30d} тренувань</div></div><div class="muted">${c.last_workout_at ? new Date(c.last_workout_at).toLocaleDateString() : 'без тренувань'}</div></div>`).join('') : '<div class="empty">Ще немає клієнтів. Створи Client invite.</div>'}</div>`;
}

async function renderBusiness() {
  const choices = businessMemberships();
  if (!choices.length) { panel.innerHTML = '<div class="empty">Немає Business workspace у твоєму профілі.</div>'; return; }
  const m = choices[0];
  const d = await api(`/api/business/overview?workspaceId=${encodeURIComponent(m.workspace_id)}`);
  panel.innerHTML = `<div class="section-title"><div><h2>Business</h2><div class="muted">${esc(d.workspace.name)}</div></div></div>
    <div class="grid"><div class="metric"><span class="muted">Trainers</span><b>${d.stats.trainers}</b></div><div class="metric"><span class="muted">Clients</span><b>${d.stats.clients}</b></div><div class="metric"><span class="muted">Managers</span><b>${d.stats.managers}</b></div></div>
    <h3 style="margin-top:22px">Тренери</h3><div class="list">${d.trainers.length ? d.trainers.map(t => `<div class="row"><div class="row-main"><div class="row-title">${esc(t.display_name)}</div><div class="row-sub">${esc(t.email || t.id)}</div></div><span class="badge">${t.clients} clients</span></div>`).join('') : '<div class="empty">Ще немає тренерів.</div>'}</div>`;
}

async function renderAdmin() {
  const [d, ws] = await Promise.all([api('/api/admin/overview'), api('/api/admin/workspaces')]);
  panel.innerHTML = `<div class="section-title"><h2>Admin</h2><span class="badge">Platform</span></div>
    <div class="grid"><div class="metric"><span class="muted">Users</span><b>${d.users.total}</b></div><div class="metric"><span class="muted">Organizations</span><b>${d.workspaces.organizations}</b></div><div class="metric"><span class="muted">Trainer-client links</span><b>${d.trainerClientLinks}</b></div></div>
    <h3 style="margin-top:22px">Workspaces</h3><div class="list">${ws.workspaces.map(w => `<div class="row"><div class="row-main"><div class="row-title">${esc(w.name)}</div><div class="row-sub">${esc(w.type)} · ${esc(w.slug)}</div></div><div class="actions"><span class="badge">${w.trainers} trainers</span><span class="badge">${w.clients} clients</span></div></div>`).join('')}</div>`;
}

$('#registerBtn').onclick = () => register().catch(e => toast(e.message, 5000));
$('#loginBtn').onclick = () => login().catch(e => toast(e.message, 5000));
$('#logoutBtn').onclick = async () => { try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch {} me = null; showAuth(); };
$('#refreshBtn').onclick = async () => { try { me = await api('/api/me'); showApp(); toast('Оновлено'); } catch (e) { toast(e.message); } };

(async () => {
  try { me = await api('/api/me'); showApp(); }
  catch { showAuth(); }
})();
