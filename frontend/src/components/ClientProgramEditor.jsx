import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { CATALOGUE } from '../lib/exercises.js'
import { ukExerciseName } from '../lib/uk-exercise-name.js'
import { popularExerciseName } from '../lib/exercise-popular-name.js'
import { useUI } from '../store/useUI.js'
import { Button, Row, Section } from './ui.jsx'

const WD=['Нд','Пн','Вт','Ср','Чт','Пт','Сб']
const titleOf=e=>popularExerciseName(e?.n||'','uk')||ukExerciseName(e?.n||'')||e?.n||e?.id||'Вправа'
const blankDay=()=>({weekday:1,sequence:0,title:'Тренування',exercises:[]})
const normEx=e=>({id:e.id,name:e.name||titleOf(e),sets:Number(e.sets||3),reps:Number(e.reps||10),weight:Number(e.weight||0),restSec:Number(e.restSec||90),note:e.note||''})

export default function ClientProgramEditor({workspaceId,clients=[]}){
  const toast=useUI(s=>s.toast)
  const options=useMemo(()=>clients.filter(c=>c.id||c.user_id),[clients])
  const [clientId,setClientId]=useState('')
  const [program,setProgram]=useState(null)
  const [name,setName]=useState('VARANGYM Program')
  const [days,setDays]=useState([blankDay()])
  const [activeDay,setActiveDay]=useState(0)
  const [q,setQ]=useState('')
  const [loading,setLoading]=useState(false)
  const [busy,setBusy]=useState(false)

  useEffect(()=>{
    if(!options.length){setClientId('');return}
    if(!options.some(x=>(x.id||x.user_id)===clientId))setClientId(options[0].id||options[0].user_id)
  },[options,clientId])

  const load=async()=>{
    if(!workspaceId||!clientId)return
    setLoading(true)
    try{
      const d=await api(`/api/profile-plan/client-program?workspaceId=${encodeURIComponent(workspaceId)}&clientId=${encodeURIComponent(clientId)}`)
      setProgram(d.program||null)
      setName(d.program?.name||`VARANGYM · ${options.find(x=>(x.id||x.user_id)===clientId)?.display_name||'Клієнт'}`)
      setDays((d.days?.length?d.days:[blankDay()]).map(x=>({...x,exercises:(x.exercises||[]).map(normEx)})))
      setActiveDay(0);setQ('')
    }catch(e){toast(e.message||'Не вдалося завантажити програму клієнта')}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[workspaceId,clientId])

  const mutateDay=(idx,patch)=>setDays(ds=>ds.map((d,i)=>i===idx?{...d,...patch}:d))
  const addDay=()=>setDays(ds=>[...ds,{...blankDay(),sequence:ds.length,title:`Тренування ${ds.length+1}`}])
  const removeDay=idx=>setDays(ds=>ds.length===1?ds:ds.filter((_,i)=>i!==idx))
  const addExercise=ex=>{
    const idx=Math.min(activeDay,days.length-1)
    setDays(ds=>ds.map((d,i)=>i===idx?{...d,exercises:[...(d.exercises||[]),normEx(ex)]}:d))
    setQ('')
  }
  const updateExercise=(di,ei,key,value)=>setDays(ds=>ds.map((d,i)=>i!==di?d:{...d,exercises:d.exercises.map((e,j)=>j!==ei?e:{...e,[key]:value})}))
  const removeExercise=(di,ei)=>setDays(ds=>ds.map((d,i)=>i!==di?d:{...d,exercises:d.exercises.filter((_,j)=>j!==ei)}))
  const save=async()=>{
    if(!workspaceId||!clientId)return toast('Вибери клієнта')
    if(!days.some(d=>d.exercises?.length))return toast('Додай хоча б одну вправу')
    setBusy(true)
    try{
      const clean=days.map((d,di)=>({weekday:Number(d.weekday),sequence:di,title:d.title||`Тренування ${di+1}`,exercises:(d.exercises||[]).map(e=>({id:e.id,sets:Math.max(1,Number(e.sets)||1),reps:Math.max(1,Number(e.reps)||1),weight:Math.max(0,Number(e.weight)||0),restSec:Math.max(0,Number(e.restSec)||0),note:e.note||''}))}))
      const d=await api('/api/profile-plan/publish-custom',{method:'POST',body:JSON.stringify({workspaceId,clientId,name:name.trim()||'VARANGYM Program',days:clean})})
      toast(`Програму опубліковано · v${d.versionNumber||1}`)
      await load()
    }catch(e){toast(e.message||'Не вдалося опублікувати програму')}
    finally{setBusy(false)}
  }

  const needle=q.trim().toLowerCase()
  const found=needle?CATALOGUE.filter(e=>`${e.n} ${titleOf(e)} ${e.bp||''} ${e.eq||''} ${e.tg||''}`.toLowerCase().includes(needle)).slice(0,20):[]
  const client=options.find(x=>(x.id||x.user_id)===clientId)

  return <div style={{display:'grid',gap:12}}>
    <div className="card">
      <div className="lbl2">Програма конкретного клієнта</div>
      <div className="ss">Це окремий редактор клієнта. Він не переписує твій особистий план: після збереження створюється нова версія програми саме для вибраного клієнта.</div>
      <select className="field" style={{marginTop:10}} value={clientId} onChange={e=>setClientId(e.target.value)}>
        <option value="">Вибери клієнта…</option>
        {options.map(c=><option key={c.id||c.user_id} value={c.id||c.user_id}>{c.display_name||c.name||c.email||'Клієнт'}</option>)}
      </select>
      <input className="field" style={{marginTop:9}} value={name} onChange={e=>setName(e.target.value)} placeholder="Назва програми"/>
      <div className="small dim" style={{marginTop:8}}>{loading?'Завантаження…':program?`Поточна версія ${program.version_number||1} · ${client?.display_name||'клієнт'}`:'Активної програми ще немає — створюється нова.'}</div>
    </div>

    <div className="chips" style={{marginBottom:0}}>
      {days.map((d,i)=><button key={i} className={'chip '+(activeDay===i?'on':'')} onClick={()=>setActiveDay(i)}>{WD[d.weekday]||'?'} · {i+1}</button>)}
      <button className="chip" onClick={addDay}>+ День</button>
    </div>

    {days.map((d,di)=>di!==activeDay?null:<div className="card" key={di}>
      <div className="row between"><div className="lbl2">День {di+1}</div>{days.length>1&&<Button size="sm" variant="danger" onClick={()=>{removeDay(di);setActiveDay(0)}}>Видалити день</Button>}</div>
      <div className="grid2" style={{marginTop:10}}>
        <select className="field" value={d.weekday} onChange={e=>mutateDay(di,{weekday:Number(e.target.value)})}>{WD.map((x,i)=><option key={i} value={i}>{x}</option>)}</select>
        <input className="field" value={d.title} onChange={e=>mutateDay(di,{title:e.target.value})} placeholder="Назва тренування"/>
      </div>
      <div style={{marginTop:12}}>
        {(d.exercises||[]).map((e,ei)=><div className="card" key={`${e.id}:${ei}`} style={{margin:'8px 0',padding:12}}>
          <div className="row between"><div><div className="ttl">{e.name||e.id}</div><div className="ss">{e.id}</div></div><button className="iconbtn" style={{color:'var(--red)'}} onClick={()=>removeExercise(di,ei)}>×</button></div>
          <div className="grid2" style={{marginTop:9}}>
            <label className="small muted">Підходи<input className="field" type="number" min="1" value={e.sets} onChange={x=>updateExercise(di,ei,'sets',x.target.value)}/></label>
            <label className="small muted">Повторення<input className="field" type="number" min="1" value={e.reps} onChange={x=>updateExercise(di,ei,'reps',x.target.value)}/></label>
            <label className="small muted">Вага, кг<input className="field" type="number" min="0" step="0.5" value={e.weight} onChange={x=>updateExercise(di,ei,'weight',x.target.value)}/></label>
            <label className="small muted">Відпочинок, сек<input className="field" type="number" min="0" value={e.restSec} onChange={x=>updateExercise(di,ei,'restSec',x.target.value)}/></label>
          </div>
          <input className="field" style={{marginTop:8}} value={e.note||''} onChange={x=>updateExercise(di,ei,'note',x.target.value)} placeholder="Примітка тренера"/>
        </div>)}
        {!d.exercises?.length&&<div className="empty">У цьому дні ще немає вправ.</div>}
      </div>
      <input className="field" style={{marginTop:10}} value={q} onChange={e=>setQ(e.target.value)} placeholder="Додати вправу: пошук UA / EN / мʼяз / обладнання…"/>
      {found.length>0&&<Section title="Результати пошуку">{found.map(ex=><Row key={ex.id} icon="dumbbell" title={titleOf(ex)} subtitle={`${ex.bp||'—'} · ${ex.eq||'—'} · ${ex.tg||'—'}`} value="+" onClick={()=>addExercise(ex)}/>)}</Section>}
    </div>)}

    <Button variant="primary" disabled={busy||loading||!clientId} onClick={save}>{busy?'Публікую…':'Зберегти й призначити клієнту'}</Button>
  </div>
}
