import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { loadPlatformIdentity, platformAccess, trainerMemberships, businessMemberships } from '../lib/platform-role.js'
import { setRoleMode, viewOf } from '../lib/role-mode.js'
import { useUI } from '../store/useUI.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import LineChart from '../components/LineChart.jsx'
import { Button, Row, Section, Segmented } from '../components/ui.jsx'
import ManagedClientStats from '../components/ManagedClientStats.jsx'
import PlanManagerPro from '../components/PlanManagerPro.jsx'
import AdminExerciseStudio from '../components/AdminExerciseStudio.jsx'

const money=(cents,currency='USD')=>new Intl.NumberFormat('uk-UA',{style:'currency',currency,maximumFractionDigits:2}).format(Number(cents||0)/100)
const num=v=>new Intl.NumberFormat('uk-UA').format(Number(v||0))
const date=v=>{if(!v)return'—';try{return new Date(v).toLocaleDateString('uk-UA')}catch{return'—'}}
const dt=v=>{if(!v)return'—';try{return new Date(v).toLocaleString('uk-UA')}catch{return'—'}}
const ts=v=>{const x=String(v||'');const d=x.length===7?`${x}-01`:x;const n=new Date(d).getTime();return Number.isFinite(n)?n:Date.now()}
const activeInvite=i=>!i.revoked_at&&Number(i.use_count||0)<Number(i.max_uses||1)&&new Date(i.expires_at).getTime()>Date.now()

function Metric({label,value,note,onClick,icon}) {
  const Tag=onClick?'button':'div'
  return <Tag className="stat" onClick={onClick} style={onClick?{textAlign:'left',width:'100%',cursor:'pointer'}:undefined}>
    {icon&&<Icon name={icon}/>}<div className="n">{value}</div><div className="l">{label}</div>{note&&<div className="s">{note}</div>}
  </Tag>
}
function ChartCard({title,subtitle,rows=[],valueKey='workouts',unit='',moneyValue=false}) {
  const points=rows.map(x=>({t:ts(x.day||x.month),y:Number(x[valueKey]||0),d:x.day||x.month}))
  const total=points.reduce((a,p)=>a+p.y,0)
  return <div className="card">
    <div className="row between"><div><div className="lbl2">{title}</div>{subtitle&&<div className="ss">{subtitle}</div>}</div><span className="tag acc">{moneyValue?money(total):`${num(total)}${unit}`}</span></div>
    <div className="chart" style={{marginTop:10}}><LineChart points={points} h={170} unit={unit}/></div>
  </div>
}
function Distribution({title,rows=[],labelKey='label',valueKey='count',valueFormat=num}) {
  const max=Math.max(1,...rows.map(x=>Number(x[valueKey]||0)))
  return <div className="card">
    <div className="lbl2" style={{marginBottom:10}}>{title}</div>
    {rows.length?rows.slice(0,12).map((r,i)=><div className="mrow" key={`${r[labelKey]}:${i}`}>
      <span className="nm" style={{minWidth:120,whiteSpace:'normal'}}>{r[labelKey]||'—'}</span>
      <span className="bar"><i style={{width:`${Math.max(2,Math.round(Number(r[valueKey]||0)/max*100))}%`}}/></span>
      <span className="v">{valueFormat(r[valueKey]||0)}</span>
    </div>):<div className="small muted">Немає даних</div>}
  </div>
}
function ErrorBox({text,retry}) {
  return <div className="card"><div className="ttl">Не вдалося завантажити</div><div className="ss" style={{margin:'6px 0 12px'}}>{text}</div><Button onClick={retry}>Повторити</Button></div>
}
function SubscriptionBadge({status,plan}) {
  return <span className={'tag '+(status==='active'||status==='trialing'?'acc':'')}>{plan||'без плану'}{status?` · ${status}`:''}</span>
}

function InviteManager({mode,workspaceId,workspaces=[],invites=[],reload}) {
  const toast=useUI(s=>s.toast)
  const [role,setRole]=useState(mode==='trainer'?'client':mode==='business'?'client':'solo_client')
  const [email,setEmail]=useState('')
  const [workspace,setWorkspace]=useState(workspaceId||'')
  const [last,setLast]=useState('')
  const [busy,setBusy]=useState(false)
  useEffect(()=>{if(workspaceId)setWorkspace(workspaceId)},[workspaceId])
  const options=mode==='trainer'
    ? [['client','Клієнт']]
    : mode==='business'
      ? [['client','Клієнт'],['trainer','Тренер'],['organization_admin','Адмін організації']]
      : [['solo_client','Solo'],['independent_trainer','Тренер'],['organization_owner','Бізнес'],['client','Клієнт workspace'],['trainer','Тренер workspace']]
  const needsWs=['client','trainer','organization_admin'].includes(role)
  const create=async()=>{
    if(needsWs&&!workspace)return toast('Вибери workspace')
    setBusy(true)
    try{
      const d=await api('/api/invites',{method:'POST',body:JSON.stringify({targetRole:role,workspaceId:needsWs?workspace:null,email:email.trim()||null,maxUses:1,expiresInDays:7})})
      setLast(d.code);toast('Код створено');await reload?.()
    }catch(e){toast(e.message||'Не вдалося створити код')}
    finally{setBusy(false)}
  }
  return <div className="card">
    <div className="lbl2">Код привʼязки</div>
    <div className="ss">Код привʼязує клієнта до тренера або людину до організації. Реєстрація trial без коду працює окремо.</div>
    <div style={{display:'grid',gap:9,marginTop:10}}>
      <select className="field" value={role} onChange={e=>setRole(e.target.value)}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
      {needsWs&&mode==='admin'&&<select className="field" value={workspace} onChange={e=>setWorkspace(e.target.value)}><option value="">Workspace…</option>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>}
      <input className="field" type="email" placeholder="Email (необовʼязково)" value={email} onChange={e=>setEmail(e.target.value)}/>
      <Button variant="primary" disabled={busy} onClick={create}>{busy?'Створюю…':'Створити код'}</Button>
      {last&&<button className="card" style={{fontSize:24,fontWeight:800,letterSpacing:'.08em'}} onClick={()=>navigator.clipboard?.writeText(last).then(()=>toast('Скопійовано'))}>{last}</button>}
    </div>
    <div className="ss" style={{marginTop:10}}>{invites.filter(activeInvite).length} активних кодів</div>
  </div>
}

function ClientDetail({client,workspaceId,onBack,admin=false,onChanged,geo}) {
  const toast=useUI(s=>s.toast)
  const [tab,setTab]=useState('profile')
  const [stateData,setStateData]=useState(null)
  const [location,setLocation]=useState(geo||null)
  const [err,setErr]=useState('')
  const [busy,setBusy]=useState('')
  const id=client.id||client.user_id

  const load=async()=>{
    setErr('')
    try{
      const qs=workspaceId?`?workspaceId=${encodeURIComponent(workspaceId)}`:''
      const [stateResult,geoResult]=await Promise.allSettled([
        api(`/api/insights/clients/${encodeURIComponent(id)}/state${qs}`),
        api(`/api/geo/user/${encodeURIComponent(id)}`)
      ])
      if(stateResult.status!=='fulfilled')throw stateResult.reason
      setStateData(stateResult.value)
      if(geoResult.status==='fulfilled')setLocation(geoResult.value.location||null)
    }catch(e){setErr(e.message||'Помилка')}
  }
  useEffect(()=>{setStateData(null);setTab('profile');load()},[id,workspaceId])

  const act=async action=>{
    setBusy(action)
    try{
      await api(`/api/insights/admin/users/${encodeURIComponent(id)}/action`,{method:'POST',body:JSON.stringify({action})})
      toast('Готово')
      if(action==='delete'){await onChanged?.();onBack();return}
      await onChanged?.();await load()
    }catch(e){toast(e.message||'Не вдалося виконати дію')}
    finally{setBusy('')}
  }
  const ask=(action,title,message)=>confirmSheet({title,message,confirmText:'Підтвердити',danger:true,onConfirm:()=>act(action)})
  const profile=stateData?.client||client
  const S=stateData?.state||{}
  if(tab==='stats'&&stateData)return <>
    <Button size="sm" onClick={()=>setTab('profile')}>← Профіль</Button>
    <ManagedClientStats state={S} client={profile}/>
  </>

  return <>
    <Button size="sm" onClick={onBack}>← Назад</Button>
    <div className="card" style={{marginTop:12}}>
      <div className="row between">
        <div><div className="lbl2">Користувач</div><div className="big" style={{fontSize:28}}>{profile.display_name||profile.name||'Клієнт'}</div><div className="ss">{profile.email||'без email'}</div></div>
        <SubscriptionBadge plan={client.plan_code} status={client.subscription_status}/>
      </div>
    </div>
    <div className="card" style={{padding:8}}><Segmented value={tab} onChange={setTab} options={[{value:'profile',label:'Профіль'},{value:'stats',label:'Статистика'},...(admin?[{value:'manage',label:'Керування'}]:[])]}/></div>
    {err&&<ErrorBox text={err} retry={load}/>} 
    {!stateData&&!err&&<div className="empty">Завантаження…</div>}

    {stateData&&tab==='profile'&&<>
      <div className="grid2">
        <Metric value={(S.workouts||[]).length} label="всього тренувань"/>
        <Metric value={client.workouts_30d||0} label="тренувань / 30д"/>
        <Metric value={date(profile.created_at||client.created_at)} label="реєстрація"/>
        <Metric value={client.status||profile.status||'active'} label="статус"/>
      </div>
      <Section title="Акаунт">
        <Row title="Імʼя" value={profile.display_name||'—'}/>
        <Row title="Email" value={profile.email||'—'}/>
        <Row title="Підписка" value={<SubscriptionBadge plan={client.plan_code} status={client.subscription_status}/>}/>
        <Row title="Trial до" value={date(client.trial_ends_at)}/>
        <Row title="Останній вхід" value={dt(client.last_seen_at)}/>
        <Row title="IP останньої сесії" value={client.last_ip||location?.ip||'—'}/>
        <Row title="Пристрій" subtitle={client.user_agent||'—'}/>
      </Section>
      <Section title="Географія за IP" footer="Місто/регіон визначаються автоматично з останньої публічної IP-адреси й кешуються в базі. Це приблизна IP-геолокація, не GPS.">
        <Row icon="globe" title="Місто" value={location?.city||'—'}/>
        <Row title="Регіон / область" value={location?.region||'—'}/>
        <Row title="Країна" value={location?.country||'—'}/>
        <Row title="Часовий пояс" value={location?.timezone||'—'}/>
        <Row title="Оновлено" value={dt(location?.updated_at)}/>
      </Section>
      <Button variant="primary" onClick={()=>setTab('stats')}>Відкрити повну статистику клієнта</Button>
    </>}

    {stateData&&admin&&tab==='manage'&&<>
      <Section title="Доступ і сесії">
        {client.status==='disabled'
          ? <Row icon="shield" iconTint="var(--acc)" title="Розблокувати акаунт" accessory="chevron" onClick={()=>act('enable')}/>
          : <Row icon="shield" iconTint="var(--orange)" title="Забрати доступ" subtitle="Вимкнути акаунт і завершити сесії" accessory="chevron" onClick={()=>ask('revoke_access','Забрати доступ?','Користувач не зможе входити, доки адмін не поверне доступ.')}/>} 
        <Row icon="signOut" iconTint="var(--orange)" title="Вийти на всіх пристроях" accessory="chevron" onClick={()=>ask('revoke_sessions','Завершити всі сесії?','На всіх пристроях доведеться увійти заново.')}/>
      </Section>
      <Section title="Блок-лист">
        <Row icon="shield" iconTint="var(--red)" title="Забанити Email" subtitle={client.email||'Email відсутній'} accessory="chevron" onClick={()=>client.email&&ask('ban_email','Забанити Email?','З цією адресою не можна буде зареєструвати новий акаунт.')}/>
        <Row icon="shield" iconTint="var(--red)" title="Забанити IP" subtitle={client.last_ip||location?.ip||'IP відсутня'} accessory="chevron" onClick={()=>ask('ban_ip','Забанити IP?','Нові сесії з останньої IP-адреси будуть блокуватись.')}/>
        <Row icon="reset" title="Зняти бани" accessory="chevron" onClick={()=>act('unban')}/>
      </Section>
      <Section title="Небезпечна зона">
        <Row icon="trash" iconTint="var(--red)" danger title="Видалити користувача" subtitle="Акаунт, прогрес, звʼязки та дані буде видалено" accessory="chevron" onClick={()=>ask('delete','Видалити акаунт?','Ця дія незворотна.')}/>
      </Section>
      {busy&&<div className="small muted">Виконується: {busy}…</div>}
    </>}
  </>
}

function AdminConsole({view,data,geo,invites,reload}) {
  const [client,setClient]=useState(null)
  const [query,setQuery]=useState('')
  const [detail,setDetail]=useState('')
  const s=data?.summary||{},users=data?.users||[],spaces=data?.workspaces||[],series=data?.series||{}
  const geoMap=useMemo(()=>new Map((geo?.users||[]).map(x=>[x.id,x])),[geo])
  if(client)return <ClientDetail client={client} geo={geoMap.get(client.id)} admin onChanged={reload} onBack={()=>setClient(null)}/>

  if(view==='home')return <>
    <div className="card">
      <div className="row between"><div><div className="lbl2">VARANGYM · Admin</div><div className="big" style={{fontSize:31}}>Платформа</div><div className="ss">Користувачі, продукт, активність і дохід — в одному live overview.</div></div><div style={{textAlign:'right'}}><div className="big" style={{fontSize:25,color:'var(--acc)'}}>{money(s.mrrCents)}</div><div className="small dim">MRR</div></div></div>
    </div>
    <div className="grid2">
      <Metric icon="personCircle" value={num(s.users)} label="користувачів" note={`+${num(s.newUsers30d)} / 30д`}/>
      <Metric value={num(s.active7)} label="активні / 7д" note={`${num(s.active30)} / 30д`}/>
      <Metric value={num(s.active90)} label="активні / 90д"/>
      <Metric value={num(s.workouts30d)} label="тренувань / 30д"/>
      <Metric value={num(s.sets30d)} label="підходів / 30д"/>
      <Metric value={money(s.mrrCents)} label="MRR"/>
      <Metric value={money(s.monthRevenueCents)} label="дохід / місяць"/>
      <Metric value={money(s.lifetimeRevenueCents)} label="дохід за весь час"/>
      <Metric value={num(s.activeSubscriptions)} label="paid підписки"/>
      <Metric value={num(s.trials)} label="trial"/>
      <Metric value={num(s.organizations)} label="організацій"/>
      <Metric value={num(geo?.known||0)} label="геолокованих" note={`${num(geo?.total||0)} акаунтів`}/>
    </div>
    <ChartCard title="Тренування · 90 днів" subtitle="Щоденна активність" rows={series.activity||[]} valueKey="workouts"/>
    <ChartCard title="Активні користувачі · 90 днів" rows={series.activity||[]} valueKey="active_users"/>
    <ChartCard title="Нові користувачі · 90 днів" rows={series.signups||[]} valueKey="users"/>
    <Distribution title="Топ міст за IP" rows={geo?.byCity||[]}/>
    <Section title="Останні користувачі">{users.slice(0,8).map(u=><Row key={u.id} icon="personCircle" iconTint={u.status==='disabled'?'var(--red)':'var(--acc)'} title={u.display_name} subtitle={`${u.plan_code||'без плану'} · ${geoMap.get(u.id)?.city||'місто невідоме'}`} value={date(u.created_at)} accessory="chevron" onClick={()=>setClient(u)}/>)}</Section>
  </>

  if(view==='people'){
    const q=query.trim().toLowerCase()
    const filtered=users.filter(u=>!q||`${u.display_name} ${u.email||''} ${u.plan_code||''} ${geoMap.get(u.id)?.city||''} ${geoMap.get(u.id)?.region||''}`.toLowerCase().includes(q))
    return <>
      <div className="card"><div className="lbl2">Користувачі</div><input className="field" style={{marginTop:10}} placeholder="Імʼя, email, тариф, місто, регіон…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <Section title={`Акаунти · ${filtered.length}`}>{filtered.map(u=>{const g=geoMap.get(u.id);return <Row key={u.id} icon="personCircle" iconTint={u.status==='disabled'?'var(--red)':u.is_platform_admin?'var(--acc)':'var(--blue)'} title={u.display_name} subtitle={`${u.email||'без email'} · ${u.plan_code||'без плану'} · ${g?.city||'—'}, ${g?.region||'—'}`} value={u.workouts_30d?`${u.workouts_30d} / 30д`:u.status} accessory="chevron" onClick={()=>setClient(u)}/>} )}</Section>
      <Section title={`Організації / workspaces · ${spaces.length}`}>{spaces.map(w=><Row key={w.id} icon="personCircle" title={w.name} subtitle={`${w.type} · ${w.members} учасників`} value={`${w.trainers} трен. · ${w.clients} кл.`}/>)}</Section>
      <InviteManager mode="admin" workspaces={spaces} invites={invites} reload={reload}/>
    </>
  }

  if(view==='dashboard'){
    const subs=data?.subscriptions||[],payments=data?.payments||[]
    const filteredSubs=detail==='trials'?subs.filter(x=>x.status==='trialing'):detail==='subs'?subs.filter(x=>x.status==='active'):null
    return <>
      <div className="card"><div className="lbl2">Фінансовий дашборд</div><div className="big" style={{fontSize:28}}>Revenue & subscriptions</div><div className="ss">Кожна ключова цифра має drill-down, а не просто статичне число.</div></div>
      <div className="grid2">
        <Metric value={money(s.mrrCents)} label="MRR" onClick={()=>setDetail('subs')}/>
        <Metric value={money(s.monthRevenueCents)} label="дохід / місяць" onClick={()=>setDetail('payments')}/>
        <Metric value={money(s.lifetimeRevenueCents)} label="дохід за весь час" onClick={()=>setDetail('payments')}/>
        <Metric value={money(s.arpuCents)} label="ARPU"/>
        <Metric value={num(s.activeSubscriptions)} label="paid підписки" onClick={()=>setDetail('subs')}/>
        <Metric value={num(s.trials)} label="trial" onClick={()=>setDetail('trials')}/>
        <Metric value={`${num(s.trialConversionPct)}%`} label="конверсія paid"/>
        <Metric value={num(s.canceledSubscriptions)} label="expired/canceled"/>
        <Metric value={num(s.organizations)} label="організацій"/>
        <Metric value={num(s.trainers)} label="тренерів"/>
        <Metric value={num(s.clients)} label="linked клієнтів"/>
        <Metric value={num(s.weighIns)} label="зважувань"/>
      </div>
      <ChartCard title="Дохід · 90 днів" rows={series.revenueDaily||[]} valueKey="cents" moneyValue/>
      <ChartCard title="Дохід · 12 місяців" rows={series.revenueMonthly||[]} valueKey="cents" moneyValue/>
      <Distribution title="Тарифний мікс" rows={(data.planMix||[]).map(x=>({label:x.plan,count:x.count}))}/>
      <Distribution title="Статуси підписок" rows={(data.statusMix||[]).map(x=>({label:x.status,count:x.count}))}/>
      {detail==='payments'&&<Section title="Останні платежі">{payments.slice(0,80).map(p=><Row key={p.id} icon="creditCard" title={p.user_name||p.workspace_name||p.plan_code||'Payment'} subtitle={`${p.plan_code||''} · ${p.status} · ${dt(p.paid_at||p.created_at)}`} value={money(p.amount_cents,p.currency)}/>)}</Section>}
      {filteredSubs&&<Section title={detail==='trials'?'Trial підписки':'Активні підписки'}>{filteredSubs.map(x=><Row key={x.id} icon="creditCard" title={x.plan_metadata?.label||x.plan_code} subtitle={`${x.subject_type} · ${x.status}`} value={date(x.trial_ends_at||x.current_period_end)}/>)}</Section>}
    </>
  }

  if(view==='stats'){
    const athletes=users.filter(u=>!u.is_platform_admin)
    const avg30=s.active30?Math.round(Number(s.workouts30d||0)/Math.max(1,Number(s.active30))):0
    return <>
      <div className="card"><div className="lbl2">Статистика клієнтів</div><div className="big" style={{fontSize:28}}>Прогрес платформи</div><div className="ss">Натисни будь-якого клієнта — відкриється його read-only екран статистики у тому самому стилі, що й у клієнтському VARANGYM.</div></div>
      <div className="grid2">
        <Metric value={num(s.totalWorkouts)} label="тренувань за весь час"/>
        <Metric value={num(s.workouts30d)} label="тренувань / 30д"/>
        <Metric value={num(s.sets30d)} label="підходів / 30д"/>
        <Metric value={num(s.active7)} label="активних / 7д"/>
        <Metric value={num(s.active30)} label="активних / 30д"/>
        <Metric value={num(s.active90)} label="активних / 90д"/>
        <Metric value={num(s.weighIns)} label="записів ваги"/>
        <Metric value={num(s.newUsers30d)} label="нових / 30д"/>
        <Metric value={num(avg30)} label="тренувань / active user"/>
        <Metric value={num(athletes.length)} label="профілів спортсменів"/>
      </div>
      <ChartCard title="Тренування · 90 днів" rows={series.activity||[]} valueKey="workouts"/>
      <ChartCard title="Активні спортсмени · 90 днів" rows={series.activity||[]} valueKey="active_users"/>
      <ChartCard title="Виконані підходи · 90 днів" rows={series.activity||[]} valueKey="completed_sets"/>
      <ChartCard title="Нові профілі · 90 днів" rows={series.signups||[]} valueKey="users"/>
      <div className="grid2">
        <Distribution title="Країни" rows={geo?.byCountry||[]}/>
        <Distribution title="Регіони / області" rows={geo?.byRegion||[]}/>
      </div>
      <Section title="Клієнти · відкрити статистику">{[...athletes].sort((a,b)=>Number(b.workouts_30d||0)-Number(a.workouts_30d||0)).map(u=>{const g=geoMap.get(u.id);return <Row key={u.id} icon="chartLine" iconTint={u.workouts_30d?'var(--acc)':'var(--grey)'} title={u.display_name} subtitle={`${u.workouts_30d||0} тренувань / 30д · ${g?.city||'місто —'}`} value={date(u.last_seen_at)} accessory="chevron" onClick={()=>setClient(u)}/>} )}</Section>
    </>
  }

  return <AdminExerciseStudio workspaces={spaces} users={users}/>
}

function TrainerConsole({view,workspaceId,overview,analytics,invites,reload}) {
  const [client,setClient]=useState(null)
  const clients=overview?.clients||[]
  if(client)return <ClientDetail client={client} workspaceId={workspaceId} onBack={()=>setClient(null)}/>
  const daily=analytics?.daily||[]
  const workouts=daily.reduce((n,x)=>n+Number(x.workouts||0),0)
  const sets=daily.reduce((n,x)=>n+Number(x.completed_sets||0),0)
  const active7=clients.filter(c=>Number(c.workouts_7d||0)>0).length
  if(view==='home')return <>
    <div className="card"><div className="lbl2">VARANGYM · Coach</div><div className="big" style={{fontSize:29}}>Мої клієнти</div><div className="ss">Плани, активність, прогрес і статистика в одному режимі.</div></div>
    <div className="grid2">
      <Metric value={clients.length} label="клієнтів"/><Metric value={active7} label="активні / 7д"/><Metric value={num(workouts)} label="тренувань / 30д"/><Metric value={num(sets)} label="підходів / 30д"/>
      <Metric value={invites.filter(activeInvite).length} label="активних кодів"/><Metric value={clients.filter(c=>c.last_workout_at).length} label="тренувались хоча б раз"/>
    </div>
    <ChartCard title="Активність клієнтів · 30 днів" rows={daily} valueKey="workouts"/>
    <ChartCard title="Підходи · 30 днів" rows={daily} valueKey="completed_sets"/>
    <Section title="Клієнти">{clients.slice(0,10).map(c=><Row key={c.id||c.user_id} icon="personCircle" title={c.display_name} subtitle={`${c.workouts_period||c.workouts_30d||0} тренувань / 30д`} value={date(c.last_workout_at)} accessory="chevron" onClick={()=>setClient(c)}/>)}</Section>
  </>
  if(view==='people')return <><Section title={`Клієнти · ${clients.length}`}>{clients.map(c=><Row key={c.id||c.user_id} icon="personCircle" title={c.display_name} subtitle={c.email||''} value={`${c.workouts_period||c.workouts_30d||0} / 30д`} accessory="chevron" onClick={()=>setClient(c)}/>)}</Section><InviteManager mode="trainer" workspaceId={workspaceId} invites={invites} reload={reload}/></>
  if(view==='dashboard')return <PlanManagerPro mode="trainer" workspaceId={workspaceId} clients={clients}/>
  if(view==='stats')return <>
    <div className="grid2"><Metric value={clients.length} label="клієнтів"/><Metric value={active7} label="активні / 7д"/><Metric value={num(workouts)} label="тренувань / 30д"/><Metric value={num(sets)} label="підходів / 30д"/><Metric value={clients.filter(c=>Number(c.workouts_30d||c.workouts_period||0)>=8).length} label="8+ тренувань / 30д"/><Metric value={clients.filter(c=>!c.last_workout_at).length} label="без тренувань"/></div>
    <ChartCard title="Тренування клієнтів" rows={daily} valueKey="workouts"/><ChartCard title="Підходи клієнтів" rows={daily} valueKey="completed_sets"/>
    <Section title="Прогрес клієнтів">{clients.map(c=><Row key={c.id||c.user_id} icon="chartLine" title={c.display_name} subtitle={`${c.workouts_7d||0} тренувань / 7д`} value={date(c.last_workout_at)} accessory="chevron" onClick={()=>setClient(c)}/>)}</Section>
  </>
  return <div className="card"><div className="lbl2">Вправи</div><div className="ss">Відкривай рідну бібліотеку VARANGYM з нижньої вкладки «Вправи».</div></div>
}

function BusinessConsole({view,workspaceId,insights,analytics,invites,reload}) {
  const [client,setClient]=useState(null)
  const trainers=insights?.trainers||[],clients=insights?.clients||[],billing=insights?.billing,subs=insights?.subscriptions||[]
  if(client)return <ClientDetail client={client} workspaceId={workspaceId} onBack={()=>setClient(null)}/>
  const daily=analytics?.daily||[]
  const workouts=daily.reduce((n,x)=>n+Number(x.workouts||0),0)
  const sets=daily.reduce((n,x)=>n+Number(x.completed_sets||0),0)
  const active7=clients.filter(c=>Number(c.workouts_7d||0)>0).length
  if(view==='home')return <>
    <div className="card"><div className="lbl2">VARANGYM · Business</div><div className="big" style={{fontSize:29}}>{insights?.workspace?.name||'Організація'}</div><div className="ss">Команда, клієнти, тариф, дохід і активність.</div></div>
    <div className="grid2">
      <Metric value={trainers.length} label="тренерів"/><Metric value={clients.length} label="клієнтів"/><Metric value={active7} label="активні / 7д"/><Metric value={num(workouts)} label="тренувань / 30д"/>
      <Metric value={billing?.plan_metadata?.label||billing?.plan_code||'—'} label="поточний план"/><Metric value={subs[0]?.status||'—'} label="статус підписки"/><Metric value={money(insights?.revenue?.month_cents)} label="дохід / місяць"/><Metric value={money(insights?.revenue?.lifetime_cents)} label="дохід за весь час"/>
    </div>
    <ChartCard title="Активність організації" rows={daily} valueKey="workouts"/><ChartCard title="Підходи організації" rows={daily} valueKey="completed_sets"/>
  </>
  if(view==='people')return <><Section title={`Тренери · ${trainers.length}`}>{trainers.map(t=><Row key={t.id} icon="personCircle" title={t.display_name} subtitle={t.email||''} value={`${t.clients||0} клієнтів`}/>)}</Section><Section title={`Клієнти · ${clients.length}`}>{clients.map(c=><Row key={c.id} icon="personCircle" title={c.display_name} subtitle={c.email||''} value={`${c.workouts_30d||0} / 30д`} accessory="chevron" onClick={()=>setClient(c)}/>)}</Section><InviteManager mode="business" workspaceId={workspaceId} invites={invites} reload={reload}/></>
  if(view==='dashboard')return <><div className="grid2"><Metric value={billing?.plan_metadata?.label||billing?.plan_code||'—'} label="тариф"/><Metric value={subs[0]?.status||'—'} label="статус"/><Metric value={date(subs[0]?.trial_ends_at||subs[0]?.current_period_end)} label="наступна дата"/><Metric value={money(insights?.revenue?.lifetime_cents)} label="дохід за весь час"/></div><PlanManagerPro mode="business" workspaceId={workspaceId} clients={clients}/></>
  if(view==='stats')return <>
    <div className="grid2"><Metric value={clients.length} label="клієнтів"/><Metric value={trainers.length} label="тренерів"/><Metric value={active7} label="активні / 7д"/><Metric value={num(workouts)} label="тренувань / 30д"/><Metric value={num(sets)} label="підходів / 30д"/><Metric value={money(insights?.revenue?.month_cents)} label="дохід / місяць"/></div>
    <ChartCard title="Тренування організації" rows={daily} valueKey="workouts"/><ChartCard title="Підходи організації" rows={daily} valueKey="completed_sets"/>
    <Section title="Клієнти · прогрес">{clients.map(c=><Row key={c.id} icon="chartLine" title={c.display_name} subtitle={`${c.workouts_30d||0} тренувань / 30д`} value={date(c.last_workout_at)} accessory="chevron" onClick={()=>setClient(c)}/>)}</Section>
  </>
  return <div className="card"><div className="lbl2">Вправи</div><div className="ss">Відкривай рідну бібліотеку VARANGYM з нижньої вкладки «Вправи».</div></div>
}

export default function RoleConsole({mode}) {
  const nav=useNavigate(),loc=useLocation()
  const view=viewOf(loc.search)
  const [identity,setIdentity]=useState(null)
  const [data,setData]=useState(null)
  const [analytics,setAnalytics]=useState(null)
  const [geo,setGeo]=useState(null)
  const [invites,setInvites]=useState([])
  const [err,setErr]=useState('')
  const [loading,setLoading]=useState(true)
  const [workspaceId,setWorkspaceId]=useState('')

  const access=useMemo(()=>platformAccess(identity),[identity])
  const tSpaces=useMemo(()=>trainerMemberships(identity),[identity])
  const bSpaces=useMemo(()=>businessMemberships(identity),[identity])
  const spaces=mode==='business'?bSpaces:tSpaces

  useEffect(()=>{
    setRoleMode(mode)
    loadPlatformIdentity().then(me=>{
      setIdentity(me)
      const ss=mode==='business'?businessMemberships(me):trainerMemberships(me)
      setWorkspaceId(v=>v||ss[0]?.workspace_id||'')
    }).catch(e=>setErr(e.message))
  },[mode])

  const allowed=identity&&((mode==='admin'&&access.platformAdmin)||(mode==='business'&&access.business)||(mode==='trainer'&&access.trainer))
  const load=async()=>{
    if(!identity||!allowed)return
    setLoading(true);setErr('')
    try{
      if(mode==='admin'){
        const [i,a,c,g]=await Promise.allSettled([api('/api/insights/admin'),api('/api/analytics/admin?days=90'),api('/api/invites'),api('/api/geo/admin')])
        if(i.status!=='fulfilled')throw i.reason
        setData(i.value)
        if(a.status==='fulfilled')setAnalytics(a.value)
        if(c.status==='fulfilled')setInvites(c.value.invites||[])
        if(g.status==='fulfilled')setGeo(g.value)
      }else if(mode==='business'){
        if(!workspaceId)throw new Error('Немає business workspace')
        const [i,a,c]=await Promise.all([
          api(`/api/insights/workspace?workspaceId=${encodeURIComponent(workspaceId)}`),
          api(`/api/analytics/business?days=30&workspaceId=${encodeURIComponent(workspaceId)}`),
          api(`/api/invites?workspaceId=${encodeURIComponent(workspaceId)}`)
        ])
        setData(i);setAnalytics(a);setInvites(c.invites||[])
      }else{
        if(!workspaceId)throw new Error('Немає workspace тренера')
        const [o,a,c]=await Promise.all([
          api(`/api/coach/clients?workspaceId=${encodeURIComponent(workspaceId)}`),
          api(`/api/analytics/coach?days=30&workspaceId=${encodeURIComponent(workspaceId)}`),
          api(`/api/invites?workspaceId=${encodeURIComponent(workspaceId)}`)
        ])
        setData(o);setAnalytics(a);setInvites(c.invites||[])
      }
    }catch(e){setErr(e.message||'Помилка')}
    finally{setLoading(false)}
  }
  useEffect(()=>{if(allowed)load()},[allowed,workspaceId,mode])
  if(identity&&!allowed){nav('/home',{replace:true});return null}
  const label=mode==='admin'?'Адмін':mode==='business'?'Бізнес':'Тренер'

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={()=>{setRoleMode(null);nav('/home')}} aria-label="Клієнтський режим"><Icon name="chevronLeft"/></button>
      <div style={{flex:1,marginLeft:10}}><h1>{label}</h1><div className="sub">{identity?.user?.display_name||''} · VARANGYM</div></div>
      <button className="iconbtn" onClick={load} aria-label="Оновити"><Icon name="reset"/></button>
    </div>
    {spaces.length>1&&<div className="card" style={{padding:8}}><select className="field" value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}>{spaces.map(x=><option key={`${x.workspace_id}:${x.role}`} value={x.workspace_id}>{x.workspace_name} · {x.role}</option>)}</select></div>}
    {loading&&!data?<div className="empty">Завантаження…</div>:err?<ErrorBox text={err} retry={load}/>:mode==='admin'
      ? <AdminConsole view={view} data={data} geo={geo} analytics={analytics} invites={invites} reload={load}/>
      : mode==='business'
        ? <BusinessConsole view={view} workspaceId={workspaceId} insights={data} analytics={analytics} invites={invites} reload={load}/>
        : <TrainerConsole view={view} workspaceId={workspaceId} overview={data} analytics={analytics} invites={invites} reload={load}/>}
  </div>
}
