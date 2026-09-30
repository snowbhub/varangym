import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Home from './Home.jsx'
import RoleConsole from './RoleConsole.jsx'
import Icon from '../components/Icon.jsx'
import { getRoleMode, roleRoute, setRoleMode, viewOf } from '../lib/role-mode.js'

const LABEL={admin:'Admin',business:'Business',trainer:'Coach'}
const SUB={admin:'Керування платформою',business:'Керування організацією',trainer:'Керування клієнтами'}
const ADMIN_NAV=[
  {view:'people',icon:'personCircle',title:'Акаунти',note:'Люди та організації'},
  {view:'dashboard',icon:'creditCard',title:'Фінанси',note:'Платежі й підписки'},
  {view:'stats',icon:'chartLine',title:'Статистика',note:'Активність і прогрес'},
  {view:'exercises',icon:'list',title:'Вправи',note:'Каталог і плани'},
]

export function RoleModeRoot({mode}){
  const nav=useNavigate()
  const loc=useLocation()
  const view=viewOf(loc.search)
  const isHome=view==='home'

  // /admin, /trainer and /business are compatibility entry points only. A role is a mode of the
  // same VARANGYM shell; every management screen stays under /home and shares one session/nav.
  useEffect(()=>{
    setRoleMode(mode)
    if(loc.pathname!=='/home')nav(`/home${loc.search||''}`,{replace:true})
  },[mode])
  if(loc.pathname!=='/home')return null

  return <div className={`vg-role-mode-root vg-mode-${mode} vg-view-${view}`}>
    <div className="narrow vg-role-mode-header">
      <div className="hdr">
        <div style={{flex:1}}><h1>{LABEL[mode]||'VARANGYM'}</h1><div className="sub">{SUB[mode]||''} · VARANGYM</div></div>
        {isHome&&<button className="iconbtn" onClick={()=>nav('/settings')} aria-label="Налаштування"><Icon name="gear"/></button>}
      </div>
      {mode==='admin'&&isHome&&<div className="vg-admin-quicknav" aria-label="Швидка навігація адміністратора">
        {ADMIN_NAV.map(item=><button key={item.view} className="vg-admin-quick" onClick={()=>nav(roleRoute('admin',item.view))}>
          <span className="vg-admin-quick-icon"><Icon name={item.icon}/></span>
          <span className="vg-admin-quick-copy"><b>{item.title}</b><small>{item.note}</small></span>
          <Icon name="chevronRight"/>
        </button>)}
      </div>}
    </div>
    <div className="vg-role-console-body"><RoleConsole mode={mode}/></div>
    <style>{`
      .vg-role-console-body>.narrow>.hdr{display:none!important}
      .vg-role-console-body>.narrow{padding-top:0!important}
      .vg-role-mode-header{padding-bottom:0!important}
      .vg-role-mode-root .vg-role-console-body{min-height:0}

      .vg-admin-quicknav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:2px 0 14px}
      .vg-admin-quick{appearance:none;border:var(--hair) solid var(--sep);background:var(--surface);color:var(--text);border-radius:16px;padding:11px 10px;display:grid;grid-template-columns:34px minmax(0,1fr) 18px;align-items:center;gap:9px;text-align:left;min-width:0}
      .vg-admin-quick:active{transform:scale(.985)}
      .vg-admin-quick-icon{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:color-mix(in srgb,var(--acc) 16%,transparent);color:var(--acc)}
      .vg-admin-quick-copy{min-width:0;display:grid;gap:2px}.vg-admin-quick-copy b{font-size:14px;line-height:1.1}.vg-admin-quick-copy small{font-size:10px;line-height:1.2;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .vg-admin-quick>svg{width:16px;height:16px;color:var(--muted)}

      .vg-mode-admin.vg-view-home .vg-role-console-body>.narrow>.grid2:first-of-type{gap:9px}
      .vg-mode-admin.vg-view-home .vg-role-console-body>.narrow>.grid2:first-of-type>.stat{min-height:98px;padding:14px;border:var(--hair) solid var(--sep);background:linear-gradient(145deg,color-mix(in srgb,var(--surface) 94%,var(--acc) 6%),var(--surface));box-shadow:none}
      .vg-mode-admin.vg-view-home .vg-role-console-body>.narrow>.grid2:first-of-type>.stat .n{font-size:24px;line-height:1.05;letter-spacing:-.035em}
      .vg-mode-admin.vg-view-home .vg-role-console-body>.narrow>.grid2:first-of-type>.stat .l{margin-top:5px;font-size:11px;font-weight:700}
      .vg-mode-admin.vg-view-home .vg-role-console-body>.narrow>.grid2:first-of-type>.stat .s{margin-top:3px;font-size:10px;color:var(--muted)}
      .vg-mode-admin.vg-view-home .vg-role-console-body>.narrow>.grid2:first-of-type>.stat:nth-child(1),
      .vg-mode-admin.vg-view-home .vg-role-console-body>.narrow>.grid2:first-of-type>.stat:nth-child(7){background:linear-gradient(145deg,color-mix(in srgb,var(--acc) 18%,var(--surface)),var(--surface))}
      .vg-mode-admin.vg-view-home .vg-role-console-body>.narrow>.grid2:first-of-type>.stat:nth-child(3),
      .vg-mode-admin.vg-view-home .vg-role-console-body>.narrow>.grid2:first-of-type>.stat:nth-child(5),
      .vg-mode-admin.vg-view-home .vg-role-console-body>.narrow>.grid2:first-of-type>.stat:nth-child(6),
      .vg-mode-admin.vg-view-home .vg-role-console-body>.narrow>.grid2:first-of-type>.stat:nth-child(8){display:none}
      @media (max-width:430px){.vg-admin-quicknav{gap:7px}.vg-admin-quick{padding:10px 8px;grid-template-columns:30px minmax(0,1fr) 14px}.vg-admin-quick-icon{width:30px;height:30px}.vg-admin-quick-copy small{font-size:9px}}
    `}</style>
  </div>
}

export default function ModeHome(){
  const [mode,setMode]=useState(()=>getRoleMode())
  useEffect(()=>{
    const sync=e=>setMode(e?.detail??getRoleMode())
    window.addEventListener('varangym-role-mode',sync)
    window.addEventListener('storage',sync)
    return()=>{window.removeEventListener('varangym-role-mode',sync);window.removeEventListener('storage',sync)}
  },[])
  return mode?<RoleModeRoot mode={mode}/>:<Home/>
}
