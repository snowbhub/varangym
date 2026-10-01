import { useEffect, useRef, useState } from 'react'
import { useStore, hasData } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api, webauthnOK, passkeyLogin, passkeyRegister, BIO } from '../lib/api.js'
import { LANGS, getLang, setLang, t, useLang } from '../lib/i18n.js'
import { productText as p } from '../lib/product-copy.js'
import { DEMO, REPO } from '../lib/demo.js'
import { guestAllowed } from '../lib/guest.js'
import BrandMark from '../components/BrandMark.jsx'
import PlanPicker from '../components/PlanPicker.jsx'
import { Button, Segmented } from '../components/ui.jsx'
import { askAddDeviceData } from '../sheets.jsx'

function queryParam(name){try{return new URLSearchParams(window.location.search).get(name)||''}catch{return''}}
const inviteFromLocation=()=>queryParam('invite')
const checkoutFromLocation=()=>queryParam('checkout')

function RegisterSheet({close,inviteMode=false,initialType='solo'}){
  useLang()
  const {setUser,pushState,pullState}=useStore()
  const linkCode=inviteFromLocation()
  const [name,setName]=useState(''),[email,setEmail]=useState(''),[code,setCode]=useState(linkCode),[accountType,setAccountType]=useState(initialType),[workspaceName,setWorkspaceName]=useState(''),[busy,setBusy]=useState(false)
  const ref=useRef(null)
  useEffect(()=>{setTimeout(()=>ref.current?.focus(),250)},[])
  const usingInvite=!!linkCode||inviteMode
  const go=async()=>{
    const n=name.trim(),mail=email.trim().toLowerCase()
    if(!n)return useUI.getState().toast(t('Enter a name'))
    if(!usingInvite&&!/^\S+@\S+\.\S+$/.test(mail))return useUI.getState().toast(t('Enter a valid email'))
    if(usingInvite&&!code.trim())return useUI.getState().toast(t('Enter invite code'))
    if(!usingInvite&&accountType!=='solo'&&!workspaceName.trim())return useUI.getState().toast(t('Enter workspace name'))
    setBusy(true)
    try{
      let registrationCode=code.trim(),selfServiceTrial=false
      if(!usingInvite){
        const trial=await api('/api/trial/invite',{method:'POST',body:JSON.stringify({accountType,email:mail,name:n,workspaceName:workspaceName.trim()||null})})
        registrationCode=trial.code;selfServiceTrial=true
      }
      const u=await passkeyRegister(n,registrationCode,getLang(),mail||null)
      setUser(u)
      if(selfServiceTrial)await api('/api/trial/activate',{method:'POST',body:'{}'})
      close()
      if(hasData(useStore.getState().S)){await pushState();useUI.getState().toast(selfServiceTrial?p('createFree'):t('Profile created — data from this device moved into it'))}
      else{await pullState();useUI.getState().toast(selfServiceTrial?p('startTrial'):t('Welcome, {0}',u.name))}
      if(window.location.search)history.replaceState(null,'',window.location.pathname+window.location.hash)
    }catch(e){if(e.name!=='NotAllowedError'&&e.name!=='AbortError')useUI.getState().toast(e.message||t('Registration failed'))}
    finally{setBusy(false)}
  }
  return <div className="vg-register-sheet">
    <h3>{usingInvite?t('Register with invite'):t('Create VARANGYM account')}</h3>
    <div className="muted small" style={{marginBottom:14}}>{usingInvite?t('Your invite determines your role and workspace. Confirm the profile with {0}.',BIO):p('trialNote')}</div>
    {!usingInvite&&<div style={{marginBottom:12}}><Segmented options={[{value:'solo',label:'Solo'},{value:'trainer',label:'Coach'},{value:'business',label:'Business'}]} value={accountType} onChange={setAccountType}/></div>}
    <input ref={ref} className="input" placeholder={t('Your name')} maxLength={80} value={name} onChange={e=>setName(e.target.value)}/>
    <div style={{height:10}}/><input className="input" type="email" autoComplete="email" placeholder="Email" maxLength={320} value={email} onChange={e=>setEmail(e.target.value)}/>
    {!usingInvite&&accountType!=='solo'&&<><div style={{height:10}}/><input className="input" placeholder={accountType==='business'?t('Organization / gym name'):t('Coach profile name')} maxLength={100} value={workspaceName} onChange={e=>setWorkspaceName(e.target.value)}/></>}
    {usingInvite&&!linkCode&&<><div style={{height:10}}/><input className="input" placeholder={t('Invite code')} maxLength={40} value={code} onChange={e=>setCode(e.target.value.toUpperCase())} style={{letterSpacing:'.14em',fontWeight:600,textAlign:'center'}}/></>}
    <div style={{height:12}}/><Button variant="primary" disabled={busy} onClick={go}>{busy?'…':usingInvite?t('Create profile'):p('startTrial')}</Button>
  </div>
}

function LanguageSelect(){
  useLang()
  const update=useStore(s=>s.update)
  const lang=useStore(s=>s.S.lang)||getLang()
  const choose=async code=>{update(s=>{s.lang=code});await setLang(code)}
  return <label className="vg-login-language"><span>{p('language')}</span><select value={lang} onChange={e=>choose(e.target.value)}>{Object.entries(LANGS).map(([code,label])=><option value={code} key={code}>{label}</option>)}</select></label>
}

export default function Login(){
  useLang()
  const {setUser,adoptProfile,setGuest}=useStore()
  const config=useStore(s=>s.config),canGuest=guestAllowed(config)
  const inviteOpened=useRef(false),checkoutHandled=useRef(false)
  useEffect(()=>{
    if(DEMO||checkoutHandled.current||!checkoutFromLocation())return
    checkoutHandled.current=true
    const id=checkoutFromLocation();let stopped=false,tries=0
    const check=async()=>{if(stopped)return;tries++;try{const d=await api(`/api/billing/checkout/status?id=${encodeURIComponent(id)}`);if(d.registration?.url){location.replace(d.registration.url);return}if(d.status==='failed'||d.status==='canceled'){useUI.getState().toast(t('Payment was not completed'));return}}catch{}if(tries<12)setTimeout(check,1000);else useUI.getState().toast(t('Payment is still processing — refresh in a moment.'))}
    check();return()=>{stopped=true}
  },[])
  useEffect(()=>{if(DEMO||inviteOpened.current||!webauthnOK()||!inviteFromLocation())return;inviteOpened.current=true;const timer=setTimeout(()=>useUI.getState().openSheet(close=><RegisterSheet close={close} inviteMode/>),120);return()=>clearTimeout(timer)},[])
  const signIn=async()=>{try{const u=await passkeyLogin();setUser(u);await adoptProfile(askAddDeviceData);useUI.getState().toast(t('Welcome back, {0}',u.name))}catch(e){if(e.name!=='NotAllowedError'&&e.name!=='AbortError')useUI.getState().toast(e.message||t('Sign-in failed'))}}
  const openPlans=()=>useUI.getState().openSheet(close=><PlanPicker close={close} publicMode onTrial={audience=>{close();setTimeout(()=>useUI.getState().openSheet(c=><RegisterSheet close={c} initialType={audience==='organization'?'business':audience==='trainer'?'trainer':'solo'}/>),120)}}/>)
  const head=<><div className="vg-login-brand"><BrandMark size={92}/></div><h1 className="vg-login-word">VARANGYM</h1><div className="vg-login-motto">PLAN · TRAIN · PROGRESS</div></>
  const wrap={display:'flex',flexDirection:'column',justifyContent:'center',textAlign:'center'}
  if(DEMO)return <div className="narrow vg-login" style={wrap}><LanguageSelect/>{head}<div className="muted">{t('Live demo — everything stays in this browser.')}</div><Button variant="primary" icon="sparkles" onClick={()=>setGuest(true)}>{t('Start the demo')}</Button><div className="dim small"><a href={REPO} target="_blank" rel="noopener">{t('VARANGYM source & licenses →')}</a></div></div>
  return <div className="narrow vg-login" style={wrap}>
    <LanguageSelect/>{head}<div className="muted vg-login-tagline">{p('loginTagline')}</div>
    <div className="vg-login-actions-main">
      {webauthnOK()?<><Button variant="primary" icon="person" onClick={signIn}>{t('Sign in with passkey')}</Button><Button icon="sparkles" onClick={()=>useUI.getState().openSheet(close=><RegisterSheet close={close}/>)}>{p('createFree')}</Button><Button variant="ghost" icon="key" onClick={()=>useUI.getState().openSheet(close=><RegisterSheet close={close} inviteMode/>)}>{p('invite')}</Button></>:<div className="card small muted">{canGuest?t("This browser doesn't support passkeys — you can still use VARANGYM locally on this device."):t("This browser doesn't support passkeys, and this instance requires an account. Try a browser or device with passkey support.")}</div>}
      <Button variant="tinted" onClick={openPlans}>{p('plansPricing')}</Button>
      {canGuest&&<Button variant="ghost" className="dim" onClick={()=>setGuest(true)}>{p('continueGuest')}</Button>}
    </div>
    <div className="dim small vg-login-foot">{t('Passkeys use {0} — no passwords.',BIO)}<br/>{p('trialNote')}</div>
  </div>
}
