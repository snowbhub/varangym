// VARANGYM role bridge. Training and management share one browser session. For trainer/business/admin
// accounts management opens as a same-origin full-screen layer, so the active workout application
// stays mounted underneath instead of being destroyed and reloaded every time the user switches modes.
(() => {
  const MANAGER_ROLES = new Set(['owner', 'admin', 'trainer']);
  let canManage = false;
  let managerLabel = 'VARANGYM Coach';
  let checking = false;
  let checkedAt = 0;
  let timer = null;

  function roleFrom(me) {
    if (me?.user?.is_platform_admin) return { allowed: true, label: 'VARANGYM Admin' };
    const ms = me?.memberships || [];
    if (ms.some(m => m.workspace_type === 'organization' && ['owner','admin'].includes(m.role))) {
      return { allowed: true, label: 'VARANGYM Business' };
    }
    if (ms.some(m => MANAGER_ROLES.has(m?.role))) return { allowed: true, label: 'VARANGYM Coach' };
    return { allowed: false, label: 'VARANGYM' };
  }

  async function refreshRole(force = false) {
    const now = Date.now();
    if (checking || (!force && now - checkedAt < 2500)) return;
    checking = true;
    checkedAt = now;
    try {
      const res = await fetch('/api/me', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) {
        canManage = false;
      } else {
        const role = roleFrom(await res.json());
        canManage = role.allowed;
        managerLabel = role.label;
      }
    } catch {
      // Training must stay usable even when management is temporarily unavailable.
    } finally {
      checking = false;
      renderButton();
    }
  }

  function markSvg() {
    return `<svg viewBox="0 0 96 96" width="26" height="26" aria-hidden="true" focusable="false">
      <path d="M13 18 42.8 78.5c2.1 4.2 8.2 4.2 10.3 0L83 18H68.4L48 61.9 27.6 18Z" fill="currentColor"/>
      <path d="M58.5 28.8c7.6-5.6 14.7-7.3 21.3-5.3-5.8 1.8-10.5 5.3-14.1 10.6-2.7-.8-5.1-2.6-7.2-5.3Z" fill="currentColor" opacity=".9"/>
      <circle cx="69.3" cy="27.8" r="2.1" fill="var(--bg,#000)"/>
    </svg>`;
  }

  function ensureManagerLayer() {
    let layer = document.getElementById('varangymManagerLayer');
    if (layer) return layer;
    const style = document.createElement('style');
    style.id = 'varangymManagerLayerStyle';
    style.textContent = `
      #varangymManagerLayer{position:fixed;inset:0;z-index:2147483000;background:#090b0d;display:none}
      #varangymManagerLayer.open{display:block}
      #varangymManagerFrame{display:block;width:100%;height:100%;border:0;background:#090b0d}
      #varangymManagerClose{position:fixed;z-index:2147483001;right:max(12px,env(safe-area-inset-right));bottom:max(18px,calc(env(safe-area-inset-bottom) + 12px));width:52px;height:52px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:rgba(20,24,28,.94);color:#fff;box-shadow:0 12px 36px rgba(0,0,0,.45);font:700 24px/1 system-ui;display:grid;place-items:center;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
      #varangymManagerClose:active{transform:scale(.96)}
    `;
    document.head.appendChild(style);
    layer = document.createElement('div');
    layer.id = 'varangymManagerLayer';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `<iframe id="varangymManagerFrame" title="VARANGYM management"></iframe><button id="varangymManagerClose" type="button" aria-label="Закрити керування" title="До тренування">×</button>`;
    document.body.appendChild(layer);
    const frame = layer.querySelector('#varangymManagerFrame');
    layer.querySelector('#varangymManagerClose').addEventListener('click', closeManager);
    frame.addEventListener('load', () => {
      // Management's legacy “Training App” link points to /. In an overlay that means “close and
      // reveal the already-running training app”, not “nest another copy of the app in the iframe”.
      try {
        const path = frame.contentWindow.location.pathname;
        if (path === '/' || path === '/index.html') closeManager();
      } catch {}
    });
    return layer;
  }

  function openManager(path = '/manage/') {
    const layer = ensureManagerLayer();
    const frame = layer.querySelector('#varangymManagerFrame');
    if (!frame.getAttribute('src') || frame.getAttribute('src') === 'about:blank') frame.src = path;
    layer.classList.add('open');
    layer.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }

  function closeManager() {
    const layer = document.getElementById('varangymManagerLayer');
    if (!layer) return;
    layer.classList.remove('open');
    layer.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    refreshRole(true);
  }

  function renderButton() {
    const existing = document.getElementById('varangymManageButton');
    if (!canManage) {
      existing?.remove();
      return;
    }

    const headers = [...document.querySelectorAll('.hdr')];
    const header = headers.find(h => h.querySelector('.iconbtn'));
    if (!header) return;
    if (existing && existing.isConnected) {
      existing.setAttribute('aria-label', managerLabel);
      existing.title = managerLabel;
      return;
    }

    const anchor = header.querySelector('.iconbtn');
    const button = document.createElement('button');
    button.id = 'varangymManageButton';
    button.className = 'iconbtn';
    button.type = 'button';
    button.setAttribute('aria-label', managerLabel);
    button.title = managerLabel;
    button.style.color = 'var(--acc)';
    button.innerHTML = markSvg();
    button.addEventListener('click', () => openManager('/manage/'));
    anchor.parentNode.insertBefore(button, anchor);
  }

  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      renderButton();
      refreshRole();
    }, 80);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('focus', () => refreshRole(true));
  window.addEventListener('pageshow', () => refreshRole(true));
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeManager(); });
  window.addEventListener('message', e => {
    if (e.origin === location.origin && e.data?.type === 'varangym:close-management') closeManager();
  });
  window.VARANGYM = Object.assign(window.VARANGYM || {}, { openManager, closeManager });
  refreshRole(true);
})();
