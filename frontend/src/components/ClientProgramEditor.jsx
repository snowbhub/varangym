import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { CATALOGUE, EXIDX } from '../lib/exercises.js'
import { ukExerciseName } from '../lib/uk-exercise-name.js'
import { popularExerciseName } from '../lib/exercise-popular-name.js'
import { useUI } from '../store/useUI.js'
import { Thumb } from './Media.jsx'
import { Button, Row, Section } from './ui.jsx'

const WD=['Нд','Пн','Вт','Ср','Чт','Пт','Сб']
const titleOf=e=>popularExerciseName(e?.n||'','uk')||ukExerciseName(e?.n||'')||e?.n||e?.id||'Вправа'
const genderOf=e=>/\(female\)\s*$/i.test(e?.n||'')?'female':/\(male\)\s*$/i.test(e?.n||'')?'male':'unisex'
const blankDay=()=>({weekday:1,sequence:0,title:'Тренування',exercises:[]})
const normEx=e=>{
  const catalogue=EXIDX[e.id]
  return {id:e.id,name:catalogue?titleOf(catalogue):(e.name||titleOf(e)),sets:Number(e.sets||3),reps:Number(e.reps||10),weight:Number(e.weight||0),restSec:Number(e.restSec||90),note:e.note||''}
}

export default function ClientProgramEditor({workspaceId,clients=[]}){
  const toast=useUI(s=>s.toast)
  const options=useMemo(()=>clients.filter(c=>c.id||c.user_id),[clients])
  const [clientId,setClientId]=useState('')
  const [clientBody,setClientBody]=useState('male')
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
      const qs=`workspaceId=${encodeURIComponent(workspaceId)}&clientId=${encodeURIComponent(clientId)}`
      const [programResult,stateResult]=await Promise.allSettled([
        api(`/api/profile-plan/client-program?${qs}`),
        api(`/api/insights/clients/${encodeURIComponent(clientId)}/state?workspaceId=${encodeURIComponent(workspaceId)}`)
      ])
      if(programResult.status!=='fulfilled')throw programResult.reason
      const d=programResult.value
      setProgram(d.program||null)
      setName(d.program?.name||`VARANGYM · ${options.find(x=>(x.id||x.user_id)===clientId)?.display_name||'Клієнт'}`)
      setDays((d.days?.length?d.days:[blankDay()]).map(x=>({...x,exercises:(x.exercises||[]).map(normEx)})))
      if(stateResult.status==='fulfilled')setClientBody(stateResult.value?.state?.body==='female'?'female':'male')
      else setClientBody('male')
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
  const compatible=CATALOGUE.filter(e=>{const g=genderOf(e);return g==='unisex'||g===clientBody})
  const found=needle?compatible.filter(e=>`${e.n} ${titleOf(e)} ${e.bp||''} ${e.eq||''} ${e.tg||''}`.toLowerCase().includes(needle)).slice(0,24):[]
  const client=options.find(x=>(x.id||x.user_id)===clientId)
  const exerciseCount=days.reduce((n,d)=>n+(d.exercises?.length||0),0)

  if(!workspaceId)return <div className="card"><div className="lbl2">Програма клієнта</div><div className="empty">Немає доступного workspace. Вибери Coach/Business workspace або перевір роль.</div></div>
  if(!options.length)return <div className="card"><div className="lbl2">Програма клієнта</div><div className="empty">Клієнтів ще немає. Спочатку привʼяжи клієнта кодом.</div></div>

  return <div style={{display:'grid',gap:12}}>
    <div className="card">
      <div className="row between" style={{alignItems:'flex-start'}}>
        <div><div className="lbl2">Програма конкретного клієнта</div><div className="big" style={{fontSize:24}}>{client?.display_name||client?.name||'Клієнт'}</div><div className="ss">Окрема версія програми саме для цього профілю. Особистий план тренера не змінюється.</div></div>
        <span className="tag acc">{clientBody==='female'?'♀ Жінка':'♂ Чоловік'}</span>
      </div>
      <select className="field" style={{marginTop:10}} value={clientId} onChange={e=>setClientId(e.target.value)}>
        <option value="">Вибери клієнта…</option>
        {options.map(c=><option key={c.id||c.user_id} value={c.id||c.user_id}>{c.display_name||c.name||c.email||'Клієнт'}</option>)}
      </select>
      <input className="field" style={{marginTop:9}} value={name} onChange={e=>setName(e.target.value)} placeholder="Назва програми"/>
      <div className="grid2" style={{marginTop:10}}>
        <div className="stat"><div className="n">{days.length}</div><div className="l">днів</div></div>
        <div className="stat"><div className="n">{exerciseCount}</div><div className="l">вправ</div></div>
      </div>
      <div className="small dim" style={{marginTop:8}}>{loading?'Завантаження…':program?`Поточна версія ${program.version_number||1} · опубліковано ${program.published_at?new Date(program.published_at).toLocaleDateString('uk-UA'):'—'}`:'Активної програми ще немає — створюється нова.'}</div>
    </div>

    <div className="chips" style={{marginBottom:0}}>
      {days.map((d,i)=><button key={i} className={'chip '+(activeDay===i?'on':'')} onClick={()=>setActiveDay(i)}>{WD[d.weekday]||'?'} · {i+1} · {d.exercises?.length||0}</button>)}
      <button className="chip" onClick={addDay}>+ День</button>
    </div>

    {days.map((d,di)=>di!==activeDay?null:<div className="card" key={di}>
      <div className="row between"><div><div className="lbl2">День {di+1}</div><div className="ss">{d.exercises?.length||0} вправ</div></div>{days.length>1&&<Button size="sm" variant="danger" onClick={()=>{removeDay(di);setActiveDay(0)}}>Видалити день</Button>}</div>
      <div className="grid2" style={{marginTop:10}}>
        <select className="field" value={d.weekday} onChange={e=>mutateDay(di,{weekday:Number(e.target.value)})}>{WD.map((x,i)=><option key={i} value={i}>{x}</option>)}</select>
        <input className="field" value={d.title} onChange={e=>mutateDay(di,{title:e.target.value})} placeholder="Назва тренування"/>
      </div>
      <div style={{marginTop:12}}>
        {(d.exercises||[]).map((e,ei)=>{
          const source=EXIDX[e.id]
          return <div className="card" key={`${e.id}:${ei}`} style={{margin:'8px 0',padding:12}}>
            <div className="row between"><div className="row" style={{gap:10,minWidth:0}}>{source&&<Thumb ex={source} bodyOverride={clientBody}/>}<div style={{minWidth:0}}><div className="ttl">{source?titleOf(source):(e.name||e.id)}</div><div className="ss">{source?`${source.tg||source.bp||'—'} · ${source.eq||'—'}`:e.id}</div></div></div><button className="iconbtn" style={{color:'var(--red)'}} onClick={()=>removeExercise(di,ei)}>×</button></div>
            <div className="grid2" style={{marginTop:9}}>
              <label className="small muted">Підходи<input className="field" type="number" min="1" value={e.sets} onChange={x=>updateExercise(di,ei,'sets',x.target.value)}/></label>
              <label className="small muted">Повторення<input className="field" type="number" min="1" value={e.reps} onChange={x=>updateExercise(di,ei,'reps',x.target.value)}/></label>
              <label className="small muted">Вага, кг<input className="field" type="number" min="0" step="0.5" value={e.weight} onChange={x=>updateExercise(di,ei,'weight',x.target.value)}/></label>
              <label className="small muted">Відпочинок, сек<input className="field" type="number" min="0" value={e.restSec} onChange={x=>updateExercise(di,ei,'restSec',x.target.value)}/></label>
            </div>
            <input className="field" style={{marginTop:8}} value={e.note||''} onChange={x=>updateExercise(di,ei,'note',x.target.value)} placeholder="Примітка тренера"/>
          </div>
        })}
        {!d.exercises?.length&&<div className="empty">У цьому дні ще немає вправ.</div>}
      </div>
      <div style={{marginTop:12}}>
        <div className="row between"><div className="lbl2">Додати вправу</div><span className="tag">{compatible.length} доступно</span></div>
        <div className="small dim" style={{margin:'4px 0 8px'}}>Каталог автоматично не показує протилежний статевий варіант анімації для профілю клієнта.</div>
        <input className="field" value={q} onChange={e=>setQ(e.target.value)} placeholder="Пошук UA / EN / мʼяз / обладнання…"/>
      </div>
      {found.length>0&&<Section title="Результати пошуку">{found.map(ex=><Row key={ex.id} title={titleOf(ex)} subtitle={`${ex.tg||ex.bp||'—'} · ${ex.eq||'—'}`} value="+" onClick={()=>addExercise(ex)}><span style={{marginRight:10}}><Thumb ex={ex} bodyOverride={clientBody}/></span></Row>)}</Section>}
      {needle&&found.length===0&&<div className="empty">Нічого не знайдено серед сумісних вправ.</div>}
    </div>)}

    <Button variant="primary" disabled={busy||loading||!clientId} onClick={save}>{busy?'Публікую…':'Зберегти й призначити клієнту'}</Button>
  </div>
}
