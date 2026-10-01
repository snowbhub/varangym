import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Settings from './Settings.jsx'
import { Button, Row, Section } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import ProfileAvatar, { avatarFromFile } from '../components/ProfileAvatar.jsx'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { dateLocale, t, useLang } from '../lib/i18n.js'
import { productText as p } from '../lib/product-copy.js'
import { loadPlatformIdentity, platformAccess } from '../lib/platform-role.js'
import { getRoleMode, roleRoute, setRoleMode } from '../lib/role-mode.js'
import { confirmSheet } from '../sheets.jsx'

const FRIENDLY={solo_monthly:'VARANGYM Solo Monthly',solo_lifetime:'VARANGYM Solo Lifetime',coach_5:'VARANGYM Coach Starter',coach_10:'VARANGYM Coach Pro',coach_20:'VARANGYM Coach Scale',business_5_50:'VARANGYM Business Studio',business_10_100:'VARANGYM Business Club'}
const active=s=>['active','trialing'].includes(String(s?.status||''))
const planRank=s=>{const code=String(s?.plan_code||'');const audience=String(s?.plan_metadata?.audience||'');if(code.startsWith('business_')||audience==='organization')return 3;if(code.startsWith('coach_')||audience==='trainer')return 2;return 1}
const modeName=m=>m==='admin'?'Admin':m==='business'?'Business':m==='trainer'?'Coach':p('normalMode')
const date=v=>{if(!v)return'';try{return new Date(v).toLocaleDateString(dateLocale())}catch{return''}}

function ProfileEditorSheet({close,user}){
  useLang()
  const S=useStore(s=>s.S),update=useStore(s=>s.update)
  const toast=useUI(s=>s.toast)
  const [name,setName]=useState(()=>String(S.profileName||user?.name||''))
  const [avatar,setAvatar]=useState(()=>S.profileAvatar||'')
  const [busy,setBusy]=useState(false)
  const fileRef=useRef(null)
  const pick=async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return
    setBusy(true)
    try{setAvatar(await avatarFromFile(file))}catch(err){toast(err?.message||t('Could not read image'))}finally{setBusy(false)}
  }
  const save=()=>{
    update(s=>{s.profileName=name.trim();s.profileAvatar=avatar||''})
    toast(t('Profile updated'));close()
  }
  return <div className="vg-profile-sheet">
    <div className="vg-profile-sheet-head"><ProfileAvatar src={avatar} name={name||user?.name||'VARANGYM'} size={92}/><div className="muted small">{t('Profile photo')}</div></div>
    <input className="field" value={name} maxLength={80} onChange={e=>setName(e.target.value)} placeholder={t('Your name')}/>
    <input ref={fileRef} hidden type="file" accept="image/*" onChange={pick}/>
    <div className="vg-profile-photo-actions"><Button icon="personCircle" disabled={busy} onClick={()=>fileRef.current?.click()}>{busy?'…':t('Choose photo')}</Button><Button icon="trash" disabled={!avatar||busy} onClick={()=>setAvatar('')}>{t('Remove photo')}</Button></div>
    <Button variant="primary" icon="check" disabled={busy||!name.trim()} onClick={save}>{t('Save')}</Button>
  </div>
}

export default function UnifiedSettings(){
  useLang()
  const nav=useNavigate()
  const user=useStore(s=>s.user)
  const S=useStore(s=>s.S)
  const accent=useStore(s=>s.S.accent)
  const update=useStore(s=>s.update)
  const signOut=useStore(s=>s.signOut)
  const signOutAll=useStore(s=>s.signOutAll)
  const [identity,setIdentity]=useState(null)
  const [mode,setModeState]=useState(()=>getRoleMode())
  const [subscriptions,setSubscriptions]=useState([])

  useEffect(()=>{if(!accent||accent==='lime')update(s=>{s.accent='varangym'})},[accent,update])
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
  const primary=useMemo(()=>{
    const on=subscriptions.filter(active),source=on.length?on:subscriptions
    return [...source].sort((a,b)=>planRank(b)-planRank(a))[0]||null
  },[subscriptions])
  const activeCount=subscriptions.filter(active).length
  const switchMode=next=>{setRoleMode(next);setModeState(next||null);nav(next?roleRoute(next,'home'):'/home',{replace:true})}
  const subLabel=primary?.plan_metadata?.label||FRIENDLY[primary?.plan_code]||p('noPlan')
  const subNote=primary?.status==='trialing'&&primary?.trial_ends_at?p('trialUntil',date(primary.trial_ends_at)):primary?.status==='active'&&primary?.current_period_end?p('paidUntil',date(primary.current_period_end)):primary?.status==='active'?p('active'):p('choosePlan')
  const subExtra=activeCount>1?` · +${activeCount-1}`:''
  const displayName=String(S.profileName||user?.name||identity?.user?.display_name||'VARANGYM').trim()
  const editProfile=()=>useUI.getState().openSheet(close=><ProfileEditorSheet close={close} user={user}/>)
  const logout=()=>confirmSheet({title:p('logoutConfirm'),confirmText:p('yesSignOut'),danger:true,onConfirm:()=>{signOut();setRoleMode(null);nav('/home')}})
  const logoutAll=()=>confirmSheet({title:p('logoutAllConfirm'),confirmText:p('yesSignOutAll'),danger:true,onConfirm:async()=>{await signOutAll();setRoleMode(null);nav('/home')}})

  return <div className="narrow vg-unified-settings">
    <div className="hdr"><div style={{flex:1}}><h1>{p('settings')}</h1><div className="sub">{p('mode')}: {modeName(mode)} · VARANGYM</div></div></div>
    {user&&<Section title={p('account')}>
      <button className="lrow tap vg-profile-row" onClick={editProfile}>
        <ProfileAvatar src={S.profileAvatar} name={displayName} size={46}/>
        <span className="lrow-m"><span className="lrow-t">{displayName}</span><span className="lrow-s">{t('Photo, name and profile')}</span></span>
        <Icon name="chevronRight" className="lrow-c"/>
      </button>
      <Row icon="house" iconTint="var(--acc)" title={p('normalMode')} subtitle={t('My workouts, plan, stats and exercises')} accessory={!mode?'check':'chevron'} onClick={()=>switchMode(null)}/>
      {effectiveAccess.platformAdmin&&<Row icon="wrench" iconTint="var(--acc)" title={p('adminPanel')} subtitle={t('Platform, finances, users and exercises')} accessory={mode==='admin'?'check':'chevron'} onClick={()=>switchMode('admin')}/>} 
      {effectiveAccess.business&&<Row icon="personCircle" iconTint="var(--indigo)" title={p('businessPanel')} subtitle={t('Organization, trainers, clients and analytics')} accessory={mode==='business'?'check':'chevron'} onClick={()=>switchMode('business')}/>} 
      {effectiveAccess.trainer&&<Row icon="chartLine" iconTint="var(--blue)" title={p('coachPanel')} subtitle={t('Clients, programs, progress and invites')} accessory={mode==='trainer'?'check':'chevron'} onClick={()=>switchMode('trainer')}/>} 
      <Row className="vg-subscription-row" icon="creditCard" iconTint="var(--acc)" title={p('manageSubscription')} subtitle={`${subLabel} · ${subNote}${subExtra}`} accessory="chevron" onClick={()=>nav('/subscription')}/>
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
