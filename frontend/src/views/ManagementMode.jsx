import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { businessMemberships, loadPlatformIdentity, platformAccess, trainerMemberships } from '../lib/platform-role.js'
import { managementModeFromPath, managementRoute } from '../lib/management-path.js'
import { useUI } from '../store/useUI.js'
import Icon from '../components/Icon.jsx'
import ExerciseAdminManager from '../components/ExerciseAdminManager.jsx'
import { Button, Row, Section } from '../components/ui.jsx'

const fmt = v => new Intl.NumberFormat('uk-UA').format(Number(v || 0))
const money = (cents, currency='USD') => new Intl.NumberFormat('uk-UA',{style:'currency',currency:String(currency||'USD').toUpperCase(),maximumFractionDigits:2}).format(Number(cents||0)/100)
const dt = (v,time=false) => v ? (time ? new Date(v).toLocaleString('uk-UA') : new Date(v).toLocaleDateString('uk-UA')) : '—'
const activeInvite = i => !i.revoked_at && Number(i.use_count||0)<Number(i.max_uses||1) && new Date(i.expires_at)>new Date()

function Metric({ value, label, note, onClick, accent=false }) {
  const body=<><div className="n">{value ?? '—'}</div><div className="l">{label}</div>{note&&<div className="s">{note}</div>}</>
  return onClick
    ? <button className="stat" onClick={onClick} style={{textAlign:'left',color:'inherit',cursor:'pointer',borderColor:accent?'var(--acc)':undefined}}>{body}</button>
    : <div className="stat">{body}</div>
}

function MiniBars({ rows=[], keyName='workouts', valueFormat=v=>fmt(v) }) {
  const values=rows.map(x=>Number(x?.[keyName]||0));const max=Math.max(0,...values)
  if(!rows.length)return <div className="empty">Ще немає даних.</div>
  return <div style={{height:150,display:'flex',alignItems:'flex-end',gap:4,borderBottom:'var(--hair) solid var(--sep)',paddingTop:8}}>
    {rows.map((x,i)=>{const v=values[i];const h=max?Math.max(3,Math.round(v/max*100)):2;return <div key={`${x.day||i}:${i}`} title={`${x.day||''} · ${valueFormat(v)}`} style={{height:`${h}%`,flex:1,minWidth:3,borderRadius:'5px 5px 1px 1px',background:'var(--acc)',opacity:v?.95:.18}}/>})}
  </div>
}

function ModeHeader({ mode, identity, workspace, onRefresh }) {
  const nav=useNavigate()
  const names={admin:'Адмін',business:'Бізнес',trainer:'Тренер'}
  return <div className="hdr">
    <button className="iconbtn" onClick={()=>nav('/settings')} aria-label="Налаштування"><Icon name="chevronLeft"/></button>
    <div style={{flex:1,marginLeft:10}}><h1>{names[mode]} · VARANGYM</h1><div className="sub">{workspace?.workspace_name||workspace?.name||identity?.user?.display_name||''}</div></div>
    <button className="iconbtn" onClick={onRefresh} aria-label="Оновити"><Icon name="reset"/></button>
  </div>
}

function WorkspacePicker({ spaces=[], value, onChange }) {
  if(spaces.length<=1)return null
  return <Section title="Workspace">{spaces.map(s=><Row key={`${s.workspace_id}:${s.role}`} icon="personCircle" iconTint={s.workspace_id===value?'var(--acc)':'var(--grey)'} title={s.workspace_name||'Workspace'} subtitle={`${s.workspace_type||''} · ${s.role}`} accessory={s.workspace_id===value?'check':'chevron'} onClick={()=>onChange(s.workspace_id)}/>)}</Section>
}

function InviteTools({ mode, workspaceId, workspaces=[], invites=[], reload }) {
  const toast=useUI(s=>s.toast)
  const roles=mode==='admin'
    ? [['solo_client','Solo'],['independent_trainer','Тренер'],['organization_owner','Власник бізнесу'],['client','Клієнт workspace'],['trainer','Тренер workspace'],['organization_admin','Адмін workspace']]
    : mode==='business' ? [['client','Клієнт'],['trainer','Тренер'],['organization_admin','Адмін бізнесу']] : [['client','Клієнт']]
  const [role,setRole]=useState(roles[0][0]);const [ws,setWs]=useState(workspaceId||'');const [email,setEmail]=useState('');const [days,setDays]=useState(7);const [created,setCreated]=useState(null);const [busy,setBusy]=useState(false)
  useEffect(()=>{if(workspaceId)setWs(workspaceId)},[workspaceId])
  const requiresWs=['client','trainer','organization_admin'].includes(role)
  const create=async()=>{if(requiresWs&&!ws)return toast('Вибери workspace');setBusy(true);try{const d=await api('/api/invites',{method:'POST',body:JSON.stringify({targetRole:role,workspaceId:requiresWs?ws:null,email:email.trim()||null,maxUses:1,expiresInDays:Number(days)||7,metadata:{}})});setCreated(d.code);await reload?.();toast('Код створено')}catch(e){toast(e.message||'Помилка')}finally{setBusy(false)}}
  const revoke=async i=>{try{await api('/api/invites/revoke',{method:'POST',body:JSON.stringify({id:i.id})});await reload?.()}catch(e){toast(e.message||'Помилка')}}
  return <>
    <div className="card"><div className="lbl2">Коди та привʼязка акаунтів</div><div className="ss" style={{margin:'4px 0 12px'}}>Trial-реєстрація відкрита без коду. Код потрібен, коли треба одразу привʼязати людину до тренера, бізнесу чи конкретної ролі.</div>
      <div style={{display:'grid',gap:9}}>
        <select className="field" value={role} onChange={e=>setRole(e.target.value)}>{roles.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        {mode==='admin'&&requiresWs&&<select className="field" value={ws} onChange={e=>setWs(e.target.value)}><option value="">— workspace —</option>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>}
        <input className="field" type="email" placeholder="Email (необовʼязково)" value={email} onChange={e=>setEmail(e.target.value)}/>
        <input className="field" type="number" min="1" max="365" value={days} onChange={e=>setDays(e.target.value)}/>
        <Button variant="primary" onClick={create} disabled={busy}>{busy?'Створюю…':'Створити код'}</Button>
      </div>
    </div>
    {created&&<div className="card"><div className="lbl2">Новий код</div><div style={{fontSize:25,fontWeight:850,letterSpacing:'.08em',margin:'8px 0'}}>{created}</div><Button size="sm" onClick={()=>navigator.clipboard?.writeText(created)}>Копіювати</Button></div>}
    <Section title={`Активні коди · ${invites.filter(activeInvite).length}`}>{invites.length?invites.slice(0,30).map(i=><Row key={i.id} icon="key" iconTint={activeInvite(i)?'var(--acc)':'var(--grey)'} title={i.code||i.target_role} subtitle={`${i.target_role} · ${i.use_count}/${i.max_uses} · до ${dt(i.expires_at)}`} value={activeInvite(i)?'ON':'—'} onClick={()=>activeInvite(i)&&revoke(i)}/>):<Row title="Кодів ще немає"/>}</Section>
  </>
}

function ClientDetail({ client, workspaceId, back }) {
  const [data,setData]=useState(null);const [err,setErr]=useState('');const toast=useUI(s=>s.toast);const [busy,setBusy]=useState(false);const id=client.user_id||client.id
  const load=()=>{setErr('');api(`/api/analytics/client/${encodeURIComponent(id)}?days=90&workspaceId=${encodeURIComponent(workspaceId)}`).then(setData).catch(e=>setErr(e.message||'Помилка'))}
  useEffect(load,[id,workspaceId])
  const assign=async()=>{setBusy(true);try{const d=await api('/api/profile-plan/publish',{method:'POST',body:JSON.stringify({workspaceId,clientId:id,name:`${client.display_name||'Client'} · VARANGYM`})});toast(`План призначено · v${d.versionNumber}`);load()}catch(e){toast(e.message||'Не вдалося призначити план')}finally{setBusy(false)}}
  return <><div className="row between" style={{marginBottom:12}}><Button size="sm" onClick={back}>← Назад</Button><Button size="sm" variant="primary" onClick={assign} disabled={busy}>{busy?'…':'Призначити мій план'}</Button></div>
    <div className="card"><div className="lbl2">Клієнт</div><div className="big" style={{fontSize:27}}>{client.display_name||data?.client?.display_name||'Client'}</div><div className="ss">{client.email||data?.client?.email||''}</div></div>
    {err&&<div className="card"><div className="ss">{err}</div><Button size="sm" onClick={load}>Повторити</Button></div>}
    {!data&&!err&&<div className="empty">Завантаження…</div>}
    {data&&<><div className="grid2"><Metric value={fmt(data.summary?.workouts)} label="тренувань / 90 днів"/><Metric value={fmt(data.summary?.completed_sets)} label="підходів"/><Metric value={fmt(Math.round(Number(data.summary?.volume||0)))} label="обсяг"/><Metric value={dt(data.summary?.last_workout_at)} label="останнє тренування"/></div>
      <div className="card"><div className="lbl2">Активність · 90 днів</div><MiniBars rows={data.daily||[]}/></div>
      <Section title="Поточна програма">{data.currentProgram?<Row icon="calendar" iconTint="var(--acc)" title={data.currentProgram.name||'Програма'} subtitle={`v${data.currentProgram.version_number||1} · ${data.currentProgram.trainer_name||''}`} value={`${data.currentProgram.days?.length||0} днів`}/>:<Row title="Програму ще не призначено"/>}</Section>
      <Section title="Останні тренування">{(data.recentWorkouts||[]).slice(0,20).map(w=><Row key={w.id} icon="dumbbell" title={w.name||'Тренування'} subtitle={`${dt(w.started_at,true)} · ${fmt(w.completed_sets)} підходів`} value={fmt(Math.round(Number(w.volume||0)))}/>)}{!(data.recentWorkouts||[]).length&&<Row title="Історії ще немає"/>}</Section></>}
  </>
}

function AdminUserDetail({ user, back }) {
  const [d,setD]=useState(null);const [training,setTraining]=useState(null)
  useEffect(()=>{api(`/api/admin-insights/user?id=${encodeURIComponent(user.id)}`).then(setD).catch(()=>{});api(`/api/analytics/client/${encodeURIComponent(user.id)}?days=90`).then(setTraining).catch(()=>{})},[user.id])
  if(!d)return <><Button size="sm" onClick={back}>← Назад</Button><div className="empty">Завантаження профілю…</div></>
  const last=d.sessions?.[0]
  return <><Button size="sm" onClick={back}>← Користувачі</Button><div style={{height:10}}/>
    <div className="card"><div className="lbl2">Акаунт</div><div className="big" style={{fontSize:27}}>{d.user.display_name}</div><div className="ss">{d.user.email||'—'} · {d.user.status} · {d.user.locale}</div></div>
    <div className="grid2"><Metric value={d.subscriptions?.[0]?.plan_code||'—'} label="поточний тариф" note={d.subscriptions?.[0]?.status}/><Metric value={d.subscriptions?.[0]?.trial_ends_at?dt(d.subscriptions[0].trial_ends_at):'—'} label="trial до"/><Metric value={fmt(training?.summary?.workouts||d.workouts?.length||0)} label="тренувань"/><Metric value={dt(last?.last_seen_at,true)} label="остання активність"/></div>
    <Section title="Мережа / регіон"><Row icon="globe" title={[last?.city,last?.region,last?.country_code].filter(Boolean).join(', ')||'Гео не передано проксі'} subtitle={last?.ip_hint||'IP недоступний'} value={last?.user_agent?'device':''}/></Section>
    <Section title="Ролі та workspaces">{d.memberships?.map((m,i)=><Row key={`${m.workspace_id}:${m.role}:${i}`} icon="personCircle" title={m.workspace} subtitle={`${m.type} · ${m.role}`} value={m.status}/> )}</Section>
    <Section title="Підписки">{d.subscriptions?.length?d.subscriptions.map(s=><Row key={s.id} icon="creditCard" title={s.plan_code} subtitle={`${s.status} · ${s.provider}`} value={s.trial_ends_at?`trial ${dt(s.trial_ends_at)}`:dt(s.current_period_end)}/>):<Row title="Підписок немає"/>}</Section>
    <Section title="Платежі">{d.payments?.length?d.payments.map(p=><Row key={p.id} icon="creditCard" title={money(p.amount_cents,p.currency)} subtitle={`${p.status} · ${p.plan_code||''}`} value={dt(p.paid_at||p.created_at)}/>):<Row title="Платежів немає"/>}</Section>
  </>
}

function WorkspaceDetail({ workspace, back }) {
  const [overview,setOverview]=useState(null);const [clients,setClients]=useState([]);const [analytics,setAnalytics]=useState(null);const [trainer,setTrainer]=useState(null)
  useEffect(()=>{Promise.allSettled([api(`/api/business/overview?workspaceId=${workspace.id}`),api(`/api/coach/clients?workspaceId=${workspace.id}`),api(`/api/analytics/business?days=30&workspaceId=${workspace.id}`)]).then(([a,b,c])=>{if(a.status==='fulfilled')setOverview(a.value);if(b.status==='fulfilled')setClients(b.value.clients||[]);if(c.status==='fulfilled')setAnalytics(c.value)})},[workspace.id])
  const shown=trainer?clients.filter(c=>(c.trainer_id||'')===trainer.id):clients
  return <><div className="row between"><Button size="sm" onClick={back}>← Workspaces</Button>{trainer&&<Button size="sm" onClick={()=>setTrainer(null)}>Всі клієнти</Button>}</div><div style={{height:10}}/>
    <div className="card"><div className="lbl2">{workspace.type}</div><div className="big" style={{fontSize:27}}>{trainer?.display_name||workspace.name}</div><div className="ss">{trainer?`${trainer.clients||0} клієнтів`:`${workspace.members||0} учасників · ${workspace.trainers||0} тренерів · ${workspace.clients||0} клієнтів`}</div></div>
    {!trainer&&<div className="grid2"><Metric value={overview?.stats?.trainers??workspace.trainers} label="тренерів"/><Metric value={overview?.stats?.clients??workspace.clients} label="клієнтів"/><Metric value={fmt((analytics?.daily||[]).reduce((n,x)=>n+Number(x.workouts||0),0))} label="тренувань / 30д"/><Metric value={money(analytics?.revenue?.period_cents)} label="дохід / 30д"/></div>}
    {!trainer&&<Section title="Тренери">{(overview?.trainers||[]).map(t=><Row key={t.id} icon="personCircle" title={t.display_name} subtitle={t.email||''} value={`${t.clients||0} клієнтів`} accessory="chevron" onClick={()=>setTrainer(t)}/>)}</Section>}
    <Section title={trainer?`Клієнти ${trainer.display_name}`:'Клієнти'}>{shown.length?shown.map(c=><Row key={c.id} icon="personCircle" title={c.display_name} subtitle={`${c.trainer_name||''} · ${c.workouts_30d||0} тренувань / 30д`} value={dt(c.last_workout_at)}/>):<Row title="Клієнтів немає"/>}</Section>
  </>
}

function PlanAndExercises({ mode, workspaceId, clients=[] }) {
  const nav=useNavigate();const toast=useUI(s=>s.toast);const [preview,setPreview]=useState(null);const [catalog,setCatalog]=useState([]);const [q,setQ]=useState('');const [busy,setBusy]=useState('');const [custom,setCustom]=useState(false);const [name,setName]=useState('')
  const load=()=>Promise.allSettled([api(`/api/profile-plan/preview?workspaceId=${encodeURIComponent(workspaceId)}`),api(`/api/training/exercises?workspaceId=${encodeURIComponent(workspaceId)}&scope=all&locale=uk&limit=120&q=${encodeURIComponent(q)}`)]).then(([p,e])=>{if(p.status==='fulfilled')setPreview(p.value);if(e.status==='fulfilled')setCatalog(e.value.exercises||[])})
  useEffect(()=>{if(workspaceId)load()},[workspaceId,q])
  const assign=async c=>{const id=c.user_id||c.id;setBusy(id);try{const d=await api('/api/profile-plan/publish',{method:'POST',body:JSON.stringify({workspaceId,clientId:id,name:`${c.display_name||'Client'} · VARANGYM`})});toast(`План призначено · v${d.versionNumber}`)}catch(e){toast(e.message||'Помилка')}finally{setBusy('')}}
  const create=async()=>{if(!name.trim())return;try{await api('/api/training/exercises/custom',{method:'POST',body:JSON.stringify({workspaceId,name:name.trim(),locale:'uk',ownerScope:mode==='business'?'organization':'trainer'})});setName('');setCustom(false);load();toast('Власну вправу створено')}catch(e){toast(e.message||'Помилка')}}
  return <>
    <div className="card"><div className="row between" style={{alignItems:'flex-start',gap:10}}><div><div className="lbl2">План та каталог</div><div className="big" style={{fontSize:24}}>{preview?.days?.length||0} тренувальних днів</div><div className="ss">План редагується у звичайному редакторі VARANGYM, а тут призначається клієнтам.</div></div><Button size="sm" onClick={()=>nav('/plan')}>Редагувати план</Button></div></div>
    <Section title="Призначити план">{clients.length?clients.map(c=>{const id=c.user_id||c.id;return <Row key={id} icon="personCircle" title={c.display_name} subtitle={c.email||''}><Button size="sm" disabled={busy===id} onClick={()=>assign(c)}>{busy===id?'…':'Призначити'}</Button></Row>}):<Row title="Клієнтів ще немає"/>}</Section>
    <div className="card"><div className="row between"><div><div className="lbl2">Каталог вправ</div><div className="ss">Глобальні + ваші власні вправи.</div></div><Button size="sm" icon="plus" onClick={()=>setCustom(v=>!v)}>Власна</Button></div>{custom&&<div className="row" style={{gap:8,marginTop:10}}><input className="field" value={name} onChange={e=>setName(e.target.value)} placeholder="Назва вправи"/><Button size="sm" variant="primary" onClick={create}>Створити</Button></div>}<div className="search" style={{marginTop:10}}><Icon name="magnifier"/><input className="input" placeholder="Пошук…" value={q} onChange={e=>setQ(e.target.value)}/></div></div>
    <Section title={`Вправи · ${catalog.length}`}>{catalog.slice(0,80).map(ex=><Row key={ex.id} icon="dumbbell" iconTint={ex.owner_scope==='platform'?'var(--grey)':'var(--acc)'} title={ex.name} subtitle={`${ex.primary_muscle_key||''} · ${ex.equipment_key||''}`} value={ex.owner_scope==='platform'?'VARANGYM':'Власна'}/>)}</Section>
  </>
}

export default function ManagementMode() {
  const loc=useLocation();const nav=useNavigate();const toast=useUI(s=>s.toast);const route=managementModeFromPath(loc.pathname)||{mode:'trainer',section:'dashboard'};const {mode,section}=route
  const [identity,setIdentity]=useState(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [overview,setOverview]=useState(null);const [analytics,setAnalytics]=useState(null);const [billing,setBilling]=useState(null);const [invites,setInvites]=useState([]);const [insights,setInsights]=useState(null);const [workspaces,setWorkspaces]=useState([]);const [workspaceId,setWorkspaceId]=useState('');const [clients,setClients]=useState([]);const [selectedClient,setSelectedClient]=useState(null);const [selectedUser,setSelectedUser]=useState(null);const [selectedWorkspace,setSelectedWorkspace]=useState(null);const [homeTools,setHomeTools]=useState('')

  const access=useMemo(()=>platformAccess(identity),[identity]);const trainerSpaces=useMemo(()=>trainerMemberships(identity),[identity]);const businessSpaces=useMemo(()=>businessMemberships(identity),[identity]);const spaces=mode==='business'?businessSpaces:trainerSpaces
  const allowed=identity&&((mode==='admin'&&access.platformAdmin)||(mode==='business'&&access.business)||(mode==='trainer'&&access.trainer))
  const currentSpace=spaces.find(x=>x.workspace_id===workspaceId)||spaces[0]

  const load=async()=>{
    setLoading(true);setError('')
    try{
      const me=identity||await loadPlatformIdentity();if(!identity)setIdentity(me);const a=platformAccess(me)
      if(!((mode==='admin'&&a.platformAdmin)||(mode==='business'&&a.business)||(mode==='trainer'&&a.trainer))){nav('/settings',{replace:true});return}
      if(mode==='admin'){
        const rs=await Promise.allSettled([api('/api/admin/overview'),api('/api/admin/workspaces'),api('/api/analytics/admin?days=30'),api('/api/billing/admin/summary'),api('/api/invites'),api('/api/admin-insights/summary')])
        setOverview(rs[0].status==='fulfilled'?rs[0].value:{});const ws=rs[1].status==='fulfilled'?rs[1].value.workspaces||[]:[];setWorkspaces(ws);setAnalytics(rs[2].status==='fulfilled'?rs[2].value:null);setBilling(rs[3].status==='fulfilled'?rs[3].value:null);setInvites(rs[4].status==='fulfilled'?rs[4].value.invites||[]:[]);setInsights(rs[5].status==='fulfilled'?rs[5].value:null);if(!workspaceId&&ws.length)setWorkspaceId(ws[0].id)
      }else{
        const candidate=workspaceId||(mode==='business'?businessMemberships(me)[0]?.workspace_id:trainerMemberships(me)[0]?.workspace_id);if(!candidate)throw new Error('Немає workspace для цього режиму');if(!workspaceId)setWorkspaceId(candidate)
        const calls=mode==='business'?[api(`/api/business/overview?workspaceId=${candidate}`),api(`/api/analytics/business?days=30&workspaceId=${candidate}`),api(`/api/coach/clients?workspaceId=${candidate}`),api(`/api/invites?workspaceId=${candidate}`),api('/api/billing/me')]:[api(`/api/coach/clients?workspaceId=${candidate}`),api(`/api/analytics/coach?days=30&workspaceId=${candidate}`),api(`/api/coach/clients?workspaceId=${candidate}`),api(`/api/invites?workspaceId=${candidate}`),api('/api/billing/me')]
        const rs=await Promise.allSettled(calls);setOverview(rs[0].status==='fulfilled'?rs[0].value:{});setAnalytics(rs[1].status==='fulfilled'?rs[1].value:null);setClients(rs[2].status==='fulfilled'?rs[2].value.clients||[]:[]);setInvites(rs[3].status==='fulfilled'?rs[3].value.invites||[]:[]);setBilling(rs[4].status==='fulfilled'?rs[4].value:null)
      }
    }catch(e){setError(e.message||'Помилка завантаження')}finally{setLoading(false)}
  }
  useEffect(()=>{setSelectedClient(null);setSelectedUser(null);setSelectedWorkspace(null);setHomeTools('');load() /* eslint-disable-next-line react-hooks/exhaustive-deps */},[mode,workspaceId])

  if(!identity&&loading)return <div className="empty">Завантаження режиму керування…</div>
  if(!allowed&&!loading)return null
  if(selectedClient)return <div className="narrow"><ModeHeader mode={mode} identity={identity} workspace={currentSpace} onRefresh={load}/><ClientDetail client={selectedClient} workspaceId={workspaceId} back={()=>setSelectedClient(null)}/></div>
  if(selectedUser)return <div className="narrow"><ModeHeader mode={mode} identity={identity} onRefresh={load}/><AdminUserDetail user={selectedUser} back={()=>setSelectedUser(null)}/></div>
  if(selectedWorkspace)return <div className="narrow"><ModeHeader mode={mode} identity={identity} onRefresh={load}/><WorkspaceDetail workspace={selectedWorkspace} back={()=>setSelectedWorkspace(null)}/></div>

  const f=insights?.finance||{};const adminUsers=insights?.directory||[];const trainers=overview?.trainers||[];const stats=overview?.stats||{};const periodRevenue=analytics?.revenue?.period_cents||0
  const workspaceBilling=billing?.workspaceBilling?.find(x=>x.workspace_id===workspaceId);const workspaceSub=(billing?.workspaceSubscriptions||[]).filter(x=>x.workspace_id===workspaceId).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))[0]
  const currentPlan=workspaceBilling?.plan_code||workspaceSub?.plan_code||'—'

  const dashboard=()=>{
    if(mode==='admin')return <><div className="grid2"><Metric value={money(f.mrr_cents)} label="MRR" note="регулярний місячний дохід"/><Metric value={money(f.arr_cents)} label="ARR"/><Metric value={money(f.revenue_month_cents)} label="дохід цього місяця"/><Metric value={money(f.revenue_lifetime_cents)} label="дохід за весь час"/><Metric value={fmt(f.active_subscriptions)} label="активних підписок"/><Metric value={fmt(f.active_trials)} label="активних trial" note={`${fmt(f.trials_expiring_7d)} завершаться ≤7 днів`}/><Metric value={fmt(adminUsers.length)} label="користувачів" onClick={()=>nav(managementRoute(mode,'people'))}/><Metric value={fmt(workspaces.length)} label="workspaces" onClick={()=>setHomeTools('workspaces')}/></div><div className="card"><div className="lbl2">Дохід · 90 днів</div><MiniBars rows={insights?.dailyRevenue||[]} keyName="cents" valueFormat={v=>money(v)}/></div><Section title="Хто на якому тарифі">{(insights?.subjects||[]).slice(0,30).map((s,i)=><Row key={`${s.subject_type}:${s.subject_id}:${i}`} icon="creditCard" title={s.subject_name||s.billing_email||'Subject'} subtitle={`${s.plan_code||'—'} · ${s.subscription_status||'configured'}${s.trial_ends_at?` · trial до ${dt(s.trial_ends_at)}`:''}`} value={money(s.paid_cents)}/>)}</Section></>
    return <><div className="grid2"><Metric value={clients.length||stats.clients||0} label="клієнтів" onClick={()=>nav(managementRoute(mode,'people'))}/><Metric value={mode==='business'?(stats.trainers??trainers.length):(analytics?.clients?.length??clients.length)} label={mode==='business'?'тренерів':'активна база'}/><Metric value={fmt((analytics?.daily||[]).reduce((n,x)=>n+Number(x.workouts||0),0))} label="тренувань / 30 днів"/><Metric value={mode==='business'?money(periodRevenue):currentPlan} label={mode==='business'?'дохід / 30 днів':'поточний тариф'}/></div><div className="card"><div className="lbl2">Активність · 30 днів</div><MiniBars rows={analytics?.daily||[]}/></div></>
  }

  return <div className="narrow"><ModeHeader mode={mode} identity={identity} workspace={currentSpace||overview?.workspace} onRefresh={load}/>
    {mode!=='admin'&&<WorkspacePicker spaces={spaces} value={workspaceId} onChange={setWorkspaceId}/>} 
    {error&&<div className="card"><div className="ttl">Помилка</div><div className="ss">{error}</div><Button size="sm" onClick={load}>Повторити</Button></div>}
    {loading&&!overview&&<div className="empty">Завантаження…</div>}

    {section==='home'&&<>
      <div className="card"><div className="lbl2">{mode==='admin'?'VARANGYM Platform':mode==='business'?'Бізнес-профіль':'Тренерський профіль'}</div><div className="big" style={{fontSize:25}}>{mode==='admin'?'Огляд керування':(currentSpace?.workspace_name||overview?.workspace?.name||'VARANGYM')}</div><div className="ss">Коротко про стан акаунта. Детальні метрики — у центральному Дашборді.</div></div>
      {mode==='admin'?<div className="grid2"><Metric value={fmt(adminUsers.length)} label="користувачів"/><Metric value={fmt(f.active_subscriptions)} label="підписок"/><Metric value={money(f.mrr_cents)} label="MRR"/><Metric value={invites.filter(activeInvite).length} label="активних кодів"/></div>:<div className="grid2"><Metric value={currentPlan} label="поточний план" note={workspaceSub?.status}/><Metric value={workspaceSub?.trial_ends_at?dt(workspaceSub.trial_ends_at):'—'} label="trial до"/><Metric value={clients.length||stats.clients||0} label="клієнтів"/><Metric value={invites.filter(activeInvite).length} label="активних кодів"/></div>}
      <div className="grid2"><Button onClick={()=>setHomeTools(homeTools==='codes'?'':'codes')}>Коди доступу</Button><Button onClick={()=>nav('/settings')}>Підписка / налаштування</Button></div>
      {homeTools==='codes'&&<InviteTools mode={mode} workspaceId={workspaceId} workspaces={workspaces} invites={invites} reload={load}/>} 
      {mode==='admin'&&<Section title="Workspaces"><Row icon="personCircle" title={`${workspaces.length} workspaces`} subtitle="Організації, незалежні тренери та VARANGYM Direct" accessory="chevron" onClick={()=>setHomeTools(homeTools==='workspaces'?'':'workspaces')}/>{homeTools==='workspaces'&&workspaces.map(w=><Row key={w.id} icon="personCircle" title={w.name} subtitle={`${w.type} · ${w.members||0} учасників`} value={`${w.trainers||0}/${w.clients||0}`} accessory="chevron" onClick={()=>setSelectedWorkspace(w)}/>)}</Section>}
    </>}

    {section==='people'&&<>{mode==='admin'?<Section title={`Всі користувачі · ${adminUsers.length}`}>{adminUsers.map(u=><Row key={u.id} icon="personCircle" iconTint={u.is_platform_admin?'var(--acc)':'var(--blue)'} title={u.display_name} subtitle={`${u.email||'—'} · ${u.direct_plan||u.managed_plans?.[0]?.planCode||'без тарифу'} · ${[u.city,u.region,u.country_code].filter(Boolean).join(', ')||u.last_ip||'гео —'}`} value={`${u.workouts_30d||0}/30д`} accessory="chevron" onClick={()=>setSelectedUser(u)}/>)}</Section>:mode==='business'?<><Section title={`Тренери · ${trainers.length}`}>{trainers.map(t=><Row key={t.id} icon="personCircle" iconTint="var(--indigo)" title={t.display_name} subtitle={t.email||''} value={`${t.clients||0} клієнтів`}/>)}</Section><Section title={`Клієнти · ${clients.length}`}>{clients.map(c=><Row key={c.id} icon="personCircle" title={c.display_name} subtitle={`${c.trainer_name||'без тренера'} · ${c.workouts_30d||0} тренувань`} value={dt(c.last_workout_at)} accessory="chevron" onClick={()=>setSelectedClient(c)}/>)}</Section></>:<Section title={`Мої клієнти · ${clients.length}`}>{clients.map(c=><Row key={c.id} icon="personCircle" title={c.display_name} subtitle={`${c.email||''} · ${c.workouts_30d||0} тренувань / 30д`} value={dt(c.last_workout_at)} accessory="chevron" onClick={()=>setSelectedClient(c)}/>)}</Section>}</>}

    {section==='dashboard'&&dashboard()}

    {section==='stats'&&<><div className="card"><div className="lbl2">Тренувальна статистика</div><div className="ss">Кожен клієнт відкривається в деталях зі своїм прогресом, програмою та історією.</div><MiniBars rows={analytics?.daily||[]}/></div>{mode==='admin'?<Section title="Найактивніші користувачі">{adminUsers.slice().sort((a,b)=>Number(b.workouts_30d||0)-Number(a.workouts_30d||0)).slice(0,30).map(u=><Row key={u.id} icon="chartLine" title={u.display_name} subtitle={u.email||''} value={`${u.workouts_30d||0} / 30д`} accessory="chevron" onClick={()=>setSelectedUser(u)}/>)}</Section>:<Section title="Клієнти">{clients.slice().sort((a,b)=>Number(b.workouts_30d||b.workouts_period||0)-Number(a.workouts_30d||a.workouts_period||0)).map(c=><Row key={c.id} icon="chartLine" title={c.display_name} subtitle={c.trainer_name||''} value={`${c.workouts_30d||c.workouts_period||0} / 30д`} accessory="chevron" onClick={()=>setSelectedClient(c)}/>)}</Section>}</>}

    {section==='exercises'&&(mode==='admin'?<ExerciseAdminManager/>:<PlanAndExercises mode={mode} workspaceId={workspaceId} clients={clients}/>)}
  </div>
}
