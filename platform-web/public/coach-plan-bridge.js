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
    if (!workspace && !me.user?.is_platform_admin) return;

    const card = document.createElement('div');
    card.id = 'vgProfilePlanBridge';
    card.className = 'form-card';
    card.style.marginTop = '22px';
    card.innerHTML = `
      <div class="section-title">
        <div>
          <div class="eyebrow">VARANGYM PLANS</div>
          <h3>Програми клієнтів</h3>
        </div>
        <span class="badge badge-accent">окремо для кожного</span>
      </div>
      <p class="muted">Тут не треба копіювати один «мій план» між людьми. У редакторі обираєш конкретного клієнта, створюєш його програму, додаєш дні, вправи, підходи, повтори й відпочинок, зберігаєш чернетку та публікуєш саме цьому клієнту.</p>
      <div class="actions" style="justify-content:flex-start;margin-top:16px">
        <a class="primary" style="text-decoration:none;display:inline-block" href="/manage/training.html?mode=coach">Відкрити редактор планів</a>
        <a class="ghost" style="text-decoration:none;display:inline-block" href="/#/plan">Мій особистий план</a>
      </div>
      <div class="hint">Опублікована версія зберігається в PostgreSQL. Нова версія замінює активне призначення, але історія тренувань і прогрес клієнта залишаються.</div>
    `;
    panel.appendChild(card);
  } catch (e) {
    console.error('[plan-management]', e);
  } finally {
    vgPlanBusy = false;
  }
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
