import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { loadPlatformIdentity, platformAccess, trainerMemberships, businessMemberships } from '../lib/platform-role.js'
import { setRoleMode, viewOf } from '../lib/role-mode.js'
import { dateLocale, t, useLang } from '../lib/i18n.js'
import { useUI } from '../store/useUI.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import LineChart from '../components/LineChart.jsx'
import { Button, Row, Section, Segmented } from '../components/ui.jsx'
import ManagedClientStats from '../components/ManagedClientStats.jsx'
import PlanManagerPro from '../components/PlanManagerPro.jsx'
import AdminExerciseStudio from '../components/AdminExerciseStudio.jsx'

const money=(cents,currency='USD')=>new Intl.NumberFormat(dateLocale(),{style:'currency',currency,maximumFractionDigits:2}).format(Number(cents||0)/100)
const num=v=>new Intl.NumberFormat(dateLocale()).format(Number(v||0))
const date=v=>{if(!v)return'—';try{return new Date(v).toLocaleDateString(dateLocale())}catch{return'—'}}
const dt=v=>{if(!v)return'—';try{return new Date(v).toLocaleString(dateLocale())}catch{return'—'}}
const ts=v=>{const x=String(v||'');const d=x.length===7?`${x}-01`:x;const n=new Date(d).getTime();return Number.isFinite(n)?n:Date.now()}
const activeInvite=i=>!i.revoked_at&&Number(i.use_count||0)<Number(i.max_uses||1)&&new Date(i.expires_at).getTime()>Date.now()
const countLabel=(n,singular,plural=singular)=>`${num(n)} ${t(Number(n)===1?singular:plural)}`

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
function Distribution({title,rows=[],labelKey='label',valueKey='count',valueFormat=num,scroll=false}) {
  const max=Math.max(1,...rows.map(x=>Number(x[valueKey]||0)))
  const body=rows.length?rows.slice(0,20).map((r,i)=><div className="mrow" key={`${r[labelKey]}:${i}`}>
    <span className="nm">{r[labelKey]||'—'}</span>
    <span className="bar"><i style={{width:`${Math.max(2,Math.round(Number(r[valueKey]||0)/max*100))}%`}}/></span>
    <span className="v">{valueFormat(r[valueKey]||0)}</span>
  </div>):<div className="small muted">{t('No data')}</div>
  return <div className="card"><div className="lbl2" style={{marginBottom:10}}>{title}</div><div className={scroll?'vg-geo-scroll':''}>{body}</div></div>
}
function GeoBreakdown({geo}){
  const [tab,setTab]=useState('country')
  const rows=tab==='country'?(geo?.byCountry||[]):(geo?.byRegion||[])
  return <div className="vg-geo-stack">
    <div className="card">
      <div className="vg-geo-tabs"><button className={tab==='country'?'on':''} onClick={()=>setTab('country')}>{t('Countries')}</button><button className={tab==='region'?'on':''} onClick={()=>setTab('region')}>{t('Regions')}</button></div>
      <div className="vg-geo-scroll">
        {rows.length?<DistributionRows rows={rows}/>:<div className="small muted">{t('No data')}</div>}
      </div>
    </div>
  </div>
}
function DistributionRows({rows=[]}){
  const max=Math.max(1,...rows.map(x=>Number(x.count||0)))
  return rows.slice(0,24).map((r,i)=><div className="mrow" key={`${r.label}:${i}`}><span className="nm">{r.label||'—'}</span><span className="bar"><i style={{width:`${Math.max(2,Math.round(Number(r.count||0)/max*100))}%`}}/></span><span className="v">{num(r.count||0)}</span></div>)
}
function ErrorBox({text,retry}) {
  return <div className="card"><div className="ttl">{t('Could not load')}</div><div className="ss" style={{margin:'6px 0 12px'}}>{text}</div><Button onClick={retry}>{t('Retry')}</Button></div>
}
function SubscriptionBadge({status,plan}) {
  return <span className={'tag '+(status==='active'||status==='trialing'?'acc':'')}>{plan||t('no plan')}{status?` · ${t(status)}`:''}</span>
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
    ? [['client',t('Client')]]
    : mode==='business'
      ? [['client',t('Client')],['trainer',t('Trainer')],['organization_admin',t('Organization admin')]]
      : [['solo_client','Solo'],['independent_trainer',t('Trainer')],['organization_owner',t('Business')],['client',t('Workspace client')],['trainer',t('Workspace trainer')]]
  const needsWs=['client','trainer','organization_admin'].includes(role)
  const create=async()=>{
    if(needsWs&&!workspace)return toast(t('Choose workspace'))
    setBusy(true)
    try{
      const d=await api('/api/invites',{method:'POST',body:JSON.stringify({targetRole:role,workspaceId:needsWs?workspace:null,email:email.trim()||null,maxUses:1,expiresInDays:7})})
      setLast(d.code);toast(t('Invite code created'));await reload?.()
    }catch(e){toast(e.message||t('Could not create invite code'))}
    finally{setBusy(false)}
  }
  return <div className="card">
    <div className="lbl2">{t('Link code')}</div>
    <div className="ss">{t('Use a code to link a client to a coach or a person to an organization. Trial registration works without a code.')}</div>
    <div style={{display:'grid',gap:9,marginTop:10}}>
      <select className="field" value={role} onChange={e=>setRole(e.target.value)}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
      {needsWs&&mode==='admin'&&<select className="field" value={workspace} onChange={e=>setWorkspace(e.target.value)}><option value="">Workspace…</option>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>}
      <input className="field" type="email" placeholder={t('Email (optional)')} value={email} onChange={e=>setEmail(e.target.value)}/>
      <Button variant="primary" disabled={busy} onClick={create}>{busy?t('Creating…'):t('Create invite code')}</Button>
      {last&&<button className="card" style={{fontSize:24,fontWeight:800,letterSpacing:'.08em'}} onClick={()=>navigator.clipboard?.writeText(last).then(()=>toast(t('Copied')))}>{last}</button>}
    </div>
    <div className="ss" style={{marginTop:10}}>{countLabel(invites.filter(activeInvite).length,'active code','active codes')}</div>
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
    }catch(e){setErr(e.message||t('Error'))}
  }
  useEffect(()=>{setStateData(null);setTab('profile');load()},[id,workspaceId])

  const act=async action=>{
    setBusy(action)
    try{
      await api(`/api/insights/admin/users/${encodeURIComponent(id)}/action`,{method:'POST',body:JSON.stringify({action})})
      toast(t('Done'))
      if(action==='delete'){await onChanged?.();onBack();return}
      await onChanged?.();await load()
    }catch(e){toast(e.message||t('Could not complete action'))}
    finally{setBusy('')}
  }
  const ask=(action,title,message)=>confirmSheet({title,message,confirmText:t('Confirm'),danger:true,onConfirm:()=>act(action)})
  const profile=stateData?.client||client
  const S=stateData?.state||{}
  if(tab==='stats'&&stateData)return <>
    <Button size="sm" onClick={()=>setTab('profile')}>← {t('Profile')}</Button>
    <ManagedClientStats state={S} client={profile}/>
  </>

  return <>
    <Button size="sm" onClick={onBack}>← {t('Back')}</Button>
    <div className="card" style={{marginTop:12}}>
      <div className="row between">
        <div><div className="lbl2">{t('User')}</div><div className="big" style={{fontSize:28}}>{profile.display_name||profile.name||t('Client')}</div><div className="ss">{profile.email||t('no email')}</div></div>
        <SubscriptionBadge plan={client.plan_code} status={client.subscription_status}/>
      </div>
    </div>
    <div className="card" style={{padding:8}}><Segmented value={tab} onChange={setTab} options={[{value:'profile',label:t('Profile')},{value:'stats',label:t('Stats')},...(admin?[{value:'manage',label:t('Manage')}]:[])]}/></div>
    {err&&<ErrorBox text={err} retry={load}/>} 
    {!stateData&&!err&&<div className="empty">{t('Loading…')}</div>}

    {stateData&&tab==='profile'&&<>
      <div className="grid2">
        <Metric value={(S.workouts||[]).length} label={t('total workouts')}/>
        <Metric value={client.workouts_30d||0} label={t('workouts / 30d')}/>
        <Metric value={date(profile.created_at||client.created_at)} label={t('registered')}/>
        <Metric value={t(client.status||profile.status||'active')} label={t('status')}/>
      </div>
      <Section title={t('Account')}>
        <Row title={t('Name')} value={profile.display_name||'—'}/>
        <Row title={t('Email')} value={profile.email||'—'}/>
        <Row title={t('Subscription')} value={<SubscriptionBadge plan={client.plan_code} status={client.subscription_status}/>}/>
        <Row title={t('Trial until')} value={date(client.trial_ends_at)}/>
        <Row title={t('Last sign-in')} value={dt(client.last_seen_at)}/>
        <Row title={t('Last session IP')} value={client.last_ip||location?.ip||'—'}/>
        <Row title={t('Device')} subtitle={client.user_agent||'—'}/>
      </Section>
      <Section title={t('Location by IP')} footer={t('City and region are estimated from the latest public IP address and cached in the database. This is approximate IP geolocation, not GPS.')}>
        <Row icon="globe" title={t('City')} value={location?.city||'—'}/>
        <Row title={t('Region')} value={location?.region||'—'}/>
        <Row title={t('Country')} value={location?.country||'—'}/>
        <Row title={t('Time zone')} value={location?.timezone||'—'}/>
        <Row title={t('Updated')} value={dt(location?.updated_at)}/>
      </Section>
      <Button variant="primary" onClick={()=>setTab('stats')}>{t('Open full client statistics')}</Button>
    </>}

    {stateData&&admin&&tab==='manage'&&<>
      <Section title={t('Access & sessions')}>
        {client.status==='disabled'
          ? <Row icon="shield" iconTint="var(--acc)" title={t('Enable account')} accessory="chevron" onClick={()=>act('enable')}/>
          : <Row icon="shield" iconTint="var(--orange)" title={t('Revoke access')} subtitle={t('Disable the account and end its sessions')} accessory="chevron" onClick={()=>ask('revoke_access',t('Revoke access?'),t('The user will not be able to sign in until an admin restores access.'))}/>} 
        <Row icon="signOut" iconTint="var(--orange)" title={t('Sign out on all devices')} accessory="chevron" onClick={()=>ask('revoke_sessions',t('End all sessions?'),t('The user will need to sign in again on every device.'))}/>
      </Section>
      <Section title={t('Block list')}>
        <Row icon="shield" iconTint="var(--red)" title={t('Ban email')} subtitle={client.email||t('Email unavailable')} accessory="chevron" onClick={()=>client.email&&ask('ban_email',t('Ban email?'),t('New accounts will not be allowed to register with this address.'))}/>
        <Row icon="shield" iconTint="var(--red)" title={t('Ban IP')} subtitle={client.last_ip||location?.ip||t('IP unavailable')} accessory="chevron" onClick={()=>ask('ban_ip',t('Ban IP?'),t('New sessions from the latest IP address will be blocked.'))}/>
        <Row icon="reset" title={t('Remove bans')} accessory="chevron" onClick={()=>act('unban')}/>
      </Section>
      <Section title={t('Danger zone')}>
        <Row icon="trash" iconTint="var(--red)" danger title={t('Delete user')} subtitle={t('Account, progress, relationships and stored data will be deleted')} accessory="chevron" onClick={()=>ask('delete',t('Delete account?'),t('This action cannot be undone.'))}/>
      </Section>
      {busy&&<div className="small muted">{t('Working')}: {busy}…</div>}
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
      <div className="row between"><div><div className="lbl2">VARANGYM · Admin</div><div className="big" style={{fontSize:31}}>{t('Platform')}</div><div className="ss">{t('Users, product activity and revenue in one live overview.')}</div></div><div style={{textAlign:'right'}}><div className="big" style={{fontSize:25,color:'var(--acc)'}}>{money(s.mrrCents)}</div><div className="small dim">MRR</div></div></div>
    </div>
    <div className="grid2">
      <Metric icon="personCircle" value={num(s.users)} label={t('users')} note={`+${num(s.newUsers30d)} / 30d`}/>
      <Metric value={num(s.active7)} label={t('active / 7d')} note={`${num(s.active30)} / 30d`}/>
      <Metric value={num(s.active90)} label={t('active / 90d')}/>
      <Metric value={num(s.workouts30d)} label={t('workouts / 30d')}/>
      <Metric value={num(s.sets30d)} label={t('sets / 30d')}/>
      <Metric value={money(s.mrrCents)} label="MRR"/>
      <Metric value={money(s.monthRevenueCents)} label={t('revenue / month')}/>
      <Metric value={money(s.lifetimeRevenueCents)} label={t('lifetime revenue')}/>
      <Metric value={num(s.activeSubscriptions)} label={t('paid subscriptions')}/>
      <Metric value={num(s.trials)} label={t('trials')}/>
      <Metric value={num(s.organizations)} label={t('organizations')}/>
      <Metric value={num(geo?.known||0)} label={t('geolocated')} note={`${num(geo?.total||0)} ${t('accounts')}`}/>
    </div>
    <ChartCard title={t('Workouts · 90 days')} subtitle={t('Daily activity')} rows={series.activity||[]} valueKey="workouts"/>
    <ChartCard title={t('Active users · 90 days')} rows={series.activity||[]} valueKey="active_users"/>
    <ChartCard title={t('New users · 90 days')} rows={series.signups||[]} valueKey="users"/>
    <Distribution title={t('Top cities by IP')} rows={geo?.byCity||[]} scroll/>
    <Section title={t('Recent users')}>{users.slice(0,8).map(u=><Row key={u.id} icon="personCircle" iconTint={u.status==='disabled'?'var(--red)':'var(--acc)'} title={u.display_name} subtitle={`${u.plan_code||t('no plan')} · ${geoMap.get(u.id)?.city||t('city unknown')}`} value={date(u.created_at)} accessory="chevron" onClick={()=>setClient(u)}/>)}</Section>
  </>

  if(view==='people'){
    const q=query.trim().toLowerCase()
    const filtered=users.filter(u=>!q||`${u.display_name} ${u.email||''} ${u.plan_code||''} ${geoMap.get(u.id)?.city||''} ${geoMap.get(u.id)?.region||''}`.toLowerCase().includes(q))
    return <>
      <div className="card"><div className="lbl2">{t('Users')}</div><input className="field" style={{marginTop:10}} placeholder={t('Name, email, plan, city, region…')} value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <Section title={`${t('Accounts')} · ${filtered.length}`}>{filtered.map(u=>{const g=geoMap.get(u.id);return <Row key={u.id} icon="personCircle" iconTint={u.status==='disabled'?'var(--red)':u.is_platform_admin?'var(--acc)':'var(--blue)'} title={u.display_name} subtitle={`${u.email||t('no email')} · ${u.plan_code||t('no plan')} · ${g?.city||'—'}, ${g?.region||'—'}`} value={u.workouts_30d?`${u.workouts_30d} / 30d`:t(u.status)} accessory="chevron" onClick={()=>setClient(u)}/>} )}</Section>
      <Section title={`${t('Organizations / workspaces')} · ${spaces.length}`}>{spaces.map(w=><Row key={w.id} icon="personCircle" title={w.name} subtitle={`${w.type} · ${countLabel(w.members,'member','members')}`} value={`${num(w.trainers)} ${t('trainers')} · ${num(w.clients)} ${t('clients')}`}/>)}</Section>
      <InviteManager mode="admin" workspaces={spaces} invites={invites} reload={reload}/>
    </>
  }

  if(view==='dashboard'){
    const subs=data?.subscriptions||[],payments=data?.payments||[]
    const filteredSubs=detail==='trials'?subs.filter(x=>x.status==='trialing'):detail==='subs'?subs.filter(x=>x.status==='active'):null
    return <>
      <div className="card"><div className="lbl2">{t('Financial dashboard')}</div><div className="big" style={{fontSize:28}}>Revenue & subscriptions</div><div className="ss">{t('Every key number opens its underlying data instead of being a static figure.')}</div></div>
      <div className="grid2">
        <Metric value={money(s.mrrCents)} label="MRR" onClick={()=>setDetail('subs')}/>
        <Metric value={money(s.monthRevenueCents)} label={t('revenue / month')} onClick={()=>setDetail('payments')}/>
        <Metric value={money(s.lifetimeRevenueCents)} label={t('lifetime revenue')} onClick={()=>setDetail('payments')}/>
        <Metric value={money(s.arpuCents)} label="ARPU"/>
        <Metric value={num(s.activeSubscriptions)} label={t('paid subscriptions')} onClick={()=>setDetail('subs')}/>
        <Metric value={num(s.trials)} label={t('trials')} onClick={()=>setDetail('trials')}/>
        <Metric value={`${num(s.trialConversionPct)}%`} label={t('paid conversion')}/>
        <Metric value={num(s.canceledSubscriptions)} label={t('expired / canceled')}/>
        <Metric value={num(s.organizations)} label={t('organizations')}/>
        <Metric value={num(s.trainers)} label={t('trainers')}/>
        <Metric value={num(s.clients)} label={t('linked clients')}/>
        <Metric value={num(s.weighIns)} label={t('weigh-ins')}/>
      </div>
      <ChartCard title={t('Revenue · 90 days')} rows={series.revenueDaily||[]} valueKey="cents" moneyValue/>
      <ChartCard title={t('Revenue · 12 months')} rows={series.revenueMonthly||[]} valueKey="cents" moneyValue/>
      <Distribution title={t('Plan mix')} rows={(data.planMix||[]).map(x=>({label:x.plan,count:x.count}))}/>
      <Distribution title={t('Subscription status')} rows={(data.statusMix||[]).map(x=>({label:x.status,count:x.count}))}/>
      {detail==='payments'&&<Section title={t('Recent payments')}>{payments.slice(0,80).map(p=><Row key={p.id} icon="creditCard" title={p.user_name||p.workspace_name||p.plan_code||t('Payment')} subtitle={`${p.plan_code||''} · ${t(p.status)} · ${dt(p.paid_at||p.created_at)}`} value={money(p.amount_cents,p.currency)}/>)}</Section>}
      {filteredSubs&&<Section title={detail==='trials'?t('Trial subscriptions'):t('Active subscriptions')}>{filteredSubs.map(x=><Row key={x.id} icon="creditCard" title={x.plan_metadata?.label||x.plan_code} subtitle={`${x.subject_type} · ${t(x.status)}`} value={date(x.trial_ends_at||x.current_period_end)}/>)}</Section>}
    </>
  }

  if(view==='stats'){
    const athletes=users.filter(u=>!u.is_platform_admin)
    const avg30=s.active30?Math.round(Number(s.workouts30d||0)/Math.max(1,Number(s.active30))):0
    return <>
      <div className="card"><div className="lbl2">{t('Client statistics')}</div><div className="big" style={{fontSize:28}}>{t('Platform progress')}</div><div className="ss">{t('Open any client to see their read-only progress screen in the same visual language as the client app.')}</div></div>
      <div className="grid2">
        <Metric value={num(s.totalWorkouts)} label={t('all-time workouts')}/>
        <Metric value={num(s.workouts30d)} label={t('workouts / 30d')}/>
        <Metric value={num(s.sets30d)} label={t('sets / 30d')}/>
        <Metric value={num(s.active7)} label={t('active / 7d')}/>
        <Metric value={num(s.active30)} label={t('active / 30d')}/>
        <Metric value={num(s.active90)} label={t('active / 90d')}/>
        <Metric value={num(s.weighIns)} label={t('weight entries')}/>
        <Metric value={num(s.newUsers30d)} label={t('new / 30d')}/>
        <Metric value={num(avg30)} label={t('workouts / active user')}/>
        <Metric value={num(athletes.length)} label={t('athlete profiles')}/>
      </div>
      <ChartCard title={t('Workouts · 90 days')} rows={series.activity||[]} valueKey="workouts"/>
      <ChartCard title={t('Active athletes · 90 days')} rows={series.activity||[]} valueKey="active_users"/>
      <ChartCard title={t('Completed sets · 90 days')} rows={series.activity||[]} valueKey="completed_sets"/>
      <ChartCard title={t('New profiles · 90 days')} rows={series.signups||[]} valueKey="users"/>
      <GeoBreakdown geo={geo}/>
      <Section title={t('Clients · open statistics')}>{[...athletes].sort((a,b)=>Number(b.workouts_30d||0)-Number(a.workouts_30d||0)).map(u=>{const g=geoMap.get(u.id);return <Row key={u.id} icon="chartLine" iconTint={u.workouts_30d?'var(--acc)':'var(--grey)'} title={u.display_name} subtitle={`${u.workouts_30d||0} ${t('workouts / 30d')} · ${g?.city||t('city unknown')}`} value={date(u.last_seen_at)} accessory="chevron" onClick={()=>setClient(u)}/>} )}</Section>
    </>
  }

  return <AdminExerciseStudio workspaces={spaces} users={users}/>
}

function TrainerConsole({view,workspaceId,overview,analytics,invites,reload}) {
  const [client,setClient]=useState(null)
  const clients=overview?.clients||analytics?.clients||[]
  if(client)return <ClientDetail client={client} workspaceId={workspaceId} onBack={()=>setClient(null)}/>
  const daily=analytics?.daily||[]
  const top=analytics?.topExercises||[]
  const workouts=daily.reduce((n,x)=>n+Number(x.workouts||0),0)
  const sets=daily.reduce((n,x)=>n+Number(x.sets??x.completed_sets??0),0)
  const active7=clients.filter(c=>Number(c.workouts_7d||0)>0).length
  const active30=clients.filter(c=>Number(c.workouts_period||c.workouts_30d||0)>0).length
  const consistent=clients.filter(c=>Number(c.workouts_period||c.workouts_30d||0)>=8).length
  const never=clients.filter(c=>!c.last_workout_at).length
  const weighed=clients.filter(c=>c.latest_weight!=null).length
  const avg=clients.length?Math.round(workouts/clients.length*10)/10:0
  const activeCodes=invites.filter(activeInvite).length
  const topExercise=top[0]?.name||'—'
  const topRows=top.map(x=>({label:x.name,count:Number(x.completed_sets||x.workouts||0)}))

  if(view==='home')return <>
    <div className="card"><div className="row between"><div><div className="lbl2">VARANGYM · Coach</div><div className="big" style={{fontSize:29}}>{t('My clients')}</div><div className="ss">{t('Programs, activity, progress and analytics in one live dashboard.')}</div></div><span className="tag acc">30d</span></div></div>
    <div className="grid2">
      <Metric value={clients.length} label={t('clients')}/>
      <Metric value={active7} label={t('active / 7d')}/>
      <Metric value={active30} label={t('active / 30d')}/>
      <Metric value={num(workouts)} label={t('workouts / 30d')}/>
      <Metric value={num(sets)} label={t('sets / 30d')}/>
      <Metric value={num(avg)} label={t('workouts / client')}/>
      <Metric value={consistent} label={t('8+ workouts / 30d')}/>
      <Metric value={never} label={t('no workouts yet')}/>
      <Metric value={weighed} label={t('profiles with weight')}/>
      <Metric value={activeCodes} label={t('active codes')}/>
      <Metric value={clients.filter(c=>c.last_workout_at).length} label={t('trained at least once')}/>
      <Metric value={topExercise} label={t('top exercise')}/>
    </div>
    <ChartCard title={t('Client workouts · 30 days')} subtitle={t('Completed workouts by day')} rows={daily} valueKey="workouts"/>
    <ChartCard title={t('Sets · 30 days')} subtitle={t('Completed sets across all clients')} rows={daily} valueKey={daily.some(x=>x.sets!=null)?'sets':'completed_sets'}/>
    <Distribution title={t('Most trained exercises')} rows={topRows}/>
    <Section title={t('Clients')}>{clients.slice(0,10).map(c=><Row key={c.id||c.user_id} icon="personCircle" title={c.display_name} subtitle={`${c.workouts_period||c.workouts_30d||0} ${t('workouts / 30d')}${c.latest_weight!=null?` · ${c.latest_weight} kg`:''}`} value={date(c.last_workout_at)} accessory="chevron" onClick={()=>setClient(c)}/>)}</Section>
  </>
  if(view==='people')return <><Section title={`${t('Clients')} · ${clients.length}`}>{clients.map(c=><Row key={c.id||c.user_id} icon="personCircle" title={c.display_name} subtitle={c.email||''} value={`${c.workouts_period||c.workouts_30d||0} / 30d`} accessory="chevron" onClick={()=>setClient(c)}/>)}</Section><InviteManager mode="trainer" workspaceId={workspaceId} invites={invites} reload={reload}/></>
  if(view==='dashboard')return <PlanManagerPro mode="trainer" workspaceId={workspaceId} clients={clients}/>
  if(view==='stats')return <>
    <div className="card"><div className="lbl2">{t('Client statistics')}</div><div className="big" style={{fontSize:27}}>Coach analytics</div><div className="ss">{t('Live activity, consistency and drill-down into every client.')}</div></div>
    <div className="grid2">
      <Metric value={clients.length} label={t('clients')}/>
      <Metric value={active7} label={t('active / 7d')}/>
      <Metric value={active30} label={t('active / 30d')}/>
      <Metric value={num(workouts)} label={t('workouts / 30d')}/>
      <Metric value={num(sets)} label={t('sets / 30d')}/>
      <Metric value={num(avg)} label={t('workouts / client')}/>
      <Metric value={consistent} label={t('8+ workouts / 30d')}/>
      <Metric value={never} label={t('no workouts')}/>
      <Metric value={weighed} label={t('profiles with weight entries')}/>
      <Metric value={activeCodes} label={t('active codes')}/>
    </div>
    <ChartCard title={t('Client workouts')} rows={daily} valueKey="workouts"/>
    <ChartCard title={t('Client sets')} rows={daily} valueKey={daily.some(x=>x.sets!=null)?'sets':'completed_sets'}/>
    <Distribution title={t('Top exercises by sets')} rows={topRows}/>
    <Section title={t('Client progress')}>{clients.map(c=><Row key={c.id||c.user_id} icon="chartLine" title={c.display_name} subtitle={`${c.workouts_7d||0} / 7d · ${c.workouts_period||c.workouts_30d||0} / 30d`} value={date(c.last_workout_at)} accessory="chevron" onClick={()=>setClient(c)}/>)}</Section>
  </>
  return <div className="card"><div className="lbl2">{t('Exercises')}</div><div className="ss">{t('Open the native VARANGYM exercise library from the Exercises tab.')}</div></div>
}

function BusinessConsole({view,workspaceId,insights,analytics,invites,reload}) {
  const [client,setClient]=useState(null)
  const trainers=insights?.trainers||analytics?.trainers||[],clients=insights?.clients||[],billing=insights?.billing,subs=insights?.subscriptions||[]
  if(client)return <ClientDetail client={client} workspaceId={workspaceId} onBack={()=>setClient(null)}/>
  const daily=analytics?.daily||[]
  const top=analytics?.topExercises||[]
  const workouts=daily.reduce((n,x)=>n+Number(x.workouts||0),0)
  const sets=daily.reduce((n,x)=>n+Number(x.sets??x.completed_sets??0),0)
  const active7=clients.filter(c=>Number(c.workouts_7d||0)>0).length
  const active30=clients.filter(c=>Number(c.workouts_30d||0)>0).length
  const inactive=Math.max(0,clients.length-active30)
  const avg=clients.length?Math.round(workouts/clients.length*10)/10:0
  const covered=trainers.filter(r=>Number(r.clients||0)>0).length
  const activeCodes=invites.filter(activeInvite).length
  const topExercise=top[0]?.name||'—'
  const topRows=top.map(x=>({label:x.name,count:Number(x.completed_sets||x.workouts||0)}))
  const trainerRows=trainers.map(r=>({label:r.display_name,count:Number(r.clients||0)}))
  const periodRevenue=analytics?.revenue?.period_cents??insights?.revenue?.month_cents??0

  if(view==='home')return <>
    <div className="card"><div className="row between"><div><div className="lbl2">VARANGYM · Business</div><div className="big" style={{fontSize:29}}>{insights?.workspace?.name||t('Organization')}</div><div className="ss">{t('Team, clients, plan, revenue and activity in one dashboard.')}</div></div><span className="tag acc">Live</span></div></div>
    <div className="grid2">
      <Metric value={trainers.length} label={t('trainers')}/>
      <Metric value={clients.length} label={t('clients')}/>
      <Metric value={active7} label={t('active / 7d')}/>
      <Metric value={active30} label={t('active / 30d')}/>
      <Metric value={inactive} label={t('inactive / 30d')}/>
      <Metric value={num(workouts)} label={t('workouts / 30d')}/>
      <Metric value={num(sets)} label={t('sets / 30d')}/>
      <Metric value={num(avg)} label={t('workouts / client')}/>
      <Metric value={covered} label={t('trainers with clients')}/>
      <Metric value={activeCodes} label={t('active codes')}/>
      <Metric value={billing?.plan_metadata?.label||billing?.plan_code||'—'} label={t('current plan')}/>
      <Metric value={t(subs[0]?.status||'—')} label={t('subscription status')}/>
      <Metric value={money(periodRevenue)} label={t('revenue / period')}/>
      <Metric value={money(insights?.revenue?.lifetime_cents)} label={t('lifetime revenue')}/>
      <Metric value={topExercise} label={t('top exercise')}/>
    </div>
    <ChartCard title={t('Organization activity · 30 days')} subtitle={t('Workouts across all clients')} rows={daily} valueKey="workouts"/>
    <ChartCard title={t('Organization sets · 30 days')} rows={daily} valueKey={daily.some(x=>x.sets!=null)?'sets':'completed_sets'}/>
    <Distribution title={t('Trainer load · clients')} rows={trainerRows}/>
    <Distribution title={t('Top organization exercises')} rows={topRows}/>
  </>
  if(view==='people')return <><Section title={`${t('Trainers')} · ${trainers.length}`}>{trainers.map(r=><Row key={r.id} icon="personCircle" title={r.display_name} subtitle={r.email||''} value={countLabel(r.clients||0,'client','clients')}/>)}</Section><Section title={`${t('Clients')} · ${clients.length}`}>{clients.map(c=><Row key={c.id} icon="personCircle" title={c.display_name} subtitle={c.email||''} value={`${c.workouts_30d||0} / 30d`} accessory="chevron" onClick={()=>setClient(c)}/>)}</Section><InviteManager mode="business" workspaceId={workspaceId} invites={invites} reload={reload}/></>
  if(view==='dashboard')return <><div className="grid2"><Metric value={billing?.plan_metadata?.label||billing?.plan_code||'—'} label={t('plan')}/><Metric value={t(subs[0]?.status||'—')} label={t('status')}/><Metric value={date(subs[0]?.trial_ends_at||subs[0]?.current_period_end)} label={t('next date')}/><Metric value={money(insights?.revenue?.lifetime_cents)} label={t('lifetime revenue')}/></div><PlanManagerPro mode="business" workspaceId={workspaceId} clients={clients}/></>
  if(view==='stats')return <>
    <div className="card"><div className="lbl2">{t('Organization statistics')}</div><div className="big" style={{fontSize:27}}>Business analytics</div><div className="ss">{t('Client activity, trainer load and financial trends.')}</div></div>
    <div className="grid2">
      <Metric value={clients.length} label={t('clients')}/>
      <Metric value={trainers.length} label={t('trainers')}/>
      <Metric value={active7} label={t('active / 7d')}/>
      <Metric value={active30} label={t('active / 30d')}/>
      <Metric value={inactive} label={t('inactive / 30d')}/>
      <Metric value={num(workouts)} label={t('workouts / 30d')}/>
      <Metric value={num(sets)} label={t('sets / 30d')}/>
      <Metric value={num(avg)} label={t('workouts / client')}/>
      <Metric value={covered} label={t('trainers with clients')}/>
      <Metric value={money(periodRevenue)} label={t('revenue / 30d')}/>
      <Metric value={money(insights?.revenue?.lifetime_cents)} label={t('lifetime revenue')}/>
      <Metric value={activeCodes} label={t('active codes')}/>
    </div>
    <ChartCard title={t('Organization workouts')} rows={daily} valueKey="workouts"/>
    <ChartCard title={t('Organization sets')} rows={daily} valueKey={daily.some(x=>x.sets!=null)?'sets':'completed_sets'}/>
    <Distribution title={t('Trainer load')} rows={trainerRows}/>
    <Distribution title={t('Top exercises')} rows={topRows}/>
    <Section title={t('Clients · progress')}>{clients.map(c=><Row key={c.id} icon="chartLine" title={c.display_name} subtitle={`${c.workouts_30d||0} ${t('workouts / 30d')}`} value={date(c.last_workout_at)} accessory="chevron" onClick={()=>setClient(c)}/>)}</Section>
  </>
  return <div className="card"><div className="lbl2">{t('Exercises')}</div><div className="ss">{t('Open the native VARANGYM exercise library from the Exercises tab.')}</div></div>
}

export default function RoleConsole({mode}) {
  useLang()
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
        setAnalytics(a.status==='fulfilled'?a.value:null)
        setInvites(c.status==='fulfilled'?(c.value.invites||[]):[])
        setGeo(g.status==='fulfilled'?g.value:null)
      }else if(mode==='business'){
        if(!workspaceId)throw new Error(t('No Business workspace'))
        const [i,a,c]=await Promise.allSettled([
          api(`/api/insights/workspace?workspaceId=${encodeURIComponent(workspaceId)}`),
          api(`/api/analytics/business?days=30&workspaceId=${encodeURIComponent(workspaceId)}`),
          api(`/api/invites?workspaceId=${encodeURIComponent(workspaceId)}`)
        ])
        if(i.status!=='fulfilled')throw i.reason
        setData(i.value)
        setAnalytics(a.status==='fulfilled'?a.value:null)
        setInvites(c.status==='fulfilled'?(c.value.invites||[]):[])
      }else{
        if(!workspaceId)throw new Error(t('No Coach workspace'))
        const [o,a,c]=await Promise.allSettled([
          api(`/api/coach/clients?workspaceId=${encodeURIComponent(workspaceId)}`),
          api(`/api/analytics/coach?days=30&workspaceId=${encodeURIComponent(workspaceId)}`),
          api(`/api/invites?workspaceId=${encodeURIComponent(workspaceId)}`)
        ])
        if(o.status!=='fulfilled')throw o.reason
        setData(o.value)
        setAnalytics(a.status==='fulfilled'?a.value:null)
        setInvites(c.status==='fulfilled'?(c.value.invites||[]):[])
      }
    }catch(e){setErr(e.message||t('Error'))}
    finally{setLoading(false)}
  }
  useEffect(()=>{if(allowed)load()},[allowed,workspaceId,mode])
  if(identity&&!allowed){nav('/home',{replace:true});return null}
  const label=mode==='admin'?'Admin':mode==='business'?'Business':'Coach'

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={()=>{setRoleMode(null);nav('/home')}} aria-label={t('Training mode')}><Icon name="chevronLeft"/></button>
      <div style={{flex:1,marginLeft:10}}><h1>{label}</h1><div className="sub">{identity?.user?.display_name||''} · VARANGYM</div></div>
      <button className="iconbtn" onClick={load} aria-label={t('Refresh')}><Icon name="reset"/></button>
    </div>
    {spaces.length>1&&<div className="card" style={{padding:8}}><select className="field" value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}>{spaces.map(x=><option key={`${x.workspace_id}:${x.role}`} value={x.workspace_id}>{x.workspace_name} · {x.role}</option>)}</select></div>}
    {loading&&!data?<div className="empty">{t('Loading…')}</div>:err?<ErrorBox text={err} retry={load}/>:mode==='admin'
      ? <AdminConsole view={view} data={data} geo={geo} analytics={analytics} invites={invites} reload={load}/>
      : mode==='business'
        ? <BusinessConsole view={view} workspaceId={workspaceId} insights={data} analytics={analytics} invites={invites} reload={load}/>
        : <TrainerConsole view={view} workspaceId={workspaceId} overview={data} analytics={analytics} invites={invites} reload={load}/>}
  </div>
}
