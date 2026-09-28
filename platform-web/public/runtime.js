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

async function vgApi(path, options = {}) {
  const r = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || `HTTP ${r.status}`), { status: r.status, data: d });
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
  vgAddBillingTab();
}

async function vgRenderInviteHistory() {
  const host = document.querySelector('#inviteResult');
  if (!host) return;
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

function vgMoney(cents, currency = 'USD') {
  try { return new Intl.NumberFormat('uk-UA', { style: 'currency', currency }).format(Number(cents || 0) / 100); }
  catch { return `$${(Number(cents || 0) / 100).toFixed(2)}`; }
}

function vgPlanLabel(p) {
  const labels = {
    solo_monthly: 'Solo · щомісяця', solo_lifetime: 'Solo · назавжди',
    coach_5: 'Coach · 5 клієнтів', coach_10: 'Coach · 10 клієнтів', coach_20: 'Coach · 20 клієнтів',
    business_5_50: 'Business · 5 тренерів / 50 клієнтів', business_10_100: 'Business · 10 тренерів / 100 клієнтів'
  };
  return labels[p.code] || p.metadata?.label || p.code;
}

async function vgRenderBilling() {
  const panel = document.querySelector('#panel');
  if (!panel) return;
  panel.innerHTML = '<div class="empty">Завантажую підписки та оплату…</div>';
  try {
    const [me, plansData, mine] = await Promise.all([
      vgApi('/api/me'), vgApi('/api/billing/plans'), vgApi('/api/billing/me')
    ]);
    const memberships = me.memberships || [];
    const isPlatformAdmin = !!me.user?.is_platform_admin;
    const trainerSpaces = memberships.filter(m => m.workspace_type === 'independent_trainer' && ['owner','trainer'].includes(m.role));
    const businessSpaces = memberships.filter(m => m.workspace_type === 'organization' && ['owner','admin'].includes(m.role));
    const plans = plansData.plans || [];
    const subscriptions = [...(mine.userSubscriptions || []), ...(mine.workspaceSubscriptions || [])];
    let adminSummary = null;
    if (isPlatformAdmin) adminSummary = await vgApi('/api/billing/admin/summary').catch(() => null);

    const cards = [];
    for (const p of plans.filter(x => x.audience === 'trainer' && trainerSpaces.length)) {
      for (const ws of trainerSpaces) cards.push({ plan: p, ws });
    }
    for (const p of plans.filter(x => x.audience === 'organization' && businessSpaces.length)) {
      for (const ws of businessSpaces) cards.push({ plan: p, ws });
    }

    panel.innerHTML = `
      <div class="dashboard-head">
        <div><div class="eyebrow">VARANGYM BILLING</div><h2>Підписка й оплата</h2><p class="muted">Ліміти клієнтів і тренерів контролюються сервером, а не тільки інтерфейсом.</p></div>
        <span class="status-pill">${plansData.paymentsConfigured ? 'Stripe online' : 'Stripe не підключено'}</span>
      </div>

      ${adminSummary ? `<div class="metric-grid" style="margin-top:18px">
        ${(adminSummary.revenue || []).map(r => `<div class="metric"><span>Дохід цього місяця</span><strong>${vgMoney(r.month_cents, r.currency)}</strong><small>за весь час ${vgMoney(r.lifetime_cents, r.currency)}</small></div>`).join('') || '<div class="metric"><span>Дохід</span><strong>0</strong><small>платежів ще немає</small></div>'}
        <div class="metric"><span>Активні підписки</span><strong>${(adminSummary.subscriptions || []).filter(x => x.status === 'active').reduce((n,x) => n + Number(x.count || 0), 0)}</strong><small>вся платформа</small></div>
        <div class="metric"><span>Платіжний провайдер</span><strong>${adminSummary.provider || '—'}</strong><small>${adminSummary.provider ? 'готовий' : 'потрібні ключі Stripe'}</small></div>
      </div>` : ''}

      <div class="section-title section-gap"><div><h3>Поточні підписки</h3></div></div>
      <div class="list">${subscriptions.length ? subscriptions.map(s => `<div class="row"><div class="row-main"><div class="row-title">${vgEsc(s.plan_code)}</div><div class="row-sub">${vgEsc(s.status)}${s.current_period_end ? ` · до ${new Date(s.current_period_end).toLocaleDateString('uk-UA')}` : ''}</div></div>${s.cancel_at_period_end ? '<span class="badge">скасування заплановане</span>' : '<span class="badge badge-accent">активна</span>'}</div>`).join('') : '<div class="empty">Активних платних підписок ще немає.</div>'}</div>

      ${cards.length ? `<div class="section-title section-gap"><div><h3>Тарифи</h3><div class="muted">Coach і Business</div></div></div>
      <div class="card-grid">${cards.map(({plan:p,ws}) => `<article class="card">
        <div class="eyebrow">${vgEsc(ws.workspace_name)}</div>
        <h3>${vgEsc(vgPlanLabel(p))}</h3>
        <div style="font-size:30px;font-weight:900;margin:10px 0">${vgMoney(p.price_cents,p.currency)}<span class="muted" style="font-size:14px"> / місяць</span></div>
        <p class="muted">${p.trainer_limit != null ? `${p.trainer_limit} тренерів · ` : ''}${p.client_limit != null ? `${p.client_limit} клієнтів` : ''}</p>
        <button class="primary full vg-checkout" data-plan="${vgEsc(p.code)}" data-workspace="${vgEsc(ws.workspace_id)}" ${plansData.paymentsConfigured ? '' : 'disabled'}>Обрати тариф</button>
      </article>`).join('')}</div>` : ''}

      ${!plansData.paymentsConfigured ? '<div class="card section-gap"><b>Платіжна логіка вже підключена.</b><p class="muted">На staging оплата навмисно не списується, доки не буде додано Stripe Secret Key і Webhook Secret. Тарифи, entitlement-и та серверні ліміти вже працюють у коді.</p></div>' : ''}`;

    panel.querySelectorAll('.vg-checkout').forEach(btn => {
      btn.onclick = async () => {
        btn.disabled = true;
        const old = btn.textContent;
        btn.textContent = 'Відкриваю оплату…';
        try {
          const d = await vgApi('/api/billing/checkout', {
            method: 'POST',
            body: JSON.stringify({ planCode: btn.dataset.plan, workspaceId: btn.dataset.workspace })
          });
          if (d.url) location.href = d.url;
        } catch (e) {
          alert(e.message);
          btn.disabled = false;
          btn.textContent = old;
        }
      };
    });
  } catch (e) {
    panel.innerHTML = `<div class="empty error-box"><b>Не вдалося завантажити оплату</b><br>${vgEsc(e.message)}</div>`;
  }
}

async function vgAddBillingTab() {
  const tabs = document.querySelector('#tabs');
  if (!tabs || tabs.querySelector('[data-vg-billing]')) return;
  try {
    const me = await vgApi('/api/me');
    const ms = me.memberships || [];
    const allowed = !!me.user?.is_platform_admin || ms.some(m => ['owner','admin','trainer'].includes(m.role));
    if (!allowed) return;
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.dataset.vgBilling = '1';
    btn.textContent = 'Оплата';
    btn.onclick = e => {
      e.preventDefault();
      tabs.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      vgRenderBilling();
    };
    tabs.appendChild(btn);
  } catch {}
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
