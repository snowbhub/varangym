(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api = async path => {
    const r = await fetch(path, { credentials: 'include', cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  };
  const n = v => new Intl.NumberFormat('uk-UA').format(Number(v || 0));
  const dt = v => v ? new Date(v).toLocaleString('uk-UA') : '—';

  function patchStyles() {
    if (document.querySelector('#vgUiFixStyles')) return;
    const s = document.createElement('style');
    s.id = 'vgUiFixStyles';
    s.textContent = `
      .metric strong{display:block;font-size:30px;line-height:1.1;margin-top:7px;letter-spacing:-.04em}
      .vg-user-list{display:grid;gap:10px}.vg-user-row{cursor:pointer}.vg-user-row:hover{border-color:#39434d}
      .vg-user-detail{display:grid;gap:16px}.vg-detail-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}
      .vg-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .vg-detail-card{padding:14px;border:1px solid #272e35;border-radius:15px;background:#0f1215}
      .vg-detail-card b{display:block;margin-bottom:5px}.vg-day{padding:14px;border:1px solid #272e35;border-radius:15px;background:#0f1215;margin-top:9px}
      .vg-day ul{margin:8px 0 0;padding-left:18px;color:#c6cbd1}.vg-day li{margin:5px 0}.vg-routine-pill{display:inline-flex;padding:6px 9px;border:1px solid #303740;border-radius:999px;margin:4px 4px 0 0;color:#bdc5cd;font-size:11px}
      @media(max-width:650px){.vg-detail-grid{grid-template-columns:1fr}.metric strong{font-size:26px}.vg-detail-head{flex-direction:column}}
    `;
    document.head.appendChild(s);
  }

  function patchTabs() {
    const tabs = document.querySelector('#tabs');
    if (!tabs) return;
    const labels = { admin:'Адмін', invites:'Запрошення', training:'Тренування', coach:'Тренер', business:'Організації' };
    tabs.querySelectorAll('[data-tab]').forEach(tab => {
      if (labels[tab.dataset.tab]) tab.textContent = labels[tab.dataset.tab];
    });
    const billing = [...tabs.querySelectorAll('[data-vg-billing]')];
    billing.forEach((tab, i) => {
      if (i) tab.remove();
      else tab.textContent = 'Оплата';
    });
  }

  function rolesText(memberships = []) {
    if (!memberships.length) return 'без workspace';
    return memberships.map(m => `${m.workspace} · ${m.role}`).join(' · ');
  }

  async function renderAdminUsers(force = false) {
    const adminTab = document.querySelector('#tabs [data-tab="admin"]');
    const panel = document.querySelector('#panel');
    if (!adminTab?.classList.contains('active') || !panel) return;
    let host = panel.querySelector('#vgAdminUsers');
    if (host && !force) return;
    if (!host) {
      host = document.createElement('section');
      host.id = 'vgAdminUsers';
      host.className = 'section-gap';
      panel.appendChild(host);
    }
    host.innerHTML = '<div class="empty">Завантажую користувачів…</div>';
    try {
      const d = await api('/api/analytics/admin?days=30');
      const users = d.userList || [];
      host.innerHTML = `
        <div class="section-title"><div><div class="eyebrow">КОРИСТУВАЧІ</div><h3>Акаунти й активність</h3></div><span class="badge">${users.length}</span></div>
        <div class="vg-user-list">${users.map(u => `<div class="row vg-user-row" data-vg-user="${esc(u.id)}">
          <div class="avatar">${esc((u.display_name || '?').slice(0,1).toUpperCase())}</div>
          <div class="row-main"><div class="row-title">${esc(u.display_name)}</div><div class="row-sub">${esc(u.email || 'без email')} · ${esc(u.locale || '—')} · ${esc(rolesText(u.memberships))}</div><div class="row-sub">${u.current_program ? `План: ${esc(u.current_program)} · ` : ''}${n(u.workouts_30d)} тренувань / 30 днів · останнє ${dt(u.last_workout_at)}</div></div>
          <span class="badge ${u.is_platform_admin ? 'badge-accent' : ''}">${u.is_platform_admin ? 'admin' : u.status}</span>
        </div>`).join('') || '<div class="empty">Користувачів немає.</div>'}</div>`;
      host.querySelectorAll('[data-vg-user]').forEach(row => row.onclick = () => openUser(row.dataset.vgUser, host));
    } catch (e) {
      host.innerHTML = `<div class="empty error-box">Не вдалося завантажити користувачів: ${esc(e.message)}</div>`;
    }
  }

  function renderProgram(program) {
    if (!program) return '<div class="empty">Активного призначеного плану немає.</div>';
    return `<div class="vg-detail-card"><b>${esc(program.name)}</b><div class="row-sub">v${esc(program.version_number)} · тренер ${esc(program.trainer_name || '—')} · ${esc(program.workspace_name || '')}</div></div>
      ${(program.days || []).map(day => `<div class="vg-day"><b>${esc(day.title || 'Тренування')}</b><div class="row-sub">День тижня: ${day.weekday ?? '—'} · ${(day.exercises || []).length} вправ</div><ul>${(day.exercises || []).map(ex => `<li><b>${esc(ex.name)}</b>${ex.prescription ? ` <span class="muted">${esc(JSON.stringify(ex.prescription))}</span>` : ''}</li>`).join('')}</ul></div>`).join('')}`;
  }

  async function openUser(userId, host) {
    host.innerHTML = '<div class="empty">Відкриваю профіль…</div>';
    try {
      const d = await api(`/api/analytics/client/${encodeURIComponent(userId)}?days=90`);
      const c = d.client || {};
      const routines = d.profileState?.routines || [];
      host.innerHTML = `<div class="vg-user-detail">
        <div class="vg-detail-head"><div><button id="vgBackUsers" class="ghost tiny">← Усі користувачі</button><div class="eyebrow" style="margin-top:16px">ПРОФІЛЬ</div><h2>${esc(c.display_name)}</h2><div class="muted">${esc(c.email || 'без email')} · ${esc(c.locale || '—')} · створено ${dt(c.created_at)}</div></div><span class="badge ${c.is_platform_admin ? 'badge-accent' : ''}">${c.is_platform_admin ? 'Platform Admin' : esc(c.status || 'active')}</span></div>
        <div class="vg-detail-grid">
          <div class="vg-detail-card"><span class="muted">Тренування / 90 днів</span><b style="font-size:28px">${n(d.summary?.workouts)}</b></div>
          <div class="vg-detail-card"><span class="muted">Виконані підходи</span><b style="font-size:28px">${n(d.summary?.completed_sets)}</b></div>
          <div class="vg-detail-card"><span class="muted">Останнє тренування</span><b>${dt(d.summary?.last_workout_at)}</b></div>
        </div>
        <div><div class="section-title"><h3>Ролі й доступ</h3></div><div>${(d.memberships || []).map(m => `<span class="vg-routine-pill">${esc(m.workspace_name)} · ${esc(m.role)}</span>`).join('') || '<span class="muted">Немає workspace</span>'}</div></div>
        <div><div class="section-title"><h3>Поточний план клієнта</h3></div>${renderProgram(d.currentProgram)}</div>
        <div><div class="section-title"><h3>Плани в особистому профілі</h3><span class="badge">${routines.length}</span></div><div>${routines.map(r => `<span class="vg-routine-pill">${esc(r.name || 'Без назви')} · ${Array.isArray(r.ex) ? r.ex.length : 0} вправ</span>`).join('') || '<span class="muted">Особистих програм немає.</span>'}</div></div>
        <div><div class="section-title"><h3>Останні тренування</h3></div><div class="list">${(d.recentWorkouts || []).map(w => `<div class="row"><div class="row-main"><div class="row-title">${esc(w.name)}</div><div class="row-sub">${dt(w.started_at)} · ${n(w.exercises)} вправ · ${n(w.completed_sets)} підходів</div></div><span class="badge">${esc(w.source || '')}</span></div>`).join('') || '<div class="empty">Тренувань ще немає.</div>'}</div></div>
      </div>`;
      host.querySelector('#vgBackUsers').onclick = () => renderAdminUsers(true);
    } catch (e) {
      host.innerHTML = `<button id="vgBackUsers" class="ghost tiny">← Назад</button><div class="empty error-box">Не вдалося відкрити профіль: ${esc(e.message)}</div>`;
      host.querySelector('#vgBackUsers').onclick = () => renderAdminUsers(true);
    }
  }

  patchStyles();
  let timer = null;
  const refresh = () => {
    patchTabs();
    clearTimeout(timer);
    timer = setTimeout(() => renderAdminUsers(), 220);
  };
  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  document.addEventListener('click', e => {
    if (e.target?.closest?.('#tabs .tab')) setTimeout(refresh, 80);
  });
  setTimeout(refresh, 250);
})();
