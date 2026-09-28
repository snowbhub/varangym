(() => {
  const $ = s => document.querySelector(s)
  let lastKey = ''
  let loading = false

  function esc(v) { return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
  async function api(path) {
    const r=await fetch(path,{credentials:'include',cache:'no-store'})
    const d=await r.json().catch(()=>({}))
    if(!r.ok) throw new Error(d.error||`HTTP ${r.status}`)
    return d
  }
  const money=(cents,currency='USD')=>new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(Number(cents||0)/100)
  const num=v=>new Intl.NumberFormat().format(Number(v||0))

  function styles() {
    if ($('#vgAnalyticsStyles')) return
    const s=document.createElement('style');s.id='vgAnalyticsStyles';s.textContent=`
      .vg-analytics{margin:0 0 24px;display:grid;gap:16px}
      .vg-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .vg-kpi,.vg-chart-card{border:1px solid var(--line,#2b3038);background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.008));border-radius:22px;padding:18px}
      .vg-kpi span{display:block;color:var(--muted,#9097a3);font-size:13px;margin-bottom:8px}.vg-kpi b{font-size:30px;line-height:1}.vg-kpi small{display:block;color:var(--muted,#9097a3);margin-top:8px}
      .vg-chart-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(260px,.75fr);gap:14px}
      .vg-card-title{display:flex;justify-content:space-between;gap:12px;align-items:end;margin-bottom:16px}.vg-card-title h3{margin:0}.vg-card-title span{color:var(--muted,#9097a3);font-size:12px}
      .vg-bars{height:150px;display:flex;align-items:end;gap:4px;border-bottom:1px solid var(--line,#2b3038);padding-top:12px}.vg-bar{flex:1;min-width:3px;border-radius:5px 5px 1px 1px;background:linear-gradient(180deg,#37dc73,#15964c);opacity:.9;position:relative}.vg-bar:hover{opacity:1}.vg-bar[title]{cursor:default}
      .vg-list{display:grid;gap:10px}.vg-rank{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}.vg-rank-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:650}.vg-rank-track{height:6px;background:rgba(255,255,255,.07);border-radius:99px;overflow:hidden;margin-top:5px}.vg-rank-fill{height:100%;background:#32d66d;border-radius:99px}.vg-rank-val{color:var(--muted,#9097a3);font-variant-numeric:tabular-nums}
      .vg-client-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.vg-client{border:1px solid var(--line,#2b3038);border-radius:18px;padding:14px}.vg-client b{display:block}.vg-client small{display:block;color:var(--muted,#9097a3);margin-top:5px}.vg-up{color:#42df7d}.vg-down{color:#ff747e}
      .vg-plan-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.vg-plan{border:1px solid var(--line,#2b3038);border-radius:16px;padding:13px}.vg-plan b{display:block}.vg-plan small{color:var(--muted,#9097a3)}
      @media(max-width:760px){.vg-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.vg-chart-grid{grid-template-columns:1fr}.vg-client-grid,.vg-plan-grid{grid-template-columns:1fr}.vg-kpi b{font-size:25px}}
    `;document.head.appendChild(s)
  }

  function bars(daily=[]) {
    const max=Math.max(1,...daily.map(x=>Number(x.workouts||0)))
    return `<div class="vg-bars">${daily.map(x=>{
      const h=Number(x.workouts||0)===0?2:Math.max(5,Math.round(Number(x.workouts)*100/max))
      return `<div class="vg-bar" style="height:${h}%" title="${esc(x.day)} · ${x.workouts} workouts"></div>`
    }).join('')}</div>`
  }

  function topList(items=[]) {
    const max=Math.max(1,...items.map(x=>Number(x.completed_sets||0)))
    if(!items.length)return '<div class="empty">Ще немає достатньо даних.</div>'
    return `<div class="vg-list">${items.map((x,i)=>`<div class="vg-rank"><div><div class="vg-rank-name">${i+1}. ${esc(x.name)}</div><div class="vg-rank-track"><div class="vg-rank-fill" style="width:${Math.max(3,Number(x.completed_sets||0)*100/max)}%"></div></div></div><div class="vg-rank-val">${num(x.completed_sets)} sets</div></div>`).join('')}</div>`
  }

  function totalWorkouts(daily=[]){return daily.reduce((n,x)=>n+Number(x.workouts||0),0)}
  function activePeak(daily=[]){return Math.max(0,...daily.map(x=>Number(x.active_users||0)))}

  async function renderAdmin(host) {
    const [a,b]=await Promise.all([api('/api/analytics/admin?days=30'),api('/api/billing/admin/summary')])
    const rev=(a.revenue?.period_cents||0)
    host.innerHTML=`<div class="vg-kpis">
      <div class="vg-kpi"><span>Користувачі</span><b>${num(a.users.total)}</b><small>+${num(a.users.new_users)} за 30 днів</small></div>
      <div class="vg-kpi"><span>Активні 30 днів</span><b>${num(a.users.active_30d)}</b><small>${num(a.users.active_7d)} за 7 днів</small></div>
      <div class="vg-kpi"><span>Тренування / 30 днів</span><b>${num(totalWorkouts(a.daily))}</b><small>пік ${num(activePeak(a.daily))} активних / день</small></div>
      <div class="vg-kpi"><span>Дохід / 30 днів</span><b>${money(rev)}</b><small>${money(a.revenue?.lifetime_cents)} за весь час</small></div>
    </div>
    <div class="vg-chart-grid">
      <div class="vg-chart-card"><div class="vg-card-title"><h3>Активність платформи</h3><span>останні 30 днів · тренування</span></div>${bars(a.daily)}</div>
      <div class="vg-chart-card"><div class="vg-card-title"><h3>Найчастіші вправи</h3><span>за підходами</span></div>${topList(a.topExercises)}</div>
    </div>
    <div class="vg-chart-card"><div class="vg-card-title"><h3>Монетизація</h3><span>VARANGYM plans</span></div><div class="vg-plan-grid">${(b.plans||[]).map(p=>`<div class="vg-plan"><b>${esc(p.metadata?.label||p.code)}</b><small>${money(p.price_cents,p.currency)}${p.billing_kind==='recurring'?'/міс':''} · ${esc(p.audience)}</small></div>`).join('')}</div></div>`
  }

  async function renderCoach(host,workspaceId) {
    const a=await api(`/api/analytics/coach?days=30&workspaceId=${encodeURIComponent(workspaceId)}`)
    const active=a.clients.filter(c=>c.workouts_7d>0).length
    host.innerHTML=`<div class="vg-kpis">
      <div class="vg-kpi"><span>Клієнти</span><b>${num(a.clients.length)}</b><small>${active} тренувались за 7 днів</small></div>
      <div class="vg-kpi"><span>Тренування / 30 днів</span><b>${num(totalWorkouts(a.daily))}</b><small>усі ваші клієнти</small></div>
      <div class="vg-kpi"><span>Активність</span><b>${a.clients.length?Math.round(active*100/a.clients.length):0}%</b><small>клієнтів активні 7 днів</small></div>
      <div class="vg-kpi"><span>Пік за день</span><b>${num(activePeak(a.daily))}</b><small>активних клієнтів</small></div>
    </div>
    <div class="vg-chart-grid"><div class="vg-chart-card"><div class="vg-card-title"><h3>Тренування клієнтів</h3><span>30 днів</span></div>${bars(a.daily)}</div><div class="vg-chart-card"><div class="vg-card-title"><h3>Популярні вправи</h3><span>за підходами</span></div>${topList(a.topExercises)}</div></div>
    <div class="vg-chart-card"><div class="vg-card-title"><h3>Прогрес клієнтів</h3><span>вага + активність</span></div><div class="vg-client-grid">${a.clients.length?a.clients.map(c=>{const now=Number(c.latest_weight);const old=Number(c.weight_30d_ago);const delta=Number.isFinite(now)&&Number.isFinite(old)?now-old:null;return `<div class="vg-client"><b>${esc(c.display_name)}</b><small>${c.workouts_period} тренувань / 30 днів · останнє ${c.last_workout_at?new Date(c.last_workout_at).toLocaleDateString():'—'}</small>${delta!=null?`<small class="${delta>0?'vg-up':delta<0?'vg-down':''}">Вага: ${now.toFixed(1)} · ${delta>0?'+':''}${delta.toFixed(1)} / 30 днів</small>`:''}</div>`}).join(''):'<div class="empty">Клієнтів ще немає.</div>'}</div></div>`
  }

  async function renderBusiness(host,workspaceId) {
    const a=await api(`/api/analytics/business?days=30&workspaceId=${encodeURIComponent(workspaceId)}`)
    const clients=a.trainers.reduce((n,t)=>n+Number(t.clients||0),0)
    const active=a.trainers.reduce((n,t)=>n+Number(t.active_clients_7d||0),0)
    host.innerHTML=`<div class="vg-kpis">
      <div class="vg-kpi"><span>Тренери</span><b>${num(a.trainers.length)}</b><small>активні акаунти</small></div>
      <div class="vg-kpi"><span>Клієнти</span><b>${num(clients)}</b><small>${active} активних за 7 днів</small></div>
      <div class="vg-kpi"><span>Тренування / 30 днів</span><b>${num(totalWorkouts(a.daily))}</b><small>по організації</small></div>
      <div class="vg-kpi"><span>Дохід / 30 днів</span><b>${money(a.revenue?.period_cents)}</b><small>${money(a.revenue?.lifetime_cents)} за весь час</small></div>
    </div>
    <div class="vg-chart-grid"><div class="vg-chart-card"><div class="vg-card-title"><h3>Активність організації</h3><span>30 днів</span></div>${bars(a.daily)}</div><div class="vg-chart-card"><div class="vg-card-title"><h3>Популярні вправи</h3><span>за підходами</span></div>${topList(a.topExercises)}</div></div>
    <div class="vg-chart-card"><div class="vg-card-title"><h3>Навантаження тренерів</h3><span>клієнти / тренування</span></div><div class="vg-client-grid">${a.trainers.map(t=>`<div class="vg-client"><b>${esc(t.display_name)}</b><small>${t.clients} клієнтів · ${t.workouts_period} тренувань / 30 днів</small><small>${t.active_clients_7d} активних клієнтів / 7 днів</small></div>`).join('')||'<div class="empty">Тренерів ще немає.</div>'}</div></div>`
  }

  async function refresh() {
    const app=$('#appView'); if(!app||app.classList.contains('hidden'))return
    const active=$('#tabs .tab.active')?.dataset?.tab
    if(!['admin','coach','business'].includes(active)) return
    let me
    try{me=await api('/api/me')}catch{return}
    const ms=me.memberships||[]
    const workspace=active==='business'
      ? ms.find(m=>m.workspace_type==='organization'&&['owner','admin'].includes(m.role))
      : active==='coach'
        ? ms.find(m=>['owner','admin','trainer'].includes(m.role))
        : null
    const key=`${active}:${workspace?.workspace_id||'platform'}`
    if(loading||lastKey===key&&$('#vgAnalytics'))return
    loading=true;lastKey=key;styles()
    let host=$('#vgAnalytics')
    if(!host){host=document.createElement('section');host.id='vgAnalytics';host.className='vg-analytics';$('#panel')?.prepend(host)}
    if(!host){loading=false;return}
    host.innerHTML='<div class="empty">Завантажую аналітику…</div>'
    try{
      if(active==='admin')await renderAdmin(host)
      else if(active==='coach'&&workspace)await renderCoach(host,workspace.workspace_id)
      else if(active==='business'&&workspace)await renderBusiness(host,workspace.workspace_id)
      else host.innerHTML='<div class="empty">Немає доступного workspace.</div>'
    }catch(e){host.innerHTML=`<div class="empty">Аналітика поки недоступна: ${esc(e.message)}</div>`}
    finally{loading=false}
  }

  document.addEventListener('click',e=>{if(e.target?.closest?.('#tabs .tab')){lastKey='';setTimeout(refresh,180)}})
  const obs=new MutationObserver(()=>{if(!loading)setTimeout(refresh,80)})
  obs.observe(document.documentElement,{childList:true,subtree:true})
  setTimeout(refresh,400)
})()
