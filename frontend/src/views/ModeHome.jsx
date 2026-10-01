import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Home from './Home.jsx'
import RoleSections from './RoleSections.jsx'
import Icon from '../components/Icon.jsx'
import { t, useLang } from '../lib/i18n.js'
import { productText as p } from '../lib/product-copy.js'
import { getRoleMode, roleRoute, setRoleMode, viewOf } from '../lib/role-mode.js'

const modeLabel=mode=>mode==='admin'?'Admin':mode==='business'?'Business':'Coach'
const modeSubtitle=mode=>mode==='admin'?t('Platform management'):mode==='business'?t('Organization management'):t('Client management')

export function RoleModeRoot({mode}){
  useLang()
  const nav=useNavigate(),loc=useLocation(),view=viewOf(loc.search),isHome=view==='home'
  const roleNav=mode==='admin' ? [
    {view:'people',icon:'personCircle',title:t('Users')},{view:'trainers',icon:'chartLine',title:t('Trainers')},{view:'businesses',icon:'personCircle',title:t('Businesses')},{view:'invites',icon:'key',title:t('Invites')},{view:'dashboard',icon:'creditCard',title:t('Payments')},{view:'stats',icon:'chartLine',title:t('Analytics')},{view:'exercises',icon:'list',title:t('Exercises')}
  ] : mode==='business' ? [
    {view:'business-trainers',icon:'personCircle',title:t('Trainers')},{view:'business-clients',icon:'personCircle',title:t('Clients')},{view:'business-plans',icon:'calendar',title:t('Plans')},{view:'business-payments',icon:'creditCard',title:t('Payments')},{view:'stats',icon:'chartLine',title:t('Stats')},{view:'exercises',icon:'list',title:t('Exercises')}
  ] : [
    {view:'people',icon:'personCircle',title:t('Clients')},{view:'dashboard',icon:'calendar',title:t('Programs')},{view:'trainer-codes',icon:'key',title:t('Invites')},{view:'stats',icon:'chartLine',title:t('Analytics')},{view:'exercises',icon:'list',title:t('Exercises')}
  ]
  const adminQuick=[
    {view:'people',icon:'personCircle',title:t('Users'),note:t('Accounts and access')},
    {view:'trainers',icon:'chartLine',title:t('Trainers'),note:t('Coach profiles')},
    {view:'businesses',icon:'personCircle',title:t('Businesses'),note:t('Organizations')},
    {view:'dashboard',icon:'creditCard',title:t('Finances'),note:t('Payments and subscriptions')},
  ]
  useEffect(()=>{setRoleMode(mode);if(loc.pathname!=='/home')nav(`/home${loc.search||''}`,{replace:true})},[mode])
  if(loc.pathname!=='/home')return null
  return <div className={`vg-role-mode-root vg-mode-${mode} vg-view-${view}`}>
    <div className="narrow vg-role-mode-header">
      <div className="hdr">
        <button className="iconbtn" onClick={()=>nav('/home')} aria-label={t('Overview')}><Icon name="house"/></button>
        <div style={{flex:1,marginLeft:10}}><h1>{modeLabel(mode)}</h1><div className="sub">{modeSubtitle(mode)} · VARANGYM</div></div>
        {isHome&&<button className="iconbtn" onClick={()=>nav('/settings')} aria-label={p('settings')}><Icon name="gear"/></button>}
      </div>
      <nav className="vg-role-sections" aria-label={`${modeLabel(mode)} sections`}>
        <button className={'vg-role-section '+(isHome?'on':'')} onClick={()=>nav(roleRoute(mode,'home'))}><Icon name="house"/><span>{t('Overview')}</span></button>
        {roleNav.map(item=><button key={item.view} className={'vg-role-section '+(view===item.view?'on':'')} onClick={()=>nav(roleRoute(mode,item.view))}><Icon name={item.icon}/><span>{item.title}</span></button>)}
      </nav>
      {mode==='admin'&&isHome&&<div className="vg-admin-quicknav" aria-label={t('Admin quick navigation')}>
        {adminQuick.map(item=><button key={item.view} className="vg-admin-quick" onClick={()=>nav(roleRoute('admin',item.view))}>
          <span className="vg-admin-quick-icon"><Icon name={item.icon}/></span><span className="vg-admin-quick-copy"><b>{item.title}</b><small>{item.note}</small></span><Icon name="chevronRight"/>
        </button>)}
      </div>}
    </div>
    <div className="vg-role-console-body"><RoleSections mode={mode}/></div>
    <style>{`
      .vg-role-console-body>.narrow>.hdr{display:none!important}.vg-role-console-body>.narrow{padding-top:0!important}.vg-role-mode-header{padding-bottom:0!important}.vg-role-mode-root .vg-role-console-body{min-height:0}
      .vg-role-sections{display:flex;gap:7px;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;margin:-2px 0 14px;padding:2px 1px 4px;mask-image:linear-gradient(90deg,transparent 0,#000 9px,#000 calc(100% - 9px),transparent 100%)}.vg-role-sections::-webkit-scrollbar{display:none}
      .vg-role-section{appearance:none;display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;min-height:38px;padding:8px 11px;border-radius:999px;border:1px solid color-mix(in srgb,var(--label) 9%,transparent);background:var(--surface);color:var(--label-2);font-size:12px;font-weight:700;white-space:nowrap;transition:transform .16s ease,background .16s ease,color .16s ease,border-color .16s ease}.vg-role-section svg{width:15px;height:15px}.vg-role-section:active{transform:scale(.96)}.vg-role-section.on{background:color-mix(in srgb,var(--acc) 15%,var(--surface));border-color:color-mix(in srgb,var(--acc) 38%,transparent);color:var(--acc)}
      .vg-admin-quicknav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:2px 0 14px}.vg-admin-quick{appearance:none;border:var(--hair) solid var(--sep);background:var(--surface);color:var(--text);border-radius:16px;padding:11px 10px;display:grid;grid-template-columns:34px minmax(0,1fr) 18px;align-items:center;gap:9px;text-align:left;min-width:0}.vg-admin-quick:active{transform:scale(.985)}.vg-admin-quick-icon{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:color-mix(in srgb,var(--acc) 16%,transparent);color:var(--acc)}.vg-admin-quick-copy{min-width:0;display:grid;gap:2px}.vg-admin-quick-copy b{font-size:14px;line-height:1.1}.vg-admin-quick-copy small{font-size:10px;line-height:1.2;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vg-admin-quick>svg{width:16px;height:16px;color:var(--muted)}
      .vg-code-value{appearance:none;width:100%;background:color-mix(in srgb,var(--acc) 9%,var(--surface-2));color:var(--label);border:1px solid color-mix(in srgb,var(--acc) 28%,transparent);border-radius:14px;padding:14px;margin:9px 0;font-size:23px;font-weight:850;letter-spacing:.08em;overflow-wrap:anywhere}
      @media(max-width:430px){.vg-admin-quicknav{gap:7px}.vg-admin-quick{padding:10px 8px;grid-template-columns:30px minmax(0,1fr) 14px}.vg-admin-quick-icon{width:30px;height:30px}.vg-admin-quick-copy small{font-size:9px}.vg-role-section{padding:7px 10px;min-height:36px}}
    `}</style>
  </div>
}

export default function ModeHome(){
  const [mode,setMode]=useState(()=>getRoleMode())
  useEffect(()=>{const sync=e=>setMode(e?.detail??getRoleMode());window.addEventListener('varangym-role-mode',sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener('varangym-role-mode',sync);window.removeEventListener('storage',sync)}},[])
  return mode?<RoleModeRoot mode={mode}/>:<Home/>
}
