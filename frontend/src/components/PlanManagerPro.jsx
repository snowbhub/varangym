import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { dateLocale, useLang } from '../lib/i18n.js'
import { managementText as m } from '../lib/management-copy.js'
import { useUI } from '../store/useUI.js'
import { Button, Row, Section, Segmented } from './ui.jsx'
import ClientProgramEditor from './ClientProgramEditor.jsx'

const fmtDate=v=>{if(!v)return'—';try{return new Date(v).toLocaleDateString(dateLocale())}catch{return'—'}}

export default function PlanManagerPro({mode='trainer',workspaceId:workspaceProp='',workspaces=[],clients=[]}) {
  useLang()
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
    catch(e){setErr(e.message||m('couldNotLoadPlan'))}
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
    if(!workspaceId)return toast(m('selectWorkspace'))
    if(!clientId)return toast(m('chooseClient'))
    if(!preview?.days?.length)return toast(m('createDayFirst'))
    setBusy(true)
    try{
      const c=clientOptions.find(x=>(x.id||x.user_id)===clientId)
      const d=await api('/api/profile-plan/publish',{method:'POST',body:JSON.stringify({workspaceId,clientId,name:`VARANGYM · ${c?.display_name||c?.name||m('client')}`})})
      toast(m('planAssigned',d.versionNumber||1))
      await Promise.all([load(),loadAssignment()])
    }catch(e){toast(e.message||m('couldNotAssign'))}
    finally{setBusy(false)}
  }

  const selectedClient=clientOptions.find(x=>(x.id||x.user_id)===clientId)
  const publishedSuffix=assignment?.trainer_name?` · ${assignment.trainer_name}`:''
  return <div style={{display:'grid',gap:12}}>
    {mode==='admin'&&workspaces.length>0&&<div className="card">
      <div className="lbl2">Workspace</div>
      <select className="field" style={{marginTop:8}} value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}>
        <option value="">{m('selectWorkspace')}</option>
        {workspaces.map(w=><option key={w.id||w.workspace_id} value={w.id||w.workspace_id}>{w.name||w.workspace_name||'Workspace'} · {w.type||w.role||''}</option>)}
      </select>
    </div>}

    <div className="card" style={{padding:8}}><Segmented value={workflow} onChange={setWorkflow} options={[{value:'client',label:m('clientProgram')},{value:'template',label:m('myTemplate')}]}/></div>

    {workflow==='client'?<ClientProgramEditor workspaceId={workspaceId} clients={clientOptions}/>:<>
      <div className="card">
        <div className="row between">
          <div><div className="lbl2">{m('templateTitle')}</div><div className="ss">{m('templateSubtitle')}</div></div>
          <Button size="sm" icon="pencil" onClick={()=>nav('/plan')}>{m('edit')}</Button>
        </div>
        {err?<div className="small" style={{color:'var(--red)',marginTop:10}}>{err}</div>:preview?<div className="grid2" style={{marginTop:12}}>
          <div className="stat"><div className="n">{preview.days?.length||0}</div><div className="l">{m('trainingDays')}</div></div>
          <div className="stat"><div className="n">{(preview.days||[]).reduce((n,x)=>n+Number(x.exercises||0),0)}</div><div className="l">{m('exercisesInPlan')}</div></div>
          <div className="stat"><div className="n">{preview.customExercises||0}</div><div className="l">{m('customExercises')}</div></div>
          <div className="stat"><div className="n">{preview.rev||0}</div><div className="l">{m('profileRevision')}</div></div>
        </div>:<div className="small muted" style={{marginTop:10}}>{m('loadingPlan')}</div>}
      </div>

      <div className="card">
        <div className="lbl2">{m('assignTemplate')}</div>
        <select className="field" style={{marginTop:10}} value={clientId} onChange={e=>setClientId(e.target.value)}>
          <option value="">{m('selectClient')}</option>
          {clientOptions.map(c=><option key={c.id||c.user_id} value={c.id||c.user_id}>{c.display_name||c.name||c.email||m('client')}</option>)}
        </select>
        <Button variant="primary" style={{marginTop:10}} disabled={busy||!clientId||!workspaceId} onClick={publish}>{busy?m('assigning'):m('assignMyTemplate')}</Button>
      </div>

      {clientId&&<Section title={m('currentProgram',selectedClient?.display_name||selectedClient?.name||m('client'))}>
        {assignmentLoading?<Row title={m('checkingAssignment')}/>:assignment?<Row icon="calendar" iconTint="var(--acc)" title={assignment.name||m('program')} subtitle={m('versionPublished',assignment.version_number||1,publishedSuffix,fmtDate(assignment.published_at))} value={`${assignment.days?.length||0} ${m('days')}`}/>:<Row title={m('noActiveProgram')} subtitle={m('syncAfterPublish')}/>} 
      </Section>}

      <Section title={m('willAssign')}>
        {(preview?.days||[]).map((d,i)=><Row key={`${d.weekday}:${d.routineId}:${i}`} icon="calendar" title={d.name||m('day',i+1)} subtitle={m('weekdayExercises',d.weekday,d.exercises||0)}/>) }
        {preview&&!preview.days?.length&&<Row title={m('emptyTemplate')} subtitle={m('editAddDays')}/>} 
      </Section>
    </>}
  </div>
}