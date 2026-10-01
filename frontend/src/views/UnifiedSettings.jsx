import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Settings from './Settings.jsx'
import { Row, Section } from '../components/ui.jsx'
import { useStore } from '../store/useStore.js'
import { api } from '../lib/api.js'
import { dateLocale, t, useLang } from '../lib/i18n.js'
import { productText as p } from '../lib/product-copy.js'
import { loadPlatformIdentity, platformAccess } from '../lib/platform-role.js'
import { getRoleMode, roleRoute, setRoleMode } from '../lib/role-mode.js'
import { confirmSheet } from '../sheets.jsx'

const modeName=m=>m==='admin'?'Admin':m==='business'?'Business':m==='trainer'?'Coach':p('normalMode')
const date=v=>{if(!v)return'';try{return new Date(v).toLocaleDateString(dateLocale())}catch{return''}}

export default function UnifiedSettings(){
  useLang()
  const nav=useNavigate()
  const user=useStore(s=>s.user)
  const signOut=useStore(s=>s.signOut)
  const signOutAll=useStore(s=>s.signOutAll)
  const [identity,setIdentity]=useState(null)
  const [mode,setModeState]=useState(()=>getRoleMode())
  const [subscriptions,setSubscriptions]=useState([])

  useEffect(()=>{
    if(!user)return
    loadPlatformIdentity().then(setIdentity).catch(()=>{})
    api('/api/trial/status').then(d=>setSubscriptions(d.subscriptions||[])).catch(()=>{})
  },[user?.id])
  useEffect(()=>{
    const sync=e=>setModeState(e?.detail??getRoleMode())
    window.addEventListener('varangym-role-mode',sync)
    return()=>window.removeEventListener('varangym-role-mode',sync)
  },[])

  const access=useMemo(()=>platformAccess(identity),[identity])
  const effectiveAccess={platformAdmin:!!(access.platformAdmin||user?.admin),business:!!access.business,trainer:!!access.trainer}
  const primary=useMemo(()=>subscriptions.find(x=>x.status==='trialing')||subscriptions.find(x=>x.status==='active')||subscriptions[0]||null,[subscriptions])
  const switchMode=next=>{setRoleMode(next);setModeState(next||null);nav(next?roleRoute(next,'home'):'/home',{replace:true})}
  const subLabel=primary?.plan_metadata?.label||String(primary?.plan_code||'').replaceAll('_',' ')||p('noPlan')
  const subNote=primary?.status==='trialing'&&primary?.trial_ends_at?p('trialUntil',date(primary.trial_ends_at)):primary?.status==='active'&&primary?.current_period_end?p('paidUntil',date(primary.current_period_end)):primary?.status==='active'?p('active'):p('choosePlan')
  const logout=()=>confirmSheet({title:p('logoutConfirm'),confirmText:p('yesSignOut'),danger:true,onConfirm:()=>{signOut();setRoleMode(null);nav('/home')}})
  const logoutAll=()=>confirmSheet({title:p('logoutAllConfirm'),confirmText:p('yesSignOutAll'),danger:true,onConfirm:async()=>{try{await signOutAll()}finally{setRoleMode(null);nav('/home')}}})

  return <div className="narrow vg-unified-settings">
    <div className="hdr"><div style={{flex:1}}><h1>{p('settings')}</h1><div className="sub">{p('mode')}: {modeName(mode)} · VARANGYM</div></div></div>

    {user&&<Section title={p('account')}>
      <Row icon="personCircle" iconTint="var(--grey)" title={user.name||identity?.user?.display_name||'VARANGYM'} subtitle={mode?p('roleModeActive',modeName(mode)):p('profileMode')} />
      <Row icon="house" iconTint="var(--acc)" title={p('normalMode')} subtitle={t('My workouts, plan, stats and exercises')} accessory={!mode?'check':'chevron'} onClick={()=>switchMode(null)}/>
      {effectiveAccess.platformAdmin&&<Row icon="wrench" iconTint="var(--acc)" title={p('adminPanel')} subtitle={t('Platform, finances, users and exercises')} accessory={mode==='admin'?'check':'chevron'} onClick={()=>switchMode('admin')}/>} 
      {effectiveAccess.business&&<Row icon="personCircle" iconTint="var(--indigo)" title={p('businessPanel')} subtitle={t('Organization, trainers, clients and analytics')} accessory={mode==='business'?'check':'chevron'} onClick={()=>switchMode('business')}/>} 
      {effectiveAccess.trainer&&<Row icon="chartLine" iconTint="var(--blue)" title={p('coachPanel')} subtitle={t('Clients, programs, progress and invites')} accessory={mode==='trainer'?'check':'chevron'} onClick={()=>switchMode('trainer')}/>} 
      <Row title={p('manageSubscription')} subtitle={`${subLabel} · ${subNote}`} accessory="chevron" onClick={()=>nav('/subscription')}/>
      <Row icon="signOut" iconTint="var(--red)" title={p('signOut')} danger onClick={logout}/>
      <Row icon="shield" iconTint="var(--red)" title={p('signOutAll')} subtitle={t('Ends this profile’s sessions on all your devices.')} danger onClick={logoutAll}/>
    </Section>}

    <div className="vg-settings-legacy"><Settings/></div>
    <style>{`
      .vg-unified-settings>.vg-settings-legacy>.narrow{padding-top:0!important;max-width:none!important}
      .vg-unified-settings>.vg-settings-legacy>.narrow>.hdr{display:none!important}
      .vg-unified-settings>.vg-settings-legacy>.narrow>.sect:first-of-type{display:none!important}
    `}</style>
  </div>
}
