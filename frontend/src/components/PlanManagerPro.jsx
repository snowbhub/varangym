import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useUI } from '../store/useUI.js'
import { Button, Row, Section, Segmented } from './ui.jsx'
import ClientProgramEditor from './ClientProgramEditor.jsx'

const fmtDate=v=>{if(!v)return'—';try{return new Date(v).toLocaleDateString('uk-UA')}catch{return'—'}}

export default function PlanManagerPro({mode='trainer',workspaceId:workspaceProp='',workspaces=[],clients=[]}) {
  const nav=useNavigate()
  const toast=useUI(s=>s.toast)
  const [workspaceId,setWorkspaceId]=useState(workspaceProp||workspaces[0]?.id||workspaces[0]?.workspace_id||'')
  const [clientId,setClientId]=useState('')
  const [preview,setPreview]=useState(null)
  const [assignment,setAssignment]=useState(null)
  const [assignmentLoading,setAssignmentLoading]=useState(false)
  const [busy,setBusy]=useState(false)
  const [err,setErr]=useState('')
  const [workflow,setWorkflow]=useState('client')

  useEffect(()=>{if(workspaceProp)setWorkspaceId(workspaceProp)},[workspaceProp])
  const clientOptions=useMemo(()=>clients.filter(c=>c.id||c.user_id),[clients])
  useEffect(()=>{if(!clientId&&clientOptions.length)setClientId(clientOptions[0].id||clientOptions[0].user_id)},[clientOptions,clientId])

  const load=async()=>{
    if(!workspaceId){setPreview(null);return}
    setErr('')
    try{setPreview(await api(`/api/profile-plan/preview?workspaceId=${encodeURIComponent(workspaceId)}`))}
    catch(e){setErr(e.message||'Не вдалося завантажити план')}
  }
  useEffect(()=>{load()},[workspaceId])

  const loadAssignment=async()=>{
    if(!workspaceId||!clientId){setAssignment(null);return}
    setAssignmentLoading(true)
    try{
      const d=await api(`/api/analytics/client/${encodeURIComponent(clientId)}?days=30&workspaceId=${encodeURIComponent(workspaceId)}`)
      setAssignment(d.currentProgram||null)
    }catch{setAssignment(null)}
    finally{setAssignmentLoading(false)}
  }
  useEffect(()=>{loadAssignment()},[workspaceId,clientId])

  const publish=async()=>{
    if(!workspaceId)return toast('Вибери workspace')
    if(!clientId)return toast('Вибери клієнта')
    if(!preview?.days?.length)return toast('Спочатку створи хоча б один тренувальний день у Плані')
    setBusy(true)
    try{
      const c=clientOptions.find(x=>(x.id||x.user_id)===clientId)
      const d=await api('/api/profile-plan/publish',{method:'POST',body:JSON.stringify({workspaceId,clientId,name:`VARANGYM · ${c?.display_name||c?.name||'Клієнт'}`})})
      toast(`План призначено · v${d.versionNumber||1}`)
      await Promise.all([load(),loadAssignment()])
    }catch(e){toast(e.message||'Не вдалося призначити план')}
    finally{setBusy(false)}
  }

  const selectedClient=clientOptions.find(x=>(x.id||x.user_id)===clientId)
  return <div style={{display:'grid',gap:12}}>
    {mode==='admin'&&workspaces.length>0&&<div className="card">
      <div className="lbl2">Workspace</div>
      <select className="field" style={{marginTop:8}} value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}>
        <option value="">Вибери workspace…</option>
        {workspaces.map(w=><option key={w.id||w.workspace_id} value={w.id||w.workspace_id}>{w.name||w.workspace_name||'Workspace'} · {w.type||w.role||''}</option>)}
      </select>
    </div>}

    <div className="card" style={{padding:8}}><Segmented value={workflow} onChange={setWorkflow} options={[{value:'client',label:'Програма клієнта'},{value:'template',label:'Мій шаблон'}]}/></div>

    {workflow==='client'?<ClientProgramEditor workspaceId={workspaceId} clients={clientOptions}/>:<>
      <div className="card">
        <div className="row between">
          <div><div className="lbl2">Мій шаблон VARANGYM</div><div className="ss">Швидкий варіант: відредагуй власний тижневий план і опублікуй його конкретному клієнту.</div></div>
          <Button size="sm" icon="pencil" onClick={()=>nav('/plan')}>Редагувати</Button>
        </div>
        {err?<div className="small" style={{color:'var(--red)',marginTop:10}}>{err}</div>:preview?<div className="grid2" style={{marginTop:12}}>
          <div className="stat"><div className="n">{preview.days?.length||0}</div><div className="l">тренувальних днів</div></div>
          <div className="stat"><div className="n">{(preview.days||[]).reduce((n,x)=>n+Number(x.exercises||0),0)}</div><div className="l">вправ у плані</div></div>
          <div className="stat"><div className="n">{preview.customExercises||0}</div><div className="l">власних вправ</div></div>
          <div className="stat"><div className="n">{preview.rev||0}</div><div className="l">ревізія профілю</div></div>
        </div>:<div className="small muted" style={{marginTop:10}}>Завантаження плану…</div>}
      </div>

      <div className="card">
        <div className="lbl2">Призначити шаблон клієнтові</div>
        <select className="field" style={{marginTop:10}} value={clientId} onChange={e=>setClientId(e.target.value)}>
          <option value="">Вибери клієнта…</option>
          {clientOptions.map(c=><option key={c.id||c.user_id} value={c.id||c.user_id}>{c.display_name||c.name||c.email||'Клієнт'}</option>)}
        </select>
        <Button variant="primary" style={{marginTop:10}} disabled={busy||!clientId||!workspaceId} onClick={publish}>{busy?'Призначаю…':'Призначити мій шаблон'}</Button>
      </div>

      {clientId&&<Section title={`Поточна програма · ${selectedClient?.display_name||selectedClient?.name||'клієнт'}`}>
        {assignmentLoading?<Row title="Перевіряю призначення…"/>:assignment?<Row icon="calendar" iconTint="var(--acc)" title={assignment.name||'Програма'} subtitle={`Версія ${assignment.version_number||1}${assignment.trainer_name?` · ${assignment.trainer_name}`:''} · опубліковано ${fmtDate(assignment.published_at)}`} value={`${assignment.days?.length||0} днів`}/>:<Row title="Активної програми немає" subtitle="Після публікації вона зʼявиться тут і синхронізується клієнту."/>}
      </Section>}

      <Section title="Що буде призначено">
        {(preview?.days||[]).map((d,i)=><Row key={`${d.weekday}:${d.routineId}:${i}`} icon="calendar" title={d.name||`День ${i+1}`} subtitle={`День тижня: ${d.weekday} · ${d.exercises||0} вправ`}/>) }
        {preview&&!preview.days?.length&&<Row title="Шаблон порожній" subtitle="Натисни «Редагувати» і додай тренувальні дні."/>}
      </Section>
    </>}
  </div>
}
