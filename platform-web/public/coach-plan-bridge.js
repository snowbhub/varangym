const vgPlanApi = async (path, options = {}) => {
  const res = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

function vgPlanToast(message, ms = 3600) {
  const el = document.querySelector('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(vgPlanToast.timer);
  vgPlanToast.timer = setTimeout(() => el.classList.add('hidden'), ms);
}

let vgPlanBusy = false;
let vgPlanTimer = null;

async function vgRenderProfilePlanBridge() {
  if (vgPlanBusy) return;
  const coachTab = [...document.querySelectorAll('#tabs [data-tab]')].find(x => x.dataset.tab === 'coach');
  if (!coachTab?.classList.contains('active')) return;
  const panel = document.querySelector('#panel');
  if (!panel || panel.querySelector('#vgProfilePlanBridge')) return;

  vgPlanBusy = true;
  try {
    const me = await vgPlanApi('/api/me');
    const memberships = me.memberships || [];
    const workspace = memberships.find(m => ['owner', 'admin', 'trainer'].includes(m.role));
    if (!workspace) return;

    const [clientsData, preview] = await Promise.all([
      vgPlanApi(`/api/coach/clients?workspaceId=${encodeURIComponent(workspace.workspace_id)}`),
      vgPlanApi(`/api/profile-plan/preview?workspaceId=${encodeURIComponent(workspace.workspace_id)}`)
    ]);

    const clients = clientsData.clients || [];
    const days = preview.days || [];
    const card = document.createElement('div');
    card.id = 'vgProfilePlanBridge';
    card.className = 'form-card';
    card.style.marginTop = '22px';
    card.innerHTML = `
      <div class="section-title">
        <div>
          <div class="eyebrow">TRAINING APP → CLIENT</div>
          <h3>Мій план із звичайного VARANGYM</h3>
        </div>
        <span class="badge badge-accent">${days.length} дн.</span>
      </div>
      <p class="muted">План не збирається тут заново. Відкрий нормальну вкладку «План», склади його тим самим редактором з усіма вправами, підходами та налаштуваннями, а тут тільки передай готовий план клієнту.</p>
      <div class="list" style="margin:14px 0">
        ${days.length ? days.map(d => `<div class="row"><div class="row-main"><div class="row-title">${vgEscPlan(d.name)}</div><div class="row-sub">${vgDayName(d.weekday)} · ${d.exercises} вправ</div></div></div>`).join('') : '<div class="empty">У твоєму Training App ще немає розкладу. Спочатку створи план.</div>'}
      </div>
      <div class="actions" style="margin-bottom:14px">
        <a class="ghost" href="/#/plan">Відкрити мій План</a>
      </div>
      <label>Клієнт
        <select id="vgPlanClient">
          ${clients.length ? clients.map(c => `<option value="${vgEscPlan(c.id)}">${vgEscPlan(c.display_name)}${c.email ? ` · ${vgEscPlan(c.email)}` : ''}</option>`).join('') : '<option value="">Клієнтів ще немає</option>'}
        </select>
      </label>
      <button id="vgPublishProfilePlan" class="primary full" ${(!days.length || !clients.length) ? 'disabled' : ''}>Опублікувати цей план клієнту</button>
      <div class="hint">Після публікації клієнт отримує новий план у своєму звичайному VARANGYM. Історія тренувань, вага та статистика не стираються.</div>
    `;
    panel.appendChild(card);

    const publish = card.querySelector('#vgPublishProfilePlan');
    if (publish) publish.onclick = async () => {
      const clientId = card.querySelector('#vgPlanClient')?.value;
      if (!clientId) return;
      const old = publish.textContent;
      publish.disabled = true;
      publish.textContent = 'Публікую…';
      try {
        const result = await vgPlanApi('/api/profile-plan/publish', {
          method: 'POST',
          body: JSON.stringify({ workspaceId: workspace.workspace_id, clientId })
        });
        vgPlanToast(`Готово: v${result.versionNumber}, ${result.days} дн., ${result.exercises} вправ`);
      } catch (e) {
        vgPlanToast(e.message, 5200);
      } finally {
        publish.disabled = false;
        publish.textContent = old;
      }
    };
  } catch (e) {
    console.error('[profile-plan-bridge]', e);
  } finally {
    vgPlanBusy = false;
  }
}

function vgEscPlan(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function vgDayName(day) {
  return ['Неділя','Понеділок','Вівторок','Середа','Четвер','Пʼятниця','Субота'][Number(day)] || `День ${day}`;
}

const vgPlanObserver = new MutationObserver(() => {
  clearTimeout(vgPlanTimer);
  vgPlanTimer = setTimeout(vgRenderProfilePlanBridge, 100);
});
vgPlanObserver.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('click', e => {
  if (e.target?.closest?.('[data-tab="coach"]')) setTimeout(vgRenderProfilePlanBridge, 160);
});
setTimeout(vgRenderProfilePlanBridge, 300);
