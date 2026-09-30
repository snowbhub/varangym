import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Settings from './Settings.jsx'
import SubscriptionPanel from '../components/SubscriptionPanel.jsx'
import { Row, Section } from '../components/ui.jsx'
import { useStore } from '../store/useStore.js'
import { loadPlatformIdentity, platformAccess } from '../lib/platform-role.js'
import { getRoleMode, roleRoute, setRoleMode } from '../lib/role-mode.js'

const MODE_COPY={
  admin:{title:'Admin панель',subtitle:'Платформа, фінанси, користувачі та вправи',icon:'wrench',tint:'var(--acc)'},
  business:{title:'Business панель',subtitle:'Організація, тренери, клієнти та аналітика',icon:'personCircle',tint:'var(--indigo)'},
  trainer:{title:'Coach панель',subtitle:'Клієнти, програми, прогрес і коди',icon:'chartLine',tint:'var(--blue)'},
}
const modeTitle=m=>m==='admin'?'Admin':m==='business'?'Business':m==='trainer'?'Coach':'Звичайний'

export default function UnifiedSettings(){
  const nav=useNavigate()
  const user=useStore(s=>s.user)
  const [identity,setIdentity]=useState(null)
  const [mode,setModeState]=useState(()=>getRoleMode())

  useEffect(()=>{if(user)loadPlatformIdentity().then(setIdentity).catch(()=>{})},[user?.id])
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
  const canManage=effectiveAccess.platformAdmin||effectiveAccess.business||effectiveAccess.trainer
  const switchMode=next=>{
    setRoleMode(next)
    setModeState(next||null)
    nav(next?roleRoute(next,'home'):'/home',{replace:true})
  }

  return <div className="narrow vg-unified-settings">
    <div className="hdr"><div style={{flex:1}}><h1>Налаштування</h1><div className="sub">Режим: {modeTitle(mode)} · VARANGYM</div></div></div>

    {user&&<Section title="Акаунт і режим">
      <Row icon="personCircle" iconTint="var(--grey)" title={user.name||identity?.user?.display_name||'VARANGYM'} subtitle={mode?`${modeTitle(mode)} режим активний`:'Звичайний режим тренувань'} />
      {mode&&<Row icon="house" iconTint="var(--acc)" title="Звичайний режим" subtitle="Мої тренування, план, статистика та вправи" accessory="chevron" onClick={()=>switchMode(null)}/>} 
      {effectiveAccess.platformAdmin&&<Row icon={MODE_COPY.admin.icon} iconTint={MODE_COPY.admin.tint} title={MODE_COPY.admin.title} subtitle={MODE_COPY.admin.subtitle} accessory={mode==='admin'?'check':'chevron'} onClick={()=>switchMode('admin')}/>} 
      {effectiveAccess.business&&<Row icon={MODE_COPY.business.icon} iconTint={MODE_COPY.business.tint} title={MODE_COPY.business.title} subtitle={MODE_COPY.business.subtitle} accessory={mode==='business'?'check':'chevron'} onClick={()=>switchMode('business')}/>} 
      {effectiveAccess.trainer&&<Row icon={MODE_COPY.trainer.icon} iconTint={MODE_COPY.trainer.tint} title={MODE_COPY.trainer.title} subtitle={MODE_COPY.trainer.subtitle} accessory={mode==='trainer'?'check':'chevron'} onClick={()=>switchMode('trainer')}/>} 
      {!canManage&&!mode&&<Row icon="info" title="Звичайний режим" subtitle="Для Coach або Business режиму потрібна відповідна роль чи підписка."/>}
    </Section>}

    {user&&<SubscriptionPanel/>}

    <div className={'vg-settings-legacy '+(effectiveAccess.platformAdmin?'vg-hide-legacy-admin':'')}><Settings/></div>
    <style>{`
      .vg-unified-settings>.vg-settings-legacy>.narrow{padding-top:0!important;max-width:none!important}
      .vg-unified-settings>.vg-settings-legacy>.narrow>.hdr{display:none!important}
      .vg-unified-settings>.vg-settings-legacy>.narrow>.sect:first-of-type .sect-b>.lrow:first-child{display:none!important}
      .vg-unified-settings>.vg-settings-legacy.vg-hide-legacy-admin>.narrow>.sect:first-of-type .sect-b>.lrow:nth-child(2){display:none!important}
    `}</style>
  </div>
}
