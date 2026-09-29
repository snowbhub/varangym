import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useUI } from '../store/useUI.js'
import { Button, Row, Section } from './ui.jsx'

export default function AdminPlanTools(){
  const loc=useLocation()
  const nav=useNavigate()
  const toast=useUI(s=>s.toast)
  const [data,setData]=useState(null)
  const [workspaceId,setWorkspaceId]=useState('')
  const [preview,setPreview]=useState(null)
  const [busy,setBusy]=useState('')
  const view=new URLSearchParams(loc.search).get('view')||'home'

  useEffect(()=>{
    if(view!=='exercises')return
    api('/api/insights/admin').then(d=>{setData(d);setWorkspaceId(v=>v||d.workspaces?.[0]?.id||'')}).catch(e=>toast(e.message))
  },[view])
  useEffect(()=>{
    if(view!=='exercises'||!workspaceId)return
    api(`/api/profile-plan/preview?workspaceId=${encodeURIComponent(workspaceId)}`).then(setPreview).catch(()=>setPreview({days:[]}))
  },[view,workspaceId])

  if(view!=='exercises')return null
  const users=data?.users||[]
  const workspaces=data?.workspaces||[]
  const assign=async u=>{
    if(!workspaceId)return
    setBusy(u.id)
    try{
      const d=await api('/api/profile-plan/publish',{method:'POST',body:JSON.stringify({workspaceId,clientId:u.id,name:`${u.display_name} · VARANGYM`})})
      toast(`План призначено · v${d.versionNumber}`)
    }catch(e){toast(e.message)}finally{setBusy('')}
  }
  return <div className="narrow" style={{paddingTop:0}}>
    <div className="card">
      <div className="lbl2">Плани · platform admin</div>
      <div className="ss" style={{margin:'5px 0 10px'}}>Адмін може використати свій стандартний редактор плану як шаблон і призначити його будь-якому акаунту у вибраному workspace.</div>
      <select className="field" value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}>
        {workspaces.map(w=><option key={w.id} value={w.id}>{w.name} · {w.type}</option>)}
      </select>
      <div className="row between" style={{marginTop:10}}><div className="small muted">Шаблон: {preview?.days?.length||0} тренувальних днів</div><Button size="sm" onClick={()=>nav('/plan')}>Редагувати шаблон</Button></div>
    </div>
    <Section title="Призначити користувачу">
      {users.map(u=><Row key={u.id} icon="personCircle" title={u.display_name} subtitle={`${u.email||'без email'} · ${u.plan_code||'без тарифу'}`}>
        <Button size="sm" disabled={!!busy||(preview?.days?.length||0)===0} onClick={()=>assign(u)}>{busy===u.id?'…':'Призначити'}</Button>
      </Row>)}
    </Section>
  </div>
}
