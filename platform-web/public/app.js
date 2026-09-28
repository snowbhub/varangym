const $ = s => document.querySelector(s);
const authView = $('#authView');
const appView = $('#appView');
const panel = $('#panel');
let me = null;
let activeTab = 'home';

function toast(message, ms = 3200) {
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

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function dateText(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString(); } catch { return String(v); }
}

function memberships() { return me?.memberships || []; }
function isAdmin() { return !!me?.user?.is_platform_admin; }
function coachMemberships() { return memberships().filter(x => ['owner', 'admin', 'trainer'].includes(x.role)); }
function businessMemberships() { return memberships().filter(x => x.workspace_type === 'organization' && ['owner', 'admin'].includes(x.role)); }
function clientMemberships() { return memberships().filter(x => x.role === 'client'); }

async function register() {
  if (!window.PublicKeyCredential) throw new Error('Цей браузер не підтримує Passkeys');
  const code = $('#regCode').value.trim();
  const name = $('#regName').value.trim();
  const email = $('#regEmail').value.trim();
  const locale = $('#regLocale').value;
  if (!code || !name) throw new Error('Введи код і імʼя');

  const start = await api('/api/auth/register/options', {
    method: 'POST',
    body: JSON.stringify({ code, name, email: email || null })
  });
  $('#regRole').textContent = `Код дійсний · роль: ${start.targetRole}`;

  const credential = await navigator.credentials.create({ publicKey: creationOptions(start.options) });
  const result = await api('/api/auth/register/verify', {
    method: 'POST',
    body: JSON.stringify({ cid: start.cid, credential: serializeCredential(credential), locale })
  });
  me = result;
  toast('Профіль створено');
  showApp();
}

async function login() {
  if (!window.PublicKeyCredential) throw new Error('Цей браузер не підтримує Passkeys');
  const start = await api('/api/auth/login/options', { method: 'POST', body: '{}' });
  const credential = await navigator.credentials.get({ publicKey: requestOptions(start.options) });
  me = await api('/api/auth/login/verify', {
    method: 'POST',
    body: JSON.stringify({ cid: start.cid, credential: serializeCredential(credential) })
  });
  toast('Вхід виконано');
  showApp();
}

function showApp() {
  authView.classList.add('hidden');
  appView.classList.remove('hidden');
  $('#logoutBtn').classList.remove('hidden');
  $('#hello').textContent = me.user.display_name;
  $('#identity').textContent = me.user.email || `ID ${me.user.id}`;
  $('#roleBadges').innerHTML = [
    isAdmin() ? '<span class="badge badge-accent">Platform Admin</span>' : '',
    ...memberships().map(m => `<span class="badge">${esc(m.workspace_name)} · ${esc(m.role)}</span>`)
  ].join('');
  renderTabs();
  renderActive();
}

function showAuth() {
  appView.classList.add('hidden');
  authView.classList.remove('hidden');
  $('#logoutBtn').classList.add('hidden');
}

function renderTabs() {
  const tabs = [
    { id: 'home', label: 'Огляд' },
    { id: 'training', label: 'Training' },
    { id: 'invites', label: 'Запрошення' }
  ];
  if (coachMemberships().length || isAdmin()) tabs.push({ id: 'coach', label: 'Coach' });
  if (businessMemberships().length || isAdmin()) tabs.push({ id: 'business', label: 'Business' });
  if (isAdmin()) tabs.push({ id: 'admin', label: 'Admin' });

  $('#tabs').innerHTML = tabs.map(t => `<button class="tab ${activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('');
  $('#tabs').querySelectorAll('[data-tab]').forEach(b => {
    b.onclick = () => {
      activeTab = b.dataset.tab;
      renderTabs();
      renderActive();
    };
  });
}

async function renderActive() {
  panel.innerHTML = '<div class="empty">Завантаження…</div>';
  try {
    if (activeTab === 'home') return await renderHome();
    if (activeTab === 'training') return await renderTraining();
    if (activeTab === 'invites') return await renderInvites();
    if (activeTab === 'coach') return await renderCoach();
    if (activeTab === 'business') return await renderBusiness();
    if (activeTab === 'admin') return await renderAdmin();
  } catch (e) {
    panel.innerHTML = `<div class="empty error-box"><b>Помилка</b><br>${esc(e.message)}</div>`;
  }
}

async function renderHome() {
  const ms = memberships();
  let extra = null;
  if (isAdmin()) extra = await api('/api/admin/overview').catch(() => null);

  panel.innerHTML = `
    <div class="section-title">
      <div><div class="eyebrow">Dashboard</div><h2>Огляд varangym</h2></div>
      <span class="status-pill">● online</span>
    </div>
    <div class="grid metrics-grid">
      <div class="metric"><span class="muted">Workspaces</span><b>${ms.length}</b><small>доступні цьому акаунту</small></div>
      <div class="metric"><span class="muted">Ролі</span><b>${new Set(ms.map(x => x.role)).size + (isAdmin() ? 1 : 0)}</b><small>активних ролей</small></div>
      <div class="metric"><span class="muted">Мова</span><b class="metric-word">${esc(me.user.locale.toUpperCase())}</b><small>профіль користувача</small></div>
      ${extra ? `<div class="metric"><span class="muted">Users</span><b>${extra.users.total}</b><small>${extra.users.active} active</small></div>` : ''}
      ${extra ? `<div class="metric"><span class="muted">Organizations</span><b>${extra.workspaces.organizations}</b><small>${extra.workspaces.independent_trainers} independent coaches</small></div>` : ''}
      ${extra ? `<div class="metric"><span class="muted">Active invites</span><b>${extra.invites.usable}</b><small>ще можна використати</small></div>` : ''}
    </div>
    <div class="split-section">
      <div>
        <h3>Доступи</h3>
        <div class="list">${ms.length ? ms.map(m => `<div class="row"><div class="row-main"><div class="row-title">${esc(m.workspace_name)}</div><div class="row-sub">${esc(m.workspace_type)} · ${esc(m.role)}</div></div><span class="badge">${esc(m.workspace_slug)}</span></div>`).join('') : '<div class="empty">Це platform-only акаунт без workspace membership.</div>'}</div>
      </div>
      <div class="info-card">
        <div class="eyebrow">Що вже живе</div>
        <h3>Одна база, один login</h3>
        <p class="muted">Admin, Coach, Business і Training працюють через одну PostgreSQL-базу та одну Passkey-сесію. Це вже не окрема сторінка поверх openGym — training API читає ті самі акаунти й ролі.</p>
      </div>
    </div>`;
}

async function renderTraining() {
  const locale = encodeURIComponent(me.user.locale || 'en');
  const [health, exerciseData, active] = await Promise.all([
    api('/api/training/health'),
    api(`/api/training/exercises?scope=global&limit=18&locale=${locale}`),
    api('/api/training/client/program').catch(() => ({ program: null, days: [] }))
  ]);

  panel.innerHTML = `
    <div class="section-title">
      <div><div class="eyebrow">Workout engine</div><h2>Training</h2></div>
      <span class="badge badge-accent">${health.exercises} exercises</span>
    </div>
    ${active.program ? `
      <div class="program-hero">
        <div><div class="eyebrow">Активна програма</div><h3>${esc(active.program.name)}</h3><p class="muted">v${active.program.version_number} · Coach: ${esc(active.program.trainer_name || '—')}</p></div>
        <span class="status-pill">published</span>
      </div>
      <div class="day-grid">${active.days.map(d => `<div class="day-card"><b>${esc(d.title)}</b><span>${d.exercises.length} вправ</span>${d.exercises.slice(0, 4).map(x => `<small>${esc(x.name)}</small>`).join('')}</div>`).join('')}</div>` : `
      <div class="info-card"><div class="eyebrow">Програма</div><h3>Поки немає призначеної програми</h3><p class="muted">Для solo-користувача це нормально. Для клієнта тренер зможе створити й опублікувати програму через Coach.</p></div>`}
    <div class="section-title section-gap"><div><h3>Глобальна бібліотека</h3><div class="muted">Реальні вправи з training backend</div></div></div>
    <div class="search-row"><input id="exerciseSearch" placeholder="Пошук вправи…"/><button id="exerciseSearchBtn" class="ghost">Знайти</button></div>
    <div id="exerciseList" class="exercise-grid">${exerciseCards(exerciseData.exercises)}</div>`;

  $('#exerciseSearchBtn').onclick = async () => {
    const q = $('#exerciseSearch').value.trim();
    const d = await api(`/api/training/exercises?scope=global&limit=30&locale=${locale}&q=${encodeURIComponent(q)}`);
    $('#exerciseList').innerHTML = exerciseCards(d.exercises);
  };
  $('#exerciseSearch').onkeydown = e => { if (e.key === 'Enter') $('#exerciseSearchBtn').click(); };
}

function exerciseCards(exercises) {
  if (!exercises?.length) return '<div class="empty">Нічого не знайдено.</div>';
  return exercises.map(x => `
    <div class="exercise-card">
      <div class="exercise-icon">${esc((x.name || '?').slice(0, 1).toUpperCase())}</div>
      <div><b>${esc(x.name)}</b><small>${esc(x.primary_muscle_key || x.metadata?.target || 'exercise')}</small><small>${esc(x.equipment_key || '')}</small></div>
    </div>`).join('');
}

function workspaceOptions(list = memberships()) {
  return list.map(m => `<option value="${esc(m.workspace_id)}">${esc(m.workspace_name)} · ${esc(m.role)}</option>`).join('');
}

function inviteStatus(i) {
  if (i.revoked_at) return ['revoked', 'Відкликаний'];
  if (Number(i.use_count) >= Number(i.max_uses)) return ['used', 'Використаний'];
  if (new Date(i.expires_at).getTime() <= Date.now()) return ['expired', 'Протермінований'];
  return ['active', 'Активний'];
}

async function inviteListData() {
  if (isAdmin()) return api('/api/invites');
  const preferred = coachMemberships()[0] || memberships()[0];
  if (!preferred) return { invites: [] };
  return api(`/api/invites?workspaceId=${encodeURIComponent(preferred.workspace_id)}`);
}

async function renderInvites() {
  const ms = memberships();
  const listed = await inviteListData();
  panel.innerHTML = `
    <div class="section-title">
      <div><div class="eyebrow">Access</div><h2>Запрошення</h2></div>
      <span class="badge">${listed.invites.length} records</span>
    </div>
    <div class="invite-layout">
      <div class="form-card">
        <h3>Новий код</h3>
        <div class="form-grid compact">
          <label>Тип<select id="inviteRole">
            ${isAdmin() ? '<option value="solo_client">Solo client</option><option value="independent_trainer">Independent trainer</option><option value="organization_owner">Organization owner</option><option value="platform_admin">Platform admin</option>' : ''}
            <option value="client">Client</option><option value="trainer">Trainer</option><option value="organization_admin">Organization admin</option>
          </select></label>
          <label>Workspace<select id="inviteWorkspace"><option value="">— без workspace —</option>${workspaceOptions(ms)}</select></label>
          <label>Email<input id="inviteEmail" type="email" placeholder="не привʼязувати" /></label>
          <label>Trainer user ID<input id="inviteTrainer" placeholder="опційно" /></label>
          <label>Використань<input id="inviteUses" type="number" min="1" max="500" value="1" /></label>
          <label>Днів дії<input id="inviteDays" type="number" min="1" max="365" value="7" /></label>
          <label class="span-2">Назва organization/workspace<input id="inviteOrgName" placeholder="потрібно для Organization / Independent trainer" /></label>
          <button id="createInviteBtn" class="primary span-2">Створити і перевірити код</button>
        </div>
        <div id="inviteResult"></div>
      </div>
      <div>
        <div class="inline-note"><b>Коди зберігаються в базі.</b><span>Сам секретний код показується лише в момент створення. Після перезавантаження видно запис, статус, роль, email і використання; це нормальна security-модель.</span></div>
        <div id="inviteHistory" class="list">${renderInviteRows(listed.invites)}</div>
      </div>
    </div>`;

  $('#createInviteBtn').onclick = async () => {
    const btn = $('#createInviteBtn');
    try {
      btn.disabled = true;
      btn.textContent = 'Створюю…';
      const role = $('#inviteRole').value;
      const workspaceId = $('#inviteWorkspace').value || null;
      const email = $('#inviteEmail').value.trim() || null;
      if (['client', 'trainer', 'organization_admin'].includes(role) && !workspaceId) {
        throw new Error('Для цього типу треба вибрати workspace');
      }
      const name = $('#inviteOrgName').value.trim();
      const body = {
        targetRole: role,
        workspaceId,
        trainerUserId: $('#inviteTrainer').value.trim() || null,
        email,
        maxUses: +$('#inviteUses').value || 1,
        expiresInDays: +$('#inviteDays').value || 7,
        metadata: { organizationName: name || undefined, workspaceName: name || undefined }
      };
      const r = await api('/api/invites', { method: 'POST', body: JSON.stringify(body) });

      let verified = false;
      let verifyError = '';
      try {
        const check = await api('/api/auth/register/options', {
          method: 'POST',
          body: JSON.stringify({ code: r.code, name: 'Invite check', email })
        });
        verified = check.targetRole === r.invite.target_role;
      } catch (e) { verifyError = e.message; }

      $('#inviteResult').innerHTML = `
        <div class="code-card ${verified ? 'verified' : 'warning'}">
          <div><div class="eyebrow">${verified ? '✓ сервер підтвердив код' : '⚠ код створено, але test не пройшов'}</div><h2 class="code">${esc(r.code)}</h2><p class="muted">${esc(r.invite.target_role)} · до ${dateText(r.invite.expires_at)}${verifyError ? ` · ${esc(verifyError)}` : ''}</p></div>
          <button id="copyInvite" class="ghost">Скопіювати</button>
        </div>`;
      $('#copyInvite').onclick = () => navigator.clipboard.writeText(r.code).then(() => toast('Код скопійовано'));

      $('#inviteEmail').value = '';
      $('#inviteTrainer').value = '';
      $('#inviteOrgName').value = '';
      $('#inviteUses').value = '1';
      const fresh = await inviteListData();
      $('#inviteHistory').innerHTML = renderInviteRows(fresh.invites);
      bindInviteActions();
      toast(verified ? 'Код створено і перевірено' : 'Код створено, але перевірка не пройшла', 5000);
    } catch (e) {
      toast(e.message, 5000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Створити і перевірити код';
    }
  };
  bindInviteActions();
}

function renderInviteRows(invites) {
  if (!invites?.length) return '<div class="empty">Ще немає створених запрошень.</div>';
  return invites.map(i => {
    const [state, label] = inviteStatus(i);
    return `<div class="row invite-row">
      <div class="row-main">
        <div class="row-title">${esc(i.target_role)} ${i.email ? `· ${esc(i.email)}` : ''}</div>
        <div class="row-sub">${i.workspace_id ? `workspace ${esc(i.workspace_id.slice(0, 8))} · ` : ''}${i.use_count}/${i.max_uses} використано · до ${dateText(i.expires_at)}</div>
      </div>
      <div class="actions"><span class="status ${state}">${label}</span>${state === 'active' ? `<button class="tiny danger" data-revoke="${esc(i.id)}">Відкликати</button>` : ''}</div>
    </div>`;
  }).join('');
}

function bindInviteActions() {
  document.querySelectorAll('[data-revoke]').forEach(b => {
    b.onclick = async () => {
      try {
        await api('/api/invites/revoke', { method: 'POST', body: JSON.stringify({ id: b.dataset.revoke }) });
        toast('Запрошення відкликано');
        await renderInvites();
      } catch (e) { toast(e.message, 5000); }
    };
  });
}

async function renderCoach() {
  const choices = coachMemberships();
  if (!choices.length && !isAdmin()) {
    panel.innerHTML = '<div class="empty">Немає Coach workspace.</div>';
    return;
  }
  const workspaceId = choices[0]?.workspace_id;
  if (!workspaceId) {
    panel.innerHTML = '<div class="info-card"><h3>Platform Admin</h3><p class="muted">Coach працює в контексті конкретного workspace. Створи Independent Trainer або Organization і зайди під його Coach-акаунтом.</p></div>';
    return;
  }
  const data = await api(`/api/coach/clients?workspaceId=${encodeURIComponent(workspaceId)}`);
  panel.innerHTML = `
    <div class="section-title"><div><div class="eyebrow">Coach dashboard</div><h2>${esc(choices[0].workspace_name)}</h2></div><span class="badge badge-accent">${data.clients.length} clients</span></div>
    <div class="grid metrics-grid"><div class="metric"><span class="muted">Clients</span><b>${data.clients.length}</b></div><div class="metric"><span class="muted">Active 30d</span><b>${data.clients.filter(c => +c.workouts_30d > 0).length}</b></div><div class="metric"><span class="muted">Need attention</span><b>${data.clients.filter(c => !c.last_workout_at || Date.now() - new Date(c.last_workout_at).getTime() > 7 * 86400000).length}</b></div></div>
    <div class="list">${data.clients.length ? data.clients.map(c => `<div class="row client-row"><div class="avatar">${esc(c.display_name.slice(0,1).toUpperCase())}</div><div class="row-main"><div class="row-title">${esc(c.display_name)}</div><div class="row-sub">${esc(c.email || c.id)} · ${c.workouts_30d} тренувань / 30 днів</div></div><div class="right-meta"><b>${c.last_workout_at ? new Date(c.last_workout_at).toLocaleDateString() : '—'}</b><small>останнє тренування</small></div></div>`).join('') : '<div class="empty">Ще немає клієнтів. Створи Client invite.</div>'}</div>`;
}

async function renderBusiness() {
  const choices = businessMemberships();
  if (!choices.length) {
    panel.innerHTML = '<div class="info-card"><h3>Business</h3><p class="muted">У цьому акаунті немає organization workspace.</p></div>';
    return;
  }
  const m = choices[0];
  const d = await api(`/api/business/overview?workspaceId=${encodeURIComponent(m.workspace_id)}`);
  panel.innerHTML = `
    <div class="section-title"><div><div class="eyebrow">Business dashboard</div><h2>${esc(d.workspace.name)}</h2></div><span class="badge">${esc(d.workspace.type)}</span></div>
    <div class="grid metrics-grid"><div class="metric"><span class="muted">Trainers</span><b>${d.stats.trainers}</b></div><div class="metric"><span class="muted">Clients</span><b>${d.stats.clients}</b></div><div class="metric"><span class="muted">Managers</span><b>${d.stats.managers}</b></div></div>
    <div class="section-title section-gap"><h3>Тренери</h3></div>
    <div class="list">${d.trainers.length ? d.trainers.map(t => `<div class="row"><div class="avatar">${esc(t.display_name.slice(0,1).toUpperCase())}</div><div class="row-main"><div class="row-title">${esc(t.display_name)}</div><div class="row-sub">${esc(t.email || t.id)}</div></div><span class="badge">${t.clients} clients</span></div>`).join('') : '<div class="empty">Ще немає тренерів.</div>'}</div>`;
}

async function renderAdmin() {
  const [d, ws, invites] = await Promise.all([
    api('/api/admin/overview'),
    api('/api/admin/workspaces'),
    api('/api/invites')
  ]);
  const activeInvites = invites.invites.filter(i => inviteStatus(i)[0] === 'active').length;
  panel.innerHTML = `
    <div class="section-title"><div><div class="eyebrow">Platform control</div><h2>Admin</h2></div><span class="badge badge-accent">super admin</span></div>
    <div class="grid metrics-grid">
      <div class="metric"><span class="muted">Users</span><b>${d.users.total}</b><small>${d.users.active} active</small></div>
      <div class="metric"><span class="muted">Organizations</span><b>${d.workspaces.organizations}</b><small>${d.workspaces.independent_trainers} independent</small></div>
      <div class="metric"><span class="muted">Trainer-client links</span><b>${d.trainerClientLinks}</b><small>active links</small></div>
      <div class="metric"><span class="muted">Invites</span><b>${activeInvites}</b><small>active now</small></div>
    </div>
    <div class="section-title section-gap"><h3>Workspaces</h3><span class="muted">${ws.workspaces.length} total</span></div>
    <div class="list">${ws.workspaces.map(w => `<div class="row"><div class="row-main"><div class="row-title">${esc(w.name)}</div><div class="row-sub">${esc(w.type)} · ${esc(w.slug)} · ${w.members} members</div></div><div class="actions"><span class="badge">${w.trainers} trainers</span><span class="badge">${w.clients} clients</span></div></div>`).join('')}</div>`;
}

$('#registerBtn').onclick = () => register().catch(e => toast(e.message, 5000));
$('#loginBtn').onclick = () => login().catch(e => toast(e.message, 5000));
$('#logoutBtn').onclick = async () => {
  try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch {}
  me = null;
  showAuth();
};
$('#refreshBtn').onclick = async () => {
  try {
    me = await api('/api/me');
    showApp();
    toast('Оновлено');
  } catch (e) { toast(e.message); }
};

(async () => {
  try {
    me = await api('/api/me');
    showApp();
  } catch {
    showAuth();
  }
})();
