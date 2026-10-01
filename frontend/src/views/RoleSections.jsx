import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { businessMemberships, loadPlatformIdentity, trainerMemberships } from '../lib/platform-role.js'
import { roleRoute, viewOf } from '../lib/role-mode.js'
import { dateLocale, t, useLang } from '../lib/i18n.js'
import { productText as p } from '../lib/product-copy.js'
import { useUI } from '../store/useUI.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Row, Section } from '../components/ui.jsx'
import SubscriptionPanel from '../components/SubscriptionPanel.jsx'
import PlanManagerPro from '../components/PlanManagerPro.jsx'
import RoleConsole from './RoleConsole.jsx'

const date=v=>{if(!v)return'—';try{return new Date(v).toLocaleDateString(dateLocale())}catch{return'—'}}
const activeInvite=i=>!i.revoked_at&&Number(i.use_count||0)<Number(i.max_uses||1)&&new Date(i.expires_at).getTime()>Date.now()
const needsWorkspace=role=>['client','trainer','organization_admin'].includes(role)

function Loading(){return <div className="empty">{t('Loading…')}</div>}
function Failure({text,retry}){return <div className="card"><div className="ttl">{t('Could not load')}</div><div className="ss" style={{margin:'6px 0 12px'}}>{text||t('Error')}</div><Button onClick={retry}>{t('Retry')}</Button></div>}
function HeaderCard({kicker,title,subtitle,tag}){return <div className="card"><div className="row between" style={{alignItems:'flex-start',gap:12}}><div><div className="lbl2">{kicker}</div><div className="big" style={{fontSize:27}}>{title}</div>{subtitle&&<div className="ss">{subtitle}</div>}</div>{tag&&<span className="tag acc">{tag}</span>}</div></div>}

function InviteCenter({mode}){
  useLang()
  const toast=useUI(s=>s.toast)
  const [identity,setIdentity]=useState(null),[spaces,setSpaces]=useState([]),[workspaceId,setWorkspaceId]=useState(''),[invites,setInvites]=useState([])
  const [role,setRole]=useState(mode==='admin'?'solo_client':'client'),[email,setEmail]=useState(''),[name,setName]=useState(''),[days,setDays]=useState(7),[uses,setUses]=useState(1),[last,setLast]=useState(null)
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[err,setErr]=useState('')
  const roleOptions=mode==='admin'
    ? [['solo_client',t('Solo client')],['independent_trainer',t('Independent trainer')],['organization_owner',t('Business owner')],['platform_admin',t('Platform admin')],['client',t('Client')],['trainer',t('Trainer')],['organization_admin',t('Organization admin')]]
    : mode==='business'
      ? [['client',t('Client')],['trainer',t('Trainer')],['organization_admin',t('Organization admin')]]
      : [['client',t('Client')]]

  const load=async()=>{
    setLoading(true);setErr('')
    try{
      const me=await loadPlatformIdentity();setIdentity(me)
      let memberships=[]
      if(mode==='admin'){
        const admin=await api('/api/insights/admin')
        const ws=admin.workspaces||[];setSpaces(ws)
        const i=await api('/api/invites');setInvites(i.invites||[])
        if(!workspaceId&&ws[0]?.id)setWorkspaceId(ws[0].id)
      }else{
        memberships=mode==='business'?businessMemberships(me):trainerMemberships(me)
        const uniq=[];const seen=new Set()
        for(const m of memberships){if(!seen.has(m.workspace_id)){seen.add(m.workspace_id);uniq.push({id:m.workspace_id,name:m.workspace_name,type:m.workspace_type,role:m.role})}}
        setSpaces(uniq)
        const ws=workspaceId||uniq[0]?.id||'';if(ws&&!workspaceId)setWorkspaceId(ws)
        if(ws){const i=await api(`/api/invites?workspaceId=${encodeURIComponent(ws)}`);setInvites(i.invites||[])}else setInvites([])
      }
    }catch(e){setErr(e.message||t('Error'))}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[mode,workspaceId])

  const copy=text=>navigator.clipboard?.writeText(text).then(()=>toast(t('Copied'))).catch(()=>toast(text))
  const create=async()=>{
    const ws=needsWorkspace(role)?workspaceId:null
    if(needsWorkspace(role)&&!ws)return toast(t('Choose a workspace'))
    setBusy(true)
    try{
      const d=await api('/api/invites',{method:'POST',body:JSON.stringify({targetRole:role,workspaceId:ws,email:email.trim()||null,maxUses:Math.max(1,Number(uses)||1),expiresInDays:Math.max(1,Number(days)||7),metadata:{workspaceName:name.trim()||undefined,organizationName:name.trim()||undefined}})})
      const url=`${location.origin}/?invite=${encodeURIComponent(d.code)}`;setLast({code:d.code,url});toast(t('Code created'));setEmail('');await load()
    }catch(e){toast(e.message||t('Could not create code'))}
    finally{setBusy(false)}
  }
  const revoke=i=>confirmSheet({title:t('Revoke code?'),message:t('New registrations with this code will stop working. Existing accounts are not changed.'),confirmText:t('Revoke'),danger:true,onConfirm:async()=>{try{await api('/api/invites/revoke',{method:'POST',body:JSON.stringify({id:i.id})});toast(t('Code revoked'));await load()}catch(e){toast(e.message||t('Error'))}}})

  if(loading&&!identity)return <Loading/>
  if(err&&!identity)return <Failure text={err} retry={load}/>
  const headerTitle=mode==='admin'?t('Platform invites'):mode==='business'?t('Team access'):t('Client codes')
  return <>
    <HeaderCard kicker="VARANGYM Access" title={headerTitle} tag={`${invites.filter(activeInvite).length} ${String(p('active')).toLocaleLowerCase()}`}/>
    {spaces.length>1&&<div className="card"><div className="lbl2">Workspace</div><select className="field" style={{marginTop:8}} value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}>{spaces.map(w=><option key={w.id} value={w.id}>{w.name||'Workspace'} · {w.type||w.role||''}</option>)}</select></div>}
    <div className="card">
      <div className="lbl2">{t('New code')}</div>
      <div style={{display:'grid',gap:9,marginTop:10}}>
        <select className="field" value={role} onChange={e=>setRole(e.target.value)}>{roleOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        {mode==='admin'&&needsWorkspace(role)&&<select className="field" value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}><option value="">Workspace…</option>{spaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>}
        {(role==='independent_trainer'||role==='organization_owner')&&<input className="field" value={name} onChange={e=>setName(e.target.value)} placeholder={t('Coach / Business workspace name')}/>} 
        <input className="field" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder={`${t('Email')} (${t('optional')})`}/>
        <div className="grid2"><label className="small muted">{t('Days')}<input className="field" type="number" min="1" max="365" value={days} onChange={e=>setDays(e.target.value)}/></label><label className="small muted">{t('Uses')}<input className="field" type="number" min="1" max="500" value={uses} onChange={e=>setUses(e.target.value)}/></label></div>
        <Button variant="primary" disabled={busy} onClick={create}>{busy?t('Creating…'):t('Create code')}</Button>
      </div>
    </div>
    {last&&<div className="card"><div className="lbl2">{t('Last created')}</div><button className="vg-code-value" onClick={()=>copy(last.code)}>{last.code}</button><div className="grid2"><Button onClick={()=>copy(last.code)}>{t('Copy code')}</Button><Button onClick={()=>copy(last.url)}>{t('Copy link')}</Button></div></div>}
    <Section title={`${t('Codes')} · ${invites.length}`}>{invites.length?invites.map(i=>{const active=activeInvite(i);return <Row key={i.id} icon="key" iconTint={active?'var(--acc)':'var(--grey)'} title={i.code||i.target_role} subtitle={`${i.target_role} · ${i.use_count||0}/${i.max_uses||1} · ${date(i.expires_at)}`} value={active?p('active'):i.revoked_at?t('Revoked'):t('Closed')}>{<div className="row" style={{gap:4}}>{i.code&&<button className="iconbtn" onClick={()=>copy(i.code)} aria-label={t('Copy')}><Icon name="clipboard"/></button>}{active&&<button className="iconbtn" style={{color:'var(--red)'}} onClick={()=>revoke(i)} aria-label={t('Revoke')}><Icon name="trash"/></button>}</div>}</Row>}):<Row title={t('No codes yet')}/>}</Section>
  </>
}

function AdminDirectory({kind}){
  useLang()
  const nav=useNavigate(),[data,setData]=useState(null),[geo,setGeo]=useState(null),[err,setErr]=useState(''),[q,setQ]=useState('')
  const load=async()=>{setErr('');try{const [a,g]=await Promise.allSettled([api('/api/insights/admin'),api('/api/geo/admin')]);if(a.status!=='fulfilled')throw a.reason;setData(a.value);setGeo(g.status==='fulfilled'?g.value:null)}catch(e){setErr(e.message||t('Error'))}}
  useEffect(()=>{load()},[kind])
  if(!data&&!err)return <Loading/>
  if(err&&!data)return <Failure text={err} retry={load}/>
  const users=data?.users||[],spaces=data?.workspaces||[],needle=q.trim().toLowerCase()
  if(kind==='businesses'){
    const rows=spaces.filter(w=>w.type==='organization').filter(w=>!needle||`${w.name} ${w.status}`.toLowerCase().includes(needle))
    return <><HeaderCard kicker="Platform Admin" title={t('Businesses')} tag={`${rows.length}`}/><div className="card"><input className="field" placeholder={t('Search organizations…')} value={q} onChange={e=>setQ(e.target.value)}/></div><Section title={`${t('Organizations')} · ${rows.length}`}>{rows.map(w=><Row key={w.id} icon="personCircle" iconTint={w.status==='active'?'var(--acc)':'var(--grey)'} title={w.name} subtitle={`${w.members||0} ${t('members')} · ${w.trainers||0} ${p('trainers')} · ${w.clients||0} ${p('clients')}`} value={w.status}/>)}</Section></>
  }
  const independent=users.filter(u=>u.workspace?.type==='independent_trainer'||String(u.plan_code||'').startsWith('coach_'))
  const orgs=spaces.filter(w=>w.type==='organization'&&Number(w.trainers||0)>0)
  const gmap=new Map((geo?.users||[]).map(x=>[x.id,x]))
  const rows=independent.filter(u=>!needle||`${u.display_name} ${u.email||''} ${u.plan_code||''} ${gmap.get(u.id)?.city||''}`.toLowerCase().includes(needle))
  return <><HeaderCard kicker="Platform Admin" title={t('Trainers')} tag={`${rows.length} Coach`}/><div className="card"><input className="field" placeholder={t('Search name, email, plan or city…')} value={q} onChange={e=>setQ(e.target.value)}/></div><Section title={`Coach · ${rows.length}`}>{rows.map(u=><Row key={u.id} icon="personCircle" iconTint={u.status==='active'?'var(--acc)':'var(--red)'} title={u.display_name} subtitle={`${u.email||t('No email')} · ${u.plan_code||p('noPlan')} · ${gmap.get(u.id)?.city||'—'}`} value={`${u.workouts_30d||0} / 30d`} accessory="chevron" onClick={()=>nav(roleRoute('admin','people'))}/>)}</Section><Section title={t('Trainers in Business')}>{orgs.length?orgs.map(w=><Row key={w.id} icon="chartLine" title={w.name} subtitle={`${w.clients||0} ${p('clients')}`} value={`${w.trainers||0} ${p('trainers')}`}/>):<Row title={t('No Business workspaces with trainers yet')}/>}</Section></>
}

function BusinessDirectory({kind}){
  useLang()
  const nav=useNavigate(),[identity,setIdentity]=useState(null),[workspaceId,setWorkspaceId]=useState(''),[spaces,setSpaces]=useState([]),[data,setData]=useState(null),[err,setErr]=useState('')
  const loadIdentity=async()=>{try{const me=await loadPlatformIdentity();setIdentity(me);const ms=businessMemberships(me),uniq=[];const seen=new Set();for(const m of ms){if(!seen.has(m.workspace_id)){seen.add(m.workspace_id);uniq.push({id:m.workspace_id,name:m.workspace_name,role:m.role})}}setSpaces(uniq);setWorkspaceId(v=>v||uniq[0]?.id||'')}catch(e){setErr(e.message||t('Error'))}}
  const loadWorkspace=async()=>{if(!workspaceId)return;setData(null);setErr('');try{setData(await api(`/api/insights/workspace?workspaceId=${encodeURIComponent(workspaceId)}`))}catch(e){setErr(e.message||t('Error'))}}
  useEffect(()=>{loadIdentity()},[])
  useEffect(()=>{loadWorkspace()},[workspaceId,kind])
  if(!identity||(!data&&!err))return <Loading/>
  if(err&&!data)return <Failure text={err} retry={loadWorkspace}/>
  const trainers=data?.trainers||[],clients=data?.clients||[]
  return <><HeaderCard kicker="VARANGYM Business" title={kind==='trainers'?t('Trainers'):t('Clients')} tag={kind==='trainers'?`${trainers.length}`:`${clients.length}`}/>{spaces.length>1&&<div className="card"><select className="field" value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}>{spaces.map(w=><option key={w.id} value={w.id}>{w.name} · {w.role}</option>)}</select></div>}{kind==='trainers'?<Section title={`${t('Trainers')} · ${trainers.length}`}>{trainers.length?trainers.map(tn=><Row key={tn.id} icon="personCircle" iconTint="var(--acc)" title={tn.display_name} subtitle={`${tn.email||t('No email')} · ${t('Last seen')} ${date(tn.last_seen_at)}`} value={`${tn.clients||0} ${p('clients')}`}/>):<Row title={t('No trainers yet')}/>}</Section>:<><Section title={`${t('Clients')} · ${clients.length}`}>{clients.length?clients.map(c=><Row key={c.id} icon="personCircle" iconTint={Number(c.workouts_30d||0)>0?'var(--acc)':'var(--grey)'} title={c.display_name} subtitle={c.email||t('No email')} value={`${c.workouts_30d||0} / 30d`} accessory="chevron" onClick={()=>nav(roleRoute('business','people'))}/>):<Row title={t('No clients yet')}/>}</Section><Button onClick={()=>nav(roleRoute('business','people'))}>{t('Open client manager')}</Button></>}</>
}

function BusinessPlans(){
  useLang()
  const [identity,setIdentity]=useState(null),[workspaceId,setWorkspaceId]=useState(''),[spaces,setSpaces]=useState([]),[data,setData]=useState(null),[err,setErr]=useState('')
  useEffect(()=>{loadPlatformIdentity().then(me=>{setIdentity(me);const ms=businessMemberships(me),uniq=[];const seen=new Set();for(const m of ms){if(!seen.has(m.workspace_id)){seen.add(m.workspace_id);uniq.push({id:m.workspace_id,name:m.workspace_name,role:m.role})}}setSpaces(uniq);setWorkspaceId(uniq[0]?.id||'')}).catch(e=>setErr(e.message||t('Error')))},[])
  useEffect(()=>{if(workspaceId)api(`/api/insights/workspace?workspaceId=${encodeURIComponent(workspaceId)}`).then(setData).catch(e=>setErr(e.message||t('Error')))},[workspaceId])
  if(!identity||(!data&&!err))return <Loading/>
  if(err&&!data)return <Failure text={err} retry={()=>location.reload()}/>
  return <><HeaderCard kicker="VARANGYM Business" title={t('Client plans')} tag={`${data?.clients?.length||0} ${p('clients')}`}/>{spaces.length>1&&<div className="card"><select className="field" value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}>{spaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>}<PlanManagerPro mode="business" workspaceId={workspaceId} clients={data?.clients||[]}/></>
}

export default function RoleSections({mode}){
  useLang()
  const loc=useLocation(),view=viewOf(loc.search)
  if(mode==='admin'&&view==='trainers')return <div className="narrow"><AdminDirectory kind="trainers"/></div>
  if(mode==='admin'&&view==='businesses')return <div className="narrow"><AdminDirectory kind="businesses"/></div>
  if(mode==='admin'&&view==='invites')return <div className="narrow"><InviteCenter mode="admin"/></div>
  if(mode==='business'&&view==='business-trainers')return <div className="narrow"><BusinessDirectory kind="trainers"/></div>
  if(mode==='business'&&view==='business-clients')return <div className="narrow"><BusinessDirectory kind="clients"/></div>
  if(mode==='business'&&view==='business-codes')return <div className="narrow"><InviteCenter mode="business"/></div>
  if(mode==='business'&&view==='business-plans')return <div className="narrow"><BusinessPlans/></div>
  if(mode==='business'&&view==='business-payments')return <div className="narrow"><HeaderCard kicker="VARANGYM Business" title={p('subscriptionTitle')} subtitle={p('subscriptionSub')}/><SubscriptionPanel/></div>
  if(mode==='trainer'&&view==='trainer-codes')return <div className="narrow"><InviteCenter mode="trainer"/></div>
  return <RoleConsole mode={mode}/>
}