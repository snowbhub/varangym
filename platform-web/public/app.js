const $ = s => document.querySelector(s);
const authView = $('#authView');
const appView = $('#appView');
const panel = $('#panel');
let me = null;
let activeTab = null;
let workoutDraft = [];
let clientProgram = null;
let clientDays = [];

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
function hasRole(...roles) { return memberships().some(x => roles.includes(x.role)); }
function coachMemberships() { return memberships().filter(x => ['owner', 'admin', 'trainer'].includes(x.role)); }
function businessMemberships() { return memberships().filter(x => x.workspace_type === 'organization' && ['owner', 'admin'].includes(x.role)); }
function clientOnly() { return !isAdmin() && hasRole('client') && !hasRole('owner', 'admin', 'trainer'); }
function canInvite() { return isAdmin() || hasRole('owner', 'admin', 'trainer'); }

function tabsForUser() {
  if (clientOnly()) return [{ id: 'training', label: 'Training' }];
  if (isAdmin()) return [
    { id: 'admin', label: 'Admin' },
    { id: 'invites', label: 'Запрошення' },
    { id: 'training', label: 'Training' },
    { id: 'coach', label: 'Coach' },
    { id: 'business', label: 'Business' }
  ];
  const tabs = [];
  if (businessMemberships().length) tabs.push({ id: 'business', label: 'Business' });
  if (coachMemberships().length) tabs.push({ id: 'coach', label: 'Coach' });
  if (hasRole('client', 'trainer', 'owner', 'admin')) tabs.push({ id: 'training', label: 'Training' });
  if (canInvite()) tabs.push({ id: 'invites', label: 'Запрошення' });
  return tabs.length ? tabs : [{ id: 'training', label: 'Training' }];
}

function defaultTab() {
  if (clientOnly()) return 'training';
  if (isAdmin()) return 'admin';
  if (businessMemberships().length) return 'business';
  if (coachMemberships().length) return 'coach';
  return 'training';
}

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
  me = await api('/api/auth/register/verify', {
    method: 'POST',
    body: JSON.stringify({ cid: start.cid, credential: serializeCredential(credential), locale })
  });
  activeTab = defaultTab();
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
  activeTab = defaultTab();
  toast('Вхід виконано');
  showApp();
}

function showApp() {
  authView.classList.add('hidden');
  appView.classList.remove('hidden');
  $('#logoutBtn').classList.remove('hidden');
  $('#hello').textContent = me.user.display_name;
  $('#identity').textContent = me.user.email || '';

  if (clientOnly()) {
    $('#roleBadges').innerHTML = '<span class="badge badge-accent">VARANGYM · client</span>';
    document.body.classList.add('client-mode');
  } else {
    document.body.classList.remove('client-mode');
    $('#roleBadges').innerHTML = [
      isAdmin() ? '<span class="badge badge-accent">Platform Admin</span>' : '',
      ...memberships().map(m => `<span class="badge">${esc(m.workspace_name)} · ${esc(m.role)}</span>`)
    ].join('');
  }

  const allowed = tabsForUser();
  if (!activeTab || !allowed.some(t => t.id === activeTab)) activeTab = defaultTab();
  renderTabs();
  renderActive();
}

function showAuth() {
  appView.classList.add('hidden');
  authView.classList.remove('hidden');
  $('#logoutBtn').classList.add('hidden');
  document.body.classList.remove('client-mode');
}

function renderTabs() {
  const tabs = tabsForUser();
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
    if (activeTab === 'training') return await renderTraining();
    if (activeTab === 'invites') return await renderInvites();
    if (activeTab === 'coach') return await renderCoach();
    if (activeTab === 'business') return await renderBusiness();
    if (activeTab === 'admin') return await renderAdmin();
    activeTab = defaultTab();
    return renderActive();
  } catch (e) {
    panel.innerHTML = `<div class="empty error-box"><b>Помилка</b><br>${esc(e.message)}</div>`;
  }
}

async function renderTraining() {
  const locale = encodeURIComponent(me.user.locale || 'en');
  const [programResult, exercisesResult, historyResult] = await Promise.allSettled([
    api('/api/client/program'),
    api(`/api/client/exercises?limit=24&locale=${locale}`),
    api('/api/client/history')
  ]);

  const active = programResult.status === 'fulfilled' ? programResult.value : { program: null, days: [] };
  const exercises = exercisesResult.status === 'fulfilled' ? exercisesResult.value.exercises : [];
  const history = historyResult.status === 'fulfilled' ? historyResult.value.workouts : [];
  clientProgram = active.program || null;
  clientDays = active.days || [];

  panel.innerHTML = `
    <div class="client-training-head">
      <div><div class="eyebrow">VARANGYM TRAINING</div><h2>${clientProgram ? esc(clientProgram.name) : 'Тренування'}</h2>
      <p class="muted">${clientProgram ? `Coach: ${esc(clientProgram.trainer_name || '—')} · v${clientProgram.version_number}` : 'Обери вправи і починай тренування.'}</p></div>
      ${clientProgram ? '<span class="status-pill">активна програма</span>' : ''}
    </div>

    ${clientDays.length ? `<div class="day-grid">${clientDays.map((d, i) => `
      <button class="day-card day-button" data-start-day="${i}">
        <b>${esc(d.title || `День ${i + 1}`)}</b>
        <span>${d.exercises.length} вправ</span>
        ${d.exercises.slice(0,4).map(x => `<small>${esc(x.name)}</small>`).join('')}
      </button>`).join('')}</div>` : ''}

    <div class="workout-box">
      <div class="section-title"><div><div class="eyebrow">Поточне тренування</div><h3 id="workoutTitle">${workoutDraft.length ? 'Тренування' : 'Ще не почато'}</h3></div>${workoutDraft.length ? '<button id="finishWorkout" class="primary">Завершити</button>' : ''}</div>
      <div id="workoutDraft">${renderWorkoutDraft()}</div>
    </div>

    <div class="section-title section-gap"><div><h3>Вправи</h3><div class="muted">Пошук по бібліотеці</div></div></div>
    <div class="search-row"><input id="exerciseSearch" placeholder="Наприклад: bench, squat…"/><button id="exerciseSearchBtn" class="ghost">Знайти</button></div>
    <div id="exerciseList" class="exercise-grid">${exerciseCards(exercises)}</div>

    <div class="section-title section-gap"><div><h3>Останні тренування</h3></div></div>
    <div class="list">${history.length ? history.slice(0,8).map(w => `<div class="row"><div class="row-main"><div class="row-title">${esc(w.name)}</div><div class="row-sub">${dateText(w.started_at)}</div></div><span class="badge">${w.completed_sets || 0} sets</span></div>`).join('') : '<div class="empty">Історії ще немає.</div>'}</div>`;

  bindTrainingActions(locale);

  if (programResult.status === 'rejected' || exercisesResult.status === 'rejected') {
    console.error('[training]', programResult.reason, exercisesResult.reason);
    toast('Частина тренувального модуля ще не завантажилась', 4500);
  }
}

function exerciseCards(exercises) {
  if (!exercises?.length) return '<div class="empty">Вправи зараз не завантажились.</div>';
  return exercises.map(x => `
    <button class="exercise-card exercise-add" data-exercise-id="${esc(x.id)}" data-exercise-name="${esc(x.name)}">
      <div class="exercise-icon">${esc((x.name || '?').slice(0,1).toUpperCase())}</div>
      <div><b>${esc(x.name)}</b><small>${esc(x.primary_muscle_key || x.metadata?.target || '')}</small><small>${esc(x.equipment_key || '')}</small></div>
      <span class="add-mark">＋</span>
    </button>`).join('');
}

function renderWorkoutDraft() {
  if (!workoutDraft.length) return '<div class="empty">Натисни на день програми або додай вправу нижче.</div>';
  return workoutDraft.map((ex, ei) => `
    <div class="draft-exercise" data-draft-ex="${ei}">
      <div class="section-title"><div><b>${esc(ex.name)}</b></div><button class="tiny danger" data-remove-ex="${ei}">×</button></div>
      <div class="set-list">${ex.sets.map((s, si) => `
        <div class="set-row">
          <span class="set-number">${si + 1}</span>
          <label>кг<input inputmode="decimal" data-set-weight="${ei}:${si}" value="${esc(s.weight ?? '')}" placeholder="0" /></label>
          <label>повт.<input inputmode="numeric" data-set-reps="${ei}:${si}" value="${esc(s.reps ?? '')}" placeholder="0" /></label>
        </div>`).join('')}</div>
      <button class="tiny ghost" data-add-set="${ei}">+ підхід</button>
    </div>`).join('');
}

function prescriptionSets(p = {}) {
  const count = Math.min(12, Math.max(1, Number(p.sets || p.workSets || 1) || 1));
  const reps = p.reps ?? p.targetReps ?? '';
  return Array.from({ length: count }, () => ({ weight: '', reps: String(reps || '') }));
}

function addExerciseToDraft(id, name, prescription = {}) {
  workoutDraft.push({ exerciseId: id, name, prescription, sets: prescriptionSets(prescription) });
}

function startProgramDay(index) {
  const day = clientDays[index];
  if (!day) return;
  workoutDraft = [];
  for (const ex of day.exercises || []) addExerciseToDraft(ex.exerciseId, ex.name, ex.prescription || {});
  renderTraining();
  toast(`${day.title || 'Тренування'} готове`);
}

function bindTrainingActions(locale) {
  document.querySelectorAll('[data-start-day]').forEach(b => b.onclick = () => startProgramDay(+b.dataset.startDay));
  document.querySelectorAll('[data-exercise-id]').forEach(b => b.onclick = () => {
    addExerciseToDraft(b.dataset.exerciseId, b.dataset.exerciseName || 'Exercise');
    $('#workoutDraft').innerHTML = renderWorkoutDraft();
    bindDraftActions();
    toast('Вправу додано');
  });
  bindDraftActions();

  const searchBtn = $('#exerciseSearchBtn');
  if (searchBtn) searchBtn.onclick = async () => {
    try {
      const q = $('#exerciseSearch').value.trim();
      const d = await api(`/api/client/exercises?limit=40&locale=${locale}&q=${encodeURIComponent(q)}`);
      $('#exerciseList').innerHTML = exerciseCards(d.exercises);
      document.querySelectorAll('[data-exercise-id]').forEach(b => b.onclick = () => {
        addExerciseToDraft(b.dataset.exerciseId, b.dataset.exerciseName || 'Exercise');
        $('#workoutDraft').innerHTML = renderWorkoutDraft();
        bindDraftActions();
      });
    } catch (e) { toast(e.message, 5000); }
  };
  if ($('#exerciseSearch')) $('#exerciseSearch').onkeydown = e => { if (e.key === 'Enter') searchBtn?.click(); };
  if ($('#finishWorkout')) $('#finishWorkout').onclick = finishWorkout;
}

function syncDraftInputs() {
  document.querySelectorAll('[data-set-weight]').forEach(input => {
    const [ei, si] = input.dataset.setWeight.split(':').map(Number);
    if (workoutDraft[ei]?.sets?.[si]) workoutDraft[ei].sets[si].weight = input.value;
  });
  document.querySelectorAll('[data-set-reps]').forEach(input => {
    const [ei, si] = input.dataset.setReps.split(':').map(Number);
    if (workoutDraft[ei]?.sets?.[si]) workoutDraft[ei].sets[si].reps = input.value;
  });
}

function bindDraftActions() {
  document.querySelectorAll('[data-add-set]').forEach(b => b.onclick = () => {
    syncDraftInputs();
    const ex = workoutDraft[+b.dataset.addSet];
    if (ex) ex.sets.push({ weight: '', reps: '' });
    $('#workoutDraft').innerHTML = renderWorkoutDraft();
    bindDraftActions();
  });
  document.querySelectorAll('[data-remove-ex]').forEach(b => b.onclick = () => {
    syncDraftInputs();
    workoutDraft.splice(+b.dataset.removeEx, 1);
    $('#workoutDraft').innerHTML = renderWorkoutDraft();
    bindDraftActions();
  });
  if ($('#finishWorkout')) $('#finishWorkout').onclick = finishWorkout;
}

async function finishWorkout() {
  syncDraftInputs();
  if (!workoutDraft.length) return toast('Додай хоча б одну вправу');
  try {
    const clientMembership = memberships().find(m => m.role === 'client');
    await api('/api/client/workouts', {
      method: 'POST',
      body: JSON.stringify({
        name: clientProgram?.name || 'Freestyle workout',
        workspaceId: clientProgram?.workspace_id || clientMembership?.workspace_id || null,
        programVersionId: clientProgram?.version_id || null,
        exercises: workoutDraft.map(x => ({
          exerciseId: x.exerciseId,
          name: x.name,
          prescription: x.prescription || {},
          sets: x.sets.map(s => ({ weight: s.weight, reps: s.reps, done: true }))
        }))
      })
    });
    workoutDraft = [];
    toast('Тренування збережено');
    await renderTraining();
  } catch (e) { toast(e.message, 5000); }
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

function rememberedInviteCodes() {
  try { return JSON.parse(localStorage.getItem('varangym_invite_codes') || '{}'); } catch { return {}; }
}

function rememberInviteCode(id, code) {
  const map = rememberedInviteCodes();
  map[id] = code;
  localStorage.setItem('varangym_invite_codes', JSON.stringify(map));
}

async function inviteListData() {
  if (!canInvite()) throw new Error('forbidden');
  if (isAdmin()) return api('/api/invites');
  const preferred = coachMemberships()[0];
  if (!preferred) return { invites: [] };
  return api(`/api/invites?workspaceId=${encodeURIComponent(preferred.workspace_id)}`);
}

async function renderInvites() {
  if (!canInvite()) {
    activeTab = 'training';
    renderTabs();
    return renderTraining();
  }
  const ms = memberships();
  const listed = await inviteListData();
  panel.innerHTML = `
    <div class="section-title"><div><div class="eyebrow">Access</div><h2>Запрошення</h2></div><span class="badge">${listed.invites.length}</span></div>
    <div class="invite-layout">
      <div class="form-card">
        <h3>Новий код</h3>
        <div class="form-grid compact">
          <label>Тип<select id="inviteRole">
            ${isAdmin() ? '<option value="solo_client">Solo client</option><option value="independent_trainer">Independent trainer</option><option value="organization_owner">Organization owner</option><option value="platform_admin">Platform admin</option>' : ''}
            <option value="client">Client</option>${hasRole('owner','admin') || isAdmin() ? '<option value="trainer">Trainer</option><option value="organization_admin">Organization admin</option>' : ''}
          </select></label>
          <label>Workspace<select id="inviteWorkspace"><option value="">— без workspace —</option>${workspaceOptions(ms)}</select></label>
          <label>Email<input id="inviteEmail" type="email" placeholder="необовʼязково" /></label>
          <label>Trainer user ID<input id="inviteTrainer" placeholder="опційно" /></label>
          <label>Використань<input id="inviteUses" type="number" min="1" max="500" value="1" /></label>
          <label>Днів дії<input id="inviteDays" type="number" min="1" max="365" value="7" /></label>
          <label class="span-2">Назва organization/workspace<input id="inviteOrgName" placeholder="для Organization / Independent trainer" /></label>
          <button id="createInviteBtn" class="primary span-2">Створити код</button>
        </div>
        <div id="inviteResult"></div>
      </div>
      <div><h3>Створені коди</h3><div id="inviteHistory" class="list">${renderInviteRows(listed.invites)}</div></div>
    </div>`;

  $('#createInviteBtn').onclick = async () => {
    const btn = $('#createInviteBtn');
    try {
      btn.disabled = true;
      const role = $('#inviteRole').value;
      const workspaceId = $('#inviteWorkspace').value || null;
      if (['client','trainer','organization_admin'].includes(role) && !workspaceId) throw new Error('Вибери workspace');
      const name = $('#inviteOrgName').value.trim();
      const r = await api('/api/invites', {
        method: 'POST',
        body: JSON.stringify({
          targetRole: role,
          workspaceId,
          trainerUserId: $('#inviteTrainer').value.trim() || null,
          email: $('#inviteEmail').value.trim() || null,
          maxUses: +$('#inviteUses').value || 1,
          expiresInDays: +$('#inviteDays').value || 7,
          metadata: { organizationName: name || undefined, workspaceName: name || undefined }
        })
      });
      rememberInviteCode(r.invite.id, r.code);
      const joinUrl = `${location.origin}/?invite=${encodeURIComponent(r.code)}`;
      $('#inviteResult').innerHTML = `<div class="code-card verified"><div><div class="eyebrow">Новий код</div><h2 class="code">${esc(r.code)}</h2></div><div class="actions"><button id="copyInvite" class="ghost">Код</button><button id="copyInviteLink" class="ghost">Лінк</button></div></div>`;
      $('#copyInvite').onclick = () => navigator.clipboard.writeText(r.code).then(() => toast('Код скопійовано'));
      $('#copyInviteLink').onclick = () => navigator.clipboard.writeText(joinUrl).then(() => toast('Лінк скопійовано'));
      const fresh = await inviteListData();
      $('#inviteHistory').innerHTML = renderInviteRows(fresh.invites);
      bindInviteActions();
    } catch (e) { toast(e.message, 5000); }
    finally { btn.disabled = false; }
  };
  bindInviteActions();
}

function renderInviteRows(invites) {
  if (!invites?.length) return '<div class="empty">Ще немає запрошень.</div>';
  const codes = rememberedInviteCodes();
  return invites.map(i => {
    const [state, label] = inviteStatus(i);
    const remembered = codes[i.id];
    return `<div class="row invite-row">
      <div class="row-main"><div class="row-title">${esc(i.target_role)} ${i.email ? `· ${esc(i.email)}` : ''}</div>
      <div class="row-sub">${i.use_count}/${i.max_uses} використано · до ${dateText(i.expires_at)}</div>
      ${remembered ? `<div class="code mini-code">${esc(remembered)}</div>` : '<div class="row-sub">Старий секретний код не був збережений на цьому пристрої.</div>'}</div>
      <div class="actions">${remembered ? `<button class="tiny ghost" data-copy-code="${esc(remembered)}">Копіювати</button>` : ''}<span class="status ${state}">${label}</span>${state === 'active' ? `<button class="tiny danger" data-revoke="${esc(i.id)}">Відкликати</button>` : ''}</div>
    </div>`;
  }).join('');
}

function bindInviteActions() {
  document.querySelectorAll('[data-copy-code]').forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.copyCode).then(() => toast('Код скопійовано')));
  document.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => {
    try {
      await api('/api/invites/revoke', { method: 'POST', body: JSON.stringify({ id: b.dataset.revoke }) });
      toast('Запрошення відкликано');
      await renderInvites();
    } catch (e) { toast(e.message, 5000); }
  });
}

async function renderCoach() {
  const choices = coachMemberships();
  if (!choices.length && !isAdmin()) return panel.innerHTML = '<div class="empty">Немає Coach workspace.</div>';
  const workspaceId = choices[0]?.workspace_id;
  if (!workspaceId) return panel.innerHTML = '<div class="info-card"><h3>Coach</h3><p class="muted">Вибери або створи workspace тренера.</p></div>';
  const data = await api(`/api/coach/clients?workspaceId=${encodeURIComponent(workspaceId)}`);
  panel.innerHTML = `<div class="section-title"><div><div class="eyebrow">Coach</div><h2>${esc(choices[0].workspace_name)}</h2></div><span class="badge badge-accent">${data.clients.length} clients</span></div>
    <div class="list">${data.clients.length ? data.clients.map(c => `<div class="row client-row"><div class="avatar">${esc(c.display_name.slice(0,1).toUpperCase())}</div><div class="row-main"><div class="row-title">${esc(c.display_name)}</div><div class="row-sub">${esc(c.email || '')} · ${c.workouts_30d} тренувань / 30 днів</div></div><div class="right-meta"><b>${c.last_workout_at ? new Date(c.last_workout_at).toLocaleDateString() : '—'}</b><small>останнє</small></div></div>`).join('') : '<div class="empty">Клієнтів ще немає.</div>'}</div>`;
}

async function renderBusiness() {
  const choices = businessMemberships();
  if (!choices.length) return panel.innerHTML = '<div class="info-card"><h3>Business</h3><p class="muted">У цьому акаунті немає organization workspace.</p></div>';
  const m = choices[0];
  const d = await api(`/api/business/overview?workspaceId=${encodeURIComponent(m.workspace_id)}`);
  panel.innerHTML = `<div class="section-title"><div><div class="eyebrow">Business</div><h2>${esc(d.workspace.name)}</h2></div></div>
    <div class="grid metrics-grid"><div class="metric"><span class="muted">Trainers</span><b>${d.stats.trainers}</b></div><div class="metric"><span class="muted">Clients</span><b>${d.stats.clients}</b></div><div class="metric"><span class="muted">Managers</span><b>${d.stats.managers}</b></div></div>
    <div class="list">${d.trainers.length ? d.trainers.map(t => `<div class="row"><div class="avatar">${esc(t.display_name.slice(0,1).toUpperCase())}</div><div class="row-main"><div class="row-title">${esc(t.display_name)}</div><div class="row-sub">${esc(t.email || '')}</div></div><span class="badge">${t.clients} clients</span></div>`).join('') : '<div class="empty">Тренерів ще немає.</div>'}</div>`;
}

async function renderAdmin() {
  const [d, ws] = await Promise.all([api('/api/admin/overview'), api('/api/admin/workspaces')]);
  panel.innerHTML = `<div class="section-title"><div><div class="eyebrow">Platform control</div><h2>Admin</h2></div><span class="badge badge-accent">super admin</span></div>
    <div class="grid metrics-grid"><div class="metric"><span class="muted">Users</span><b>${d.users.total}</b><small>${d.users.active} active</small></div><div class="metric"><span class="muted">Organizations</span><b>${d.workspaces.organizations}</b><small>${d.workspaces.independent_trainers} independent</small></div><div class="metric"><span class="muted">Trainer-client links</span><b>${d.trainerClientLinks}</b></div><div class="metric"><span class="muted">Invites</span><b>${d.invites.usable}</b><small>active</small></div></div>
    <div class="section-title section-gap"><h3>Workspaces</h3><span class="muted">${ws.workspaces.length}</span></div>
    <div class="list">${ws.workspaces.map(w => `<div class="row"><div class="row-main"><div class="row-title">${esc(w.name)}</div><div class="row-sub">${esc(w.type)} · ${w.members} members</div></div><div class="actions"><span class="badge">${w.trainers} trainers</span><span class="badge">${w.clients} clients</span></div></div>`).join('')}</div>`;
}

$('#registerBtn').onclick = () => register().catch(e => toast(e.message, 5000));
$('#loginBtn').onclick = () => login().catch(e => toast(e.message, 5000));
$('#logoutBtn').onclick = async () => {
  try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch {}
  me = null; activeTab = null; workoutDraft = [];
  showAuth();
};
$('#refreshBtn').onclick = async () => {
  try { me = await api('/api/me'); showApp(); toast('Оновлено'); } catch (e) { toast(e.message); }
};

(async () => {
  const inviteFromUrl = new URLSearchParams(location.search).get('invite');
  if (inviteFromUrl && $('#regCode')) $('#regCode').value = inviteFromUrl;
  try {
    me = await api('/api/me');
    activeTab = defaultTab();
    showApp();
  } catch {
    showAuth();
  }
})();
