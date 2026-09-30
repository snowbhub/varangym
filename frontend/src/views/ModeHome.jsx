import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Home from './Home.jsx'
import RoleConsole from './RoleConsole.jsx'
import Icon from '../components/Icon.jsx'
import { getRoleMode, setRoleMode } from '../lib/role-mode.js'

const LABEL={admin:'Admin',business:'Business',trainer:'Coach'}
const SUB={admin:'Керування платформою',business:'Керування організацією',trainer:'Керування клієнтами'}

export function RoleModeRoot({mode}){
  const nav=useNavigate()
  const loc=useLocation()

  // /admin, /trainer and /business are kept only as compatibility entry points.
  // The role itself is a mode of the main VARANGYM app, not a nested page. Once selected,
  // all management views live under the normal /home shell and Settings switches modes.
  useEffect(()=>{
    setRoleMode(mode)
    if(loc.pathname!=='/home')nav(`/home${loc.search||''}`,{replace:true})
  },[mode])
  if(loc.pathname!=='/home')return null

  return <div className="vg-role-mode-root">
    <div className="narrow vg-role-mode-header">
      <div className="hdr">
        <div style={{flex:1}}><h1>{LABEL[mode]||'VARANGYM'}</h1><div className="sub">{SUB[mode]||''} · VARANGYM</div></div>
        <button className="iconbtn" onClick={()=>nav('/settings')} aria-label="Налаштування"><Icon name="gear"/></button>
      </div>
    </div>
    <div className="vg-role-console-body"><RoleConsole mode={mode}/></div>
    <style>{`
      .vg-role-console-body>.narrow>.hdr{display:none!important}
      .vg-role-console-body>.narrow{padding-top:0!important}
      .vg-role-mode-header{padding-bottom:0!important}
      .vg-role-mode-root .vg-role-console-body{min-height:0}
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
