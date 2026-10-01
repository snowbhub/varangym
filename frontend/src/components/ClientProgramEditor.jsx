import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { CATALOGUE, EXIDX } from '../lib/exercises.js'
import { dateLocale, exerciseNameFor, exerciseNameSearchText, useLang } from '../lib/i18n.js'
import { managementText as m } from '../lib/management-copy.js'
import { useUI } from '../store/useUI.js'
import { Thumb } from './Media.jsx'
import { Button, Row, Section } from './ui.jsx'

const genderOf=e=>/\(female\)\s*$/i.test(e?.n||'')?'female':/\(male\)\s*$/i.test(e?.n||'')?'male':'unisex'
const blankDay=()=>({weekday:1,sequence:0,title:'',exercises:[]})
const titleOf=e=>exerciseNameFor(e)||e?.n||e?.id||m('exercise')
const normEx=e=>{
  const catalogue=EXIDX[e.id]
  return {id:e.id,name:catalogue?titleOf(catalogue):(e.name||titleOf(e)),sets:Number(e.sets||3),reps:Number(e.reps||10),weight:Number(e.weight||0),restSec:Number(e.restSec||90),note:e.note||''}
}
const fmtDate=v=>{if(!v)return'—';try{return new Date(v).toLocaleDateString(dateLocale())}catch{return'—'}}

export default function ClientProgramEditor({workspaceId,clients=[]}){
  const langV=useLang()
  const toast=useUI(s=>s.toast)
  const options=useMemo(()=>clients.filter(c=>c.id||c.user_id),[clients])
  const [clientId,setClientId]=useState('')
  const [clientBody,setClientBody]=useState('male')
  const [clientUnit,setClientUnit]=useState('kg')
  const [program,setProgram]=useState(null)
  const [name,setName]=useState('VARANGYM Program')
  const [days,setDays]=useState([blankDay()])
  const [activeDay,setActiveDay]=useState(0)
  const [q,setQ]=useState('')
  const [loading,setLoading]=useState(false)
  const [busy,setBusy]=useState(false)
  const weekdayLabels=useMemo(()=>Array.from({length:7},(_,i)=>new Intl.DateTimeFormat(dateLocale(),{weekday:'short'}).format(new Date(2024,0,7+i))),[langV])

  useEffect(()=>{
    if(!options.length){setClientId('');return}
    if(!options.some(x=>(x.id||x.user_id)===clientId))setClientId(options[0].id||options[0].user_id)
  },[options,clientId])

  const load=async()=>{
    if(!workspaceId||!clientId)return
    setLoading(true)
    try{
      const qs=`workspaceId=${encodeURIComponent(workspaceId)}&clientId=${encodeURIComponent(clientId)}`
      const [programResult,stateResult]=await Promise.allSettled([
        api(`/api/profile-plan/client-program?${qs}`),
        api(`/api/insights/clients/${encodeURIComponent(clientId)}/state?workspaceId=${encodeURIComponent(workspaceId)}`)
      ])
      if(programResult.status!=='fulfilled')throw programResult.reason
      const d=programResult.value
      const clientName=options.find(x=>(x.id||x.user_id)===clientId)?.display_name||m('client')
      setProgram(d.program||null)
      setName(d.program?.name||`VARANGYM · ${clientName}`)
      setDays((d.days?.length?d.days:[blankDay()]).map(x=>({...x,title:x.title||m('workout'),exercises:(x.exercises||[]).map(normEx)})))
      if(stateResult.status==='fulfilled'){
        const profile=stateResult.value?.state||{}
        setClientBody(profile.body==='female'?'female':'male')
        setClientUnit(profile.unit==='lb'?'lb':'kg')
      }else{
        setClientBody('male');setClientUnit('kg')
      }
      setActiveDay(0);setQ('')
    }catch(e){toast(e.message||m('couldNotLoadClientProgram'))}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[workspaceId,clientId])

  const mutateDay=(idx,patch)=>setDays(ds=>ds.map((d,i)=>i===idx?{...d,...patch}:d))
  const addDay=()=>setDays(ds=>[...ds,{...blankDay(),sequence:ds.length,title:`${m('workout')} ${ds.length+1}`}])
  const removeDay=idx=>setDays(ds=>ds.length===1?ds:ds.filter((_,i)=>i!==idx))
  const addExercise=ex=>{
    const idx=Math.min(activeDay,days.length-1)
    setDays(ds=>ds.map((d,i)=>i===idx?{...d,exercises:[...(d.exercises||[]),normEx(ex)]}:d))
    setQ('')
  }
  const updateExercise=(di,ei,key,value)=>setDays(ds=>ds.map((d,i)=>i!==di?d:{...d,exercises:d.exercises.map((e,j)=>j!==ei?e:{...e,[key]:value})}))
  const removeExercise=(di,ei)=>setDays(ds=>ds.map((d,i)=>i!==di?d:{...d,exercises:d.exercises.filter((_,j)=>j!==ei)}))
  const save=async()=>{
    if(!workspaceId||!clientId)return toast(m('chooseClient'))
    if(!days.some(d=>d.exercises?.length))return toast(m('addExerciseFirst'))
    setBusy(true)
    try{
      const clean=days.map((d,di)=>({weekday:Number(d.weekday),sequence:di,title:d.title||`${m('workout')} ${di+1}`,exercises:(d.exercises||[]).map(e=>({id:e.id,sets:Math.max(1,Number(e.sets)||1),reps:Math.max(1,Number(e.reps)||1),weight:Math.max(0,Number(e.weight)||0),restSec:Math.max(0,Number(e.restSec)||0),note:e.note||''}))}))
      const d=await api('/api/profile-plan/publish-custom',{method:'POST',body:JSON.stringify({workspaceId,clientId,name:name.trim()||'VARANGYM Program',days:clean})})
      toast(m('programPublished',d.versionNumber||1))
      await load()
    }catch(e){toast(e.message||m('couldNotPublishProgram'))}
    finally{setBusy(false)}
  }

  const needle=q.trim().toLocaleLowerCase()
  const compatible=CATALOGUE.filter(e=>{const g=genderOf(e);return g==='unisex'||g===clientBody})
  const found=needle?compatible.filter(e=>`${exerciseNameSearchText(e)} ${e.bp||''} ${e.eq||''} ${e.tg||''}`.toLocaleLowerCase().includes(needle)).slice(0,24):[]
  const client=options.find(x=>(x.id||x.user_id)===clientId)
  const exerciseCount=days.reduce((n,d)=>n+(d.exercises?.length||0),0)

  if(!workspaceId)return <div className="card"><div className="lbl2">{m('clientProgram')}</div><div className="empty">{m('noWorkspace')}</div></div>
  if(!options.length)return <div className="card"><div className="lbl2">{m('clientProgram')}</div><div className="empty">{m('noClients')}</div></div>

  return <div style={{display:'grid',gap:12}}>
    <div className="card">
      <div className="row between" style={{alignItems:'flex-start'}}>
        <div><div className="lbl2">{m('specificClientProgram')}</div><div className="big" style={{fontSize:24}}>{client?.display_name||client?.name||m('client')}</div><div className="ss">{m('personalPlanUnchanged')}</div></div>
        <span className="tag acc">{clientBody==='female'?`♀ ${m('female')}`:`♂ ${m('male')}`}</span>
      </div>
      <select className="field" style={{marginTop:10}} value={clientId} onChange={e=>setClientId(e.target.value)}>
        <option value="">{m('selectClient')}</option>
        {options.map(c=><option key={c.id||c.user_id} value={c.id||c.user_id}>{c.display_name||c.name||c.email||m('client')}</option>)}
      </select>
      <input className="field" style={{marginTop:9}} value={name} onChange={e=>setName(e.target.value)} placeholder={m('programName')}/>
      <div className="grid2" style={{marginTop:10}}>
        <div className="stat"><div className="n">{days.length}</div><div className="l">{m('days')}</div></div>
        <div className="stat"><div className="n">{exerciseCount}</div><div className="l">{m('exercisesInPlan')}</div></div>
      </div>
      <div className="small dim" style={{marginTop:8}}>{loading?m('loadingPlan'):program?m('currentVersion',program.version_number||1,fmtDate(program.published_at)):m('noActiveYet')}</div>
    </div>

    <div className="chips" style={{marginBottom:0}}>
      {days.map((d,i)=><button key={i} className={'chip '+(activeDay===i?'on':'')} onClick={()=>setActiveDay(i)}>{weekdayLabels[d.weekday]||'?'} · {i+1} · {d.exercises?.length||0}</button>)}
      <button className="chip" onClick={addDay}>{m('addDay')}</button>
    </div>

    {days.map((d,di)=>di!==activeDay?null:<div className="card" key={di}>
      <div className="row between"><div><div className="lbl2">{m('day',di+1)}</div><div className="ss">{d.exercises?.length||0} {m('exercisesInPlan')}</div></div>{days.length>1&&<Button size="sm" variant="danger" onClick={()=>{removeDay(di);setActiveDay(0)}}>{m('deleteDay')}</Button>}</div>
      <div className="grid2" style={{marginTop:10}}>
        <select className="field" value={d.weekday} onChange={e=>mutateDay(di,{weekday:Number(e.target.value)})}>{weekdayLabels.map((x,i)=><option key={i} value={i}>{x}</option>)}</select>
        <input className="field" value={d.title} onChange={e=>mutateDay(di,{title:e.target.value})} placeholder={m('workoutName')}/>
      </div>
      <div style={{marginTop:12}}>
        {(d.exercises||[]).map((e,ei)=>{
          const source=EXIDX[e.id]
          return <div className="card" key={`${e.id}:${ei}`} style={{margin:'8px 0',padding:12}}>
            <div className="row between"><div className="row" style={{gap:10,minWidth:0}}>{source&&<Thumb ex={source} bodyOverride={clientBody}/>}<div style={{minWidth:0}}><div className="ttl">{source?titleOf(source):(e.name||e.id)}</div><div className="ss">{source?`${source.tg||source.bp||'—'} · ${source.eq||'—'}`:e.id}</div></div></div><button className="iconbtn" style={{color:'var(--red)'}} onClick={()=>removeExercise(di,ei)}>×</button></div>
            <div className="grid2" style={{marginTop:9}}>
              <label className="small muted">{m('sets')}<input className="field" type="number" min="1" value={e.sets} onChange={x=>updateExercise(di,ei,'sets',x.target.value)}/></label>
              <label className="small muted">{m('reps')}<input className="field" type="number" min="1" value={e.reps} onChange={x=>updateExercise(di,ei,'reps',x.target.value)}/></label>
              <label className="small muted">{m('weight',clientUnit)}<input className="field" type="number" min="0" step="0.5" value={e.weight} onChange={x=>updateExercise(di,ei,'weight',x.target.value)}/></label>
              <label className="small muted">{m('rest')}<input className="field" type="number" min="0" value={e.restSec} onChange={x=>updateExercise(di,ei,'restSec',x.target.value)}/></label>
            </div>
            <input className="field" style={{marginTop:8}} value={e.note||''} onChange={x=>updateExercise(di,ei,'note',x.target.value)} placeholder={m('coachNote')}/>
          </div>
        })}
        {!d.exercises?.length&&<div className="empty">{m('noExercisesDay')}</div>}
      </div>
      <div style={{marginTop:12}}>
        <div className="row between"><div className="lbl2">{m('addExercise')}</div><span className="tag">{m('available',compatible.length)}</span></div>
        <div className="small dim" style={{margin:'4px 0 8px'}}>{m('catalogueBodyNote')}</div>
        <input className="field" value={q} onChange={e=>setQ(e.target.value)} placeholder={m('searchExercises')}/>
      </div>
      {found.length>0&&<Section title={m('searchResults')}>{found.map(ex=><Row key={ex.id} title={titleOf(ex)} subtitle={`${ex.tg||ex.bp||'—'} · ${ex.eq||'—'}`} value="+" onClick={()=>addExercise(ex)}><span style={{marginRight:10}}><Thumb ex={ex} bodyOverride={clientBody}/></span></Row>)}</Section>}
      {needle&&found.length===0&&<div className="empty">{m('nothingFound')}</div>}
    </div>)}

    <Button variant="primary" disabled={busy||loading||!clientId} onClick={save}>{busy?m('publishing'):m('saveAssign')}</Button>
  </div>
}