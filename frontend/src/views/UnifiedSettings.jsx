import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Settings from './Settings.jsx'
import { Row, Section } from '../components/ui.jsx'
import { useStore } from '../store/useStore.js'
import { api } from '../lib/api.js'
import { loadPlatformIdentity, platformAccess } from '../lib/platform-role.js'
import { getRoleMode, roleRoute, setRoleMode } from '../lib/role-mode.js'

const MODE_COPY={
  admin:{title:'Admin панель',subtitle:'Платформа, фінанси, користувачі та вправи',icon:'wrench',tint:'var(--acc)'},
  business:{title:'Business панель',subtitle:'Організація, тренери, клієнти та аналітика',icon:'personCircle',tint:'var(--indigo)'},
  trainer:{title:'Coach панель',subtitle:'Клієнти, програми, прогрес і коди',icon:'chartLine',tint:'var(--blue)'},
}
const PLAN_NAME={
  solo_monthly:'Solo Monthly',solo_lifetime:'Solo Lifetime',coach_5:'Coach 5',coach_10:'Coach 10',coach_20:'Coach 20',business_5_50:'Business 5 / 50',business_10_100:'Business 10 / 100'
}
const modeTitle=m=>m==='admin'?'Admin':m==='business'?'Business':m==='trainer'?'Coach':'Звичайний'
const date=v=>{if(!v)return'';try{return new Date(v).toLocaleDateString('uk-UA')}catch{return''}}
const active=s=>['active','trialing'].includes(String(s?.status||''))
const planRank=s=>{const code=String(s?.plan_code||'');const audience=String(s?.plan_metadata?.audience||'');if(code.startsWith('business_')||audience==='organization')return 3;if(code.startsWith('coach_')||audience==='trainer')return 2;return 1}
const planName=s=>s?.plan_metadata?.label||PLAN_NAME[s?.plan_code]||String(s?.plan_code||'').replaceAll('_',' ')||'Обрати тариф'

export default function UnifiedSettings(){
  const nav=useNavigate()
  const user=useStore(s=>s.user)
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
  const effectiveAccess={
    platformAdmin:!!(access.platformAdmin||user?.admin),
    business:!!access.business,
    trainer:!!access.trainer,
  }
  const primarySubscription=useMemo(()=>{
    const activeRows=subscriptions.filter(active)
    const source=activeRows.length?activeRows:subscriptions
    return [...source].sort((a,b)=>planRank(b)-planRank(a))[0]||null
  },[subscriptions])
  const activeCount=subscriptions.filter(active).length
  const switchMode=next=>{
    setRoleMode(next)
    setModeState(next||null)
    nav(next?roleRoute(next,'home'):'/home',{replace:true})
  }
  const subLabel=planName(primarySubscription)
  const subNote=primarySubscription?.status==='trialing'
    ? `Trial${primarySubscription.trial_ends_at?` до ${date(primarySubscription.trial_ends_at)}`:''}${activeCount>1?` · ще ${activeCount-1} активн.`:''}`
    : primarySubscription?.status==='active'
      ? `Активна підписка${activeCount>1?` · ще ${activeCount-1} активн.`:''}`
      : 'Solo, Coach або Business'

  return <div className="narrow vg-unified-settings">
    <div className="hdr"><div style={{flex:1}}><h1>Налаштування</h1><div className="sub">Режим: {modeTitle(mode)} · VARANGYM</div></div></div>

    {user&&<Section title="Акаунт">
      <Row icon="personCircle" iconTint="var(--grey)" title={user.name||identity?.user?.display_name||'VARANGYM'} subtitle={mode?`${modeTitle(mode)} режим активний`:'Звичайний режим тренувань'} />
      <Row icon="house" iconTint="var(--acc)" title="Звичайний режим" subtitle="Мої тренування, план, статистика та вправи" accessory={!mode?'check':'chevron'} onClick={()=>switchMode(null)}/>
      {effectiveAccess.platformAdmin&&<Row icon={MODE_COPY.admin.icon} iconTint={MODE_COPY.admin.tint} title={MODE_COPY.admin.title} subtitle={MODE_COPY.admin.subtitle} accessory={mode==='admin'?'check':'chevron'} onClick={()=>switchMode('admin')}/>} 
      {effectiveAccess.business&&<Row icon={MODE_COPY.business.icon} iconTint={MODE_COPY.business.tint} title={MODE_COPY.business.title} subtitle={MODE_COPY.business.subtitle} accessory={mode==='business'?'check':'chevron'} onClick={()=>switchMode('business')}/>} 
      {effectiveAccess.trainer&&<Row icon={MODE_COPY.trainer.icon} iconTint={MODE_COPY.trainer.tint} title={MODE_COPY.trainer.title} subtitle={MODE_COPY.trainer.subtitle} accessory={mode==='trainer'?'check':'chevron'} onClick={()=>switchMode('trainer')}/>} 
      <Row icon="creditCard" iconTint="var(--acc)" title="Керування підпискою" subtitle={`${subLabel} · ${subNote}`} accessory="chevron" onClick={()=>nav('/subscription')}/>
    </Section>}

    <div className={'vg-settings-legacy '+(effectiveAccess.platformAdmin?'vg-hide-legacy-admin':'')}><Settings/></div>
    <style>{`
      .vg-unified-settings>.vg-settings-legacy>.narrow{padding-top:0!important;max-width:none!important}
      .vg-unified-settings>.vg-settings-legacy>.narrow>.hdr{display:none!important}
      .vg-unified-settings>.vg-settings-legacy>.narrow>.sect:first-of-type{display:none!important}
    `}</style>
  </div>
}
