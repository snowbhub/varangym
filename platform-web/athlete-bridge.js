// Keep the original openGym React application untouched as the athlete UI.
// This tiny shell bridge only exposes VARANGYM management to accounts that actually have
// a trainer/owner/admin/platform-admin role. Client-only profiles see no extra control.
(() => {
  const MANAGER_ROLES = new Set(['owner', 'admin', 'trainer']);
  let canManage = false;
  let checking = false;
  let checkedAt = 0;
  let timer = null;

  function managerFrom(me) {
    return !!me?.user?.is_platform_admin || (me?.memberships || []).some(m => MANAGER_ROLES.has(m?.role));
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
        canManage = managerFrom(await res.json());
      }
    } catch {
      // Leave the athlete app alone when the management lookup is unavailable.
    } finally {
      checking = false;
      renderButton();
    }
  }

  function renderButton() {
    const existing = document.getElementById('varangymManageButton');
    if (!canManage) {
      existing?.remove();
      return;
    }

    // The normal openGym home/settings headers use .hdr and .iconbtn. We add one small control
    // beside the existing header action; no workout/plan/stats/library markup is replaced.
    const headers = [...document.querySelectorAll('.hdr')];
    const header = headers.find(h => h.querySelector('.iconbtn'));
    if (!header) return;
    if (existing && existing.isConnected) return;

    const gear = header.querySelector('.iconbtn');
    const button = document.createElement('button');
    button.id = 'varangymManageButton';
    button.className = 'iconbtn';
    button.type = 'button';
    button.setAttribute('aria-label', 'VARANGYM Coach');
    button.title = 'VARANGYM Coach';
    button.textContent = 'V';
    button.style.fontWeight = '800';
    button.style.letterSpacing = '-.04em';
    button.style.color = 'var(--acc)';
    button.addEventListener('click', () => { window.location.href = '/manage/'; });
    gear.parentNode.insertBefore(button, gear);
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
  refreshRole(true);
})();
