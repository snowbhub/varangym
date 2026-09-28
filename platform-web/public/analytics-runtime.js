const VG_A = {
  esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); },
  async api(path) {
    const r = await fetch(path, { credentials:'include', headers:{ accept:'application/json' } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  },
  money(cents, currency='USD') {
    try { return new Intl.NumberFormat('uk-UA',{style:'currency',currency}).format(Number(cents||0)/100); }
    catch { return `${(Number(cents||0)/100).toFixed(2)} ${currency}`; }
  },
  num(v) { return new Intl.NumberFormat('uk-UA').format(Number(v||0)); },
  pct(v) { return `${Math.round(Number(v||0))}%`; }
};

function vgAnalyticsStyle() {
  if (document.querySelector('#vg-analytics-style')) return;
  const s=document.createElement('style'); s.id='vg-analytics-style';
  s.textContent=`
    .vg-an-head{display:flex;gap:14px;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;margin-bottom:18px}
    .vg-an-controls{display:flex;gap:8px;flex-wrap:wrap}.vg-an-controls select{min-width:150px}
    .vg-an-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0 20px}
    .vg-an-metric{border:1px solid var(--line,#2b3038);border-radius:22px;padding:18px;background:rgba(255,255,255,.025)}
    .vg-an-metric span{display:block;color:var(--muted,#8f98a6);font-size:13px}.vg-an-metric strong{display:block;font-size:30px;margin:7px 0 3px}.vg-an-metric small{color:var(--muted,#8f98a6)}
    .vg-an-card{border:1px solid var(--line,#2b3038);border-radius:24px;padding:18px;margin-top:14px;background:rgba(255,255,255,.02)}
    .vg-an-bars{height:190px;display:flex;align-items:flex-end;gap:4px;padding:12px 0 4px;overflow:hidden}
    .vg-an-bar{flex:1;min-width:3px;border-radius:5px 5px 2px 2px;background:linear-gradient(180deg,#35df73,#15883e);opacity:.92;position:relative}
    .vg-an-bar:hover{opacity:1;filter:brightness(1.15)}
    .vg-an-top{display:grid;gap:8px;margin-top:12px}.vg-an-top-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:11px 0;border-bottom:1px solid var(--line,#2b3038)}
    .vg-an-top-row:last-child{border-bottom:0}.vg-an-name{font-weight:750}.vg-an-sub{color:var(--muted,#8f98a6);font-size:12px;margin-top:3px}
    .vg-an-client{display:grid;grid-template-columns:minmax(0,1.5fr) repeat(3,minmax(90px,.7fr));gap:10px;align-items:center;padding:13px 0;border-bottom:1px solid var(--line,#2b3038)}
    .vg-an-client:last-child{border-bottom:0}.vg-an-val{text-align:right}.vg-an-good{color:#45e27c}.vg-an-dim{color:var(--muted,#8f98a6)}
    .vg-db-ok{color:#45e27c;font-weight:800}.vg-db-pill{display:inline-flex;padding:6px 10px;border-radius:999px;border:1px solid #256c3d;background:#0c2615;color:#63e88e;font-size:12px}
    @media(max-width:760px){.vg-an-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.vg-an-client{grid-template-columns:minmax(0,1fr) auto}.vg-an-client .vg-hide-mobile{display:none}.vg-an-metric strong{font-size:25px}}
  `;
  document.head.appendChild(s);
}

function vgChart(daily=[],key='workouts') {
  const values=daily.map(x=>Number(x[key]||0));
  const max=Math.max(1,...values);
  return `<div class="vg-an-bars" aria-label="Графік активності">${daily.map((x,i)=>{
    const h=Math.max(3,Math.round(values[i]/max*100));
    return `<div class="vg-an-bar" style="height:${h}%" title="${VG_A.esc(x.day)} · ${values[i]}" aria-label="${VG_A.esc(x.day)}: ${values[i]}"></div>`;
  }).join('')}</div>`;
}

function vgTop(items=[]) {
  if(!items.length) return '<div class="empty">Даних поки немає.</div>';
  return `<div class="vg-an-top">${items.map(x=>`<div class="vg-an-top-row"><div><div class="vg-an-name">${VG_A.esc(x.name)}</div><div class="vg-an-sub">${VG_A.num(x.workouts)} тренувань · ${VG_A.num(x.completed_sets)} підходів</div></div><b>${VG_A.num(Math.round(Number(x.volume||0)))}</b></div>`).join('')}</div>`;
}

async function vgRenderAdminAnalytics(host, days) {
  const d=await VG_A.api(`/api/analytics/admin?days=${days}`);
  const rev=d.revenue||{};
  host.innerHTML=`
    <div class="vg-an-grid">
      <div class="vg-an-metric"><span>Користувачі</span><strong>${VG_A.num(d.users?.total)}</strong><small>+${VG_A.num(d.users?.new_users)} за ${days} днів</small></div>
      <div class="vg-an-metric"><span>Активні 7 днів</span><strong>${VG_A.num(d.users?.active_7d)}</strong><small>${VG_A.num(d.users?.active_30d)} за 30 днів</small></div>
      <div class="vg-an-metric"><span>Дохід за період</span><strong>${VG_A.money(rev.period_cents)}</strong><small>${VG_A.money(rev.lifetime_cents)} за весь час</small></div>
      <div class="vg-an-metric"><span>Платежі</span><strong>${VG_A.num(rev.paid_count)}</strong><small>успішних за період</small></div>
    </div>
    <div class="vg-an-card"><div class="section-title"><div><div class="eyebrow">ACTIVITY</div><h3>Тренування за ${days} днів</h3></div></div>${vgChart(d.daily,'workouts')}</div>
    <div class="vg-an-card"><div class="section-title"><div><div class="eyebrow">EXERCISES</div><h3>Найчастіше виконують</h3></div></div>${vgTop(d.topExercises)}</div>
    <div class="vg-an-card"><div class="section-title"><div><div class="eyebrow">DATA</div><h3>Стан збереження</h3></div><span class="vg-db-pill">PostgreSQL</span></div>
      <p class="muted">${VG_A.esc(d.persistence?.sourceOfTruth||'')}</p>
      <div class="vg-an-grid">
        <div class="vg-an-metric"><span>Профілі в БД</span><strong>${VG_A.num(d.persistence?.counts?.profile_states)}</strong></div>
        <div class="vg-an-metric"><span>Тренування в БД</span><strong>${VG_A.num(d.persistence?.counts?.workouts)}</strong></div>
        <div class="vg-an-metric"><span>Підходи в БД</span><strong>${VG_A.num(d.persistence?.counts?.workout_sets)}</strong></div>
        <div class="vg-an-metric"><span>Активні сесії</span><strong>${VG_A.num(d.persistence?.counts?.active_sessions)}</strong></div>
      </div>
    </div>`;
}

async function vgRenderCoachAnalytics(host, days, workspaceId, trainerId='') {
  const q=new URLSearchParams({days:String(days),workspaceId}); if(trainerId) q.set('trainerId',trainerId);
  const d=await VG_A.api(`/api/analytics/coach?${q}`);
  const clients=d.clients||[];
  const workouts=clients.reduce((n,x)=>n+Number(x.workouts_period||0),0);
  const active=clients.filter(x=>Number(x.workouts_7d||0)>0).length;
  host.innerHTML=`
    <div class="vg-an-grid">
      <div class="vg-an-metric"><span>Клієнти</span><strong>${VG_A.num(clients.length)}</strong><small>активних зв’язків</small></div>
      <div class="vg-an-metric"><span>Активні 7 днів</span><strong>${VG_A.num(active)}</strong><small>із ${VG_A.num(clients.length)}</small></div>
      <div class="vg-an-metric"><span>Тренування</span><strong>${VG_A.num(workouts)}</strong><small>за ${days} днів</small></div>
      <div class="vg-an-metric"><span>Середнє</span><strong>${clients.length? (workouts/clients.length).toFixed(1):'0'}</strong><small>тренувань / клієнта</small></div>
    </div>
    <div class="vg-an-card"><div class="section-title"><div><div class="eyebrow">CLIENT ACTIVITY</div><h3>Активність клієнтів</h3></div></div>${vgChart(d.daily,'workouts')}</div>
    <div class="vg-an-card"><div class="section-title"><div><div class="eyebrow">CLIENTS</div><h3>Прогрес</h3></div></div>
      ${clients.length?clients.map(c=>{
        const delta=(c.latest_weight!=null&&c.weight_30d_ago!=null)?Number(c.latest_weight)-Number(c.weight_30d_ago):null;
        return `<div class="vg-an-client"><div><div class="vg-an-name">${VG_A.esc(c.display_name)}</div><div class="vg-an-sub">${c.last_workout_at?`останнє: ${new Date(c.last_workout_at).toLocaleDateString('uk-UA')}`:'ще не тренувався'}</div></div><div class="vg-an-val"><b>${VG_A.num(c.workouts_period)}</b><div class="vg-an-sub">тренувань</div></div><div class="vg-an-val vg-hide-mobile"><b>${c.latest_weight==null?'—':`${Number(c.latest_weight).toFixed(1)} кг`}</b><div class="vg-an-sub">вага</div></div><div class="vg-an-val vg-hide-mobile ${delta===null?'vg-an-dim':'vg-an-good'}"><b>${delta===null?'—':`${delta>0?'+':''}${delta.toFixed(1)} кг`}</b><div class="vg-an-sub">30 днів</div></div></div>`;
      }).join(''):'<div class="empty">Клієнтів поки немає.</div>'}
    </div>
    <div class="vg-an-card"><div class="section-title"><div><div class="eyebrow">EXERCISES</div><h3>Що тренують найчастіше</h3></div></div>${vgTop(d.topExercises)}</div>`;
}

async function vgRenderBusinessAnalytics(host, days, workspaceId) {
  const d=await VG_A.api(`/api/analytics/business?days=${days}&workspaceId=${encodeURIComponent(workspaceId)}`);
  const trainers=d.trainers||[];
  const clients=trainers.reduce((n,x)=>n+Number(x.clients||0),0);
  const workouts=trainers.reduce((n,x)=>n+Number(x.workouts_period||0),0);
  host.innerHTML=`
    <div class="vg-an-grid">
      <div class="vg-an-metric"><span>Тренери</span><strong>${VG_A.num(trainers.length)}</strong><small>у workspace</small></div>
      <div class="vg-an-metric"><span>Клієнти</span><strong>${VG_A.num(clients)}</strong><small>під тренерами</small></div>
      <div class="vg-an-metric"><span>Тренування</span><strong>${VG_A.num(workouts)}</strong><small>за ${days} днів</small></div>
      <div class="vg-an-metric"><span>Дохід VARANGYM</span><strong>${VG_A.money(d.revenue?.period_cents)}</strong><small>${VG_A.money(d.revenue?.lifetime_cents)} за весь час</small></div>
    </div>
    <div class="vg-an-card"><div class="section-title"><div><div class="eyebrow">BUSINESS ACTIVITY</div><h3>Активність клієнтів</h3></div></div>${vgChart(d.daily,'workouts')}</div>
    <div class="vg-an-card"><div class="section-title"><div><div class="eyebrow">TRAINERS</div><h3>Команда</h3></div></div>
      ${trainers.length?trainers.map(t=>`<div class="vg-an-client"><div><div class="vg-an-name">${VG_A.esc(t.display_name)}</div><div class="vg-an-sub">${VG_A.esc(t.email||'')}</div></div><div class="vg-an-val"><b>${VG_A.num(t.clients)}</b><div class="vg-an-sub">клієнтів</div></div><div class="vg-an-val vg-hide-mobile"><b>${VG_A.num(t.active_clients_7d)}</b><div class="vg-an-sub">активні 7д</div></div><div class="vg-an-val vg-hide-mobile"><b>${VG_A.num(t.workouts_period)}</b><div class="vg-an-sub">тренувань</div></div></div>`).join(''):'<div class="empty">Тренерів поки немає.</div>'}
    </div>
    <div class="vg-an-card"><div class="section-title"><div><div class="eyebrow">EXERCISES</div><h3>Популярні вправи</h3></div></div>${vgTop(d.topExercises)}</div>`;
}

async function vgAnalyticsScreen() {
  const panel=document.querySelector('#panel'); if(!panel) return;
  panel.innerHTML='<div class="empty">Завантажую аналітику…</div>';
  try{
    const me=await VG_A.api('/api/me');
    const ms=me.memberships||[];
    const isAdmin=!!me.user?.is_platform_admin;
    const businesses=ms.filter(m=>m.workspace_type==='organization'&&['owner','admin'].includes(m.role));
    const coaches=ms.filter(m=>['owner','admin','trainer'].includes(m.role));
    const mode=isAdmin?'admin':businesses.length?'business':'coach';
    const spaces=mode==='business'?businesses:coaches;
    panel.innerHTML=`<div class="vg-an-head"><div><div class="eyebrow">VARANGYM ANALYTICS</div><h2>${mode==='admin'?'Платформа':mode==='business'?'Business Dashboard':'Coach Dashboard'}</h2><p class="muted">Живі дані з PostgreSQL.</p></div><div class="vg-an-controls"><select id="vgAnDays"><option value="7">7 днів</option><option value="30" selected>30 днів</option><option value="90">90 днів</option><option value="365">1 рік</option></select>${!isAdmin&&spaces.length?`<select id="vgAnWorkspace">${spaces.map(x=>`<option value="${VG_A.esc(x.workspace_id)}">${VG_A.esc(x.workspace_name)}</option>`).join('')}</select>`:''}</div></div><div id="vgAnBody"></div>`;
    const load=async()=>{
      const host=document.querySelector('#vgAnBody'); const days=Number(document.querySelector('#vgAnDays')?.value||30);
      if(!host)return; host.innerHTML='<div class="empty">Оновлюю…</div>';
      if(isAdmin) return vgRenderAdminAnalytics(host,days);
      const ws=document.querySelector('#vgAnWorkspace')?.value||spaces[0]?.workspace_id;
      if(!ws){host.innerHTML='<div class="empty">Немає workspace для аналітики.</div>';return;}
      return mode==='business'?vgRenderBusinessAnalytics(host,days,ws):vgRenderCoachAnalytics(host,days,ws);
    };
    document.querySelector('#vgAnDays')?.addEventListener('change',load);
    document.querySelector('#vgAnWorkspace')?.addEventListener('change',load);
    await load();
  }catch(e){ panel.innerHTML=`<div class="empty error-box"><b>Не вдалося завантажити аналітику</b><br>${VG_A.esc(e.message)}</div>`; }
}

async function vgInstallAnalyticsTab(){
  vgAnalyticsStyle();
  const tabs=document.querySelector('#tabs'); if(!tabs||tabs.querySelector('[data-vg-analytics]'))return;
  try{
    const me=await VG_A.api('/api/me');
    const ms=me.memberships||[];
    const allowed=!!me.user?.is_platform_admin||ms.some(m=>['owner','admin','trainer'].includes(m.role));
    if(!allowed)return;
    const b=document.createElement('button');b.className='tab';b.dataset.vgAnalytics='1';b.textContent='Аналітика';
    b.onclick=e=>{e.preventDefault();tabs.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');vgAnalyticsScreen();};
    tabs.appendChild(b);
  }catch{}
}

const vgAnObserver=new MutationObserver(()=>vgInstallAnalyticsTab());
vgAnObserver.observe(document.documentElement,{childList:true,subtree:true});
vgInstallAnalyticsTab();
