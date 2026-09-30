import { useMemo, useState } from 'react'
import { EXIDX } from '../lib/exercises.js'
import { exerciseNameFor } from '../lib/i18n.js'
import { fmtNum } from '../lib/format.js'
import Icon from './Icon.jsx'
import { Button, Segmented } from './ui.jsx'
import { isWarmupRow } from '../lib/workout-model.js'

const n=v=>Number(v)||0
const when=w=>n(w?.start)||new Date(w?.d||0).getTime()
const done=s=>s?.done===true&&!isWarmupRow(s)
const duration=w=>{
  const ms=Math.max(0,n(w?.end)-n(w?.start))
  if(!ms)return'—'
  const min=Math.round(ms/60000)
  return min>=60?`${Math.floor(min/60)} г ${min%60} хв`:`${min} хв`
}
const setText=(s,unit)=>{
  if(n(s.sec)>0)return`${fmtNum(s.sec)} c`
  if(n(s.distance)>0)return`${fmtNum(s.distance)} м`
  if(n(s.w)>0&&n(s.r)>0)return`${fmtNum(s.w)} ${unit} × ${fmtNum(s.r)}`
  if(n(s.r)>0)return`${fmtNum(s.r)} повт.`
  if(n(s.w)>0)return`${fmtNum(s.w)} ${unit}`
  return'виконано'
}

export default function ClientHistoryReadOnly({state}){
  const S=state||{},unit=S.unit||'kg'
  const custom=useMemo(()=>new Map((S.customEx||[]).map(x=>[String(x.id),x])),[S.customEx])
  const all=useMemo(()=>[...(S.workouts||[])].sort((a,b)=>when(b)-when(a)),[S.workouts])
  const [range,setRange]=useState(90)
  const [open,setOpen]=useState('')
  const cutoff=range?Date.now()-range*86400000:0
  const rows=all.filter(w=>!cutoff||when(w)>=cutoff)
  const exName=e=>EXIDX[e.id]?exerciseNameFor(EXIDX[e.id]):custom.get(String(e.id))?.n||e?.muscleSnapshot?.n||e?.n||e?.id||'Вправа'
  const volume=w=>(w.entries||[]).reduce((a,e)=>a+(e.sets||[]).filter(done).reduce((s,x)=>s+n(x.w)*Math.max(1,n(x.r)),0),0)
  const sets=w=>(w.entries||[]).reduce((a,e)=>a+(e.sets||[]).filter(done).length,0)

  return <div className="card">
    <div className="row between" style={{alignItems:'flex-end',gap:10}}><div><h2 style={{margin:0}}>Історія по днях</h2><div className="small dim">Повний read-only drill-down кожного тренування</div></div><span className="tag acc">{rows.length}</span></div>
    <div style={{marginTop:10}}><Segmented className="seg-range" value={range} onChange={setRange} options={[{value:30,label:'1M'},{value:90,label:'3M'},{value:365,label:'1Y'},{value:0,label:'Усе'}]}/></div>
    <div className="list" style={{marginTop:10}}>{rows.map((w,i)=>{
      const key=String(w.id||`${w.d}:${w.start}:${i}`),expanded=open===key
      return <div key={key} className="card" style={{margin:'0 0 8px',padding:12}}>
        <button className="row between" style={{width:'100%',textAlign:'left',background:'none',border:0,padding:0,color:'inherit'}} onClick={()=>setOpen(expanded?'':key)}>
          <span className="row" style={{gap:10,minWidth:0}}><span className="lrow-i" style={{'--tint':'var(--acc)'}}><Icon name="dumbbell"/></span><span style={{minWidth:0}}><b>{w.name||'Тренування'}</b><span className="small dim" style={{display:'block'}}>{w.d||new Date(when(w)).toLocaleDateString('uk-UA')} · {duration(w)} · {sets(w)} підходів</span></span></span>
          <span style={{textAlign:'right'}}><b>{volume(w)>0?`${fmtNum(Math.round(volume(w)))} ${unit}`:'—'}</b><span className="small dim" style={{display:'block'}}>{(w.entries||[]).length} вправ</span></span>
        </button>
        {expanded&&<div style={{marginTop:12,borderTop:'var(--hair) solid var(--sep)',paddingTop:8}}>{(w.entries||[]).map((e,ei)=>{
          const finished=(e.sets||[]).filter(done)
          return <div key={`${e.id}:${ei}`} style={{padding:'9px 0',borderBottom:'var(--hair) solid var(--sep)'}}><div className="row between"><b>{exName(e)}</b><span className="small dim">{finished.length} підх.</span></div>{finished.length?<div className="small" style={{marginTop:5,lineHeight:1.7}}>{finished.map((s,si)=><span key={si} className="tag" style={{margin:'0 5px 5px 0'}}>{si+1}. {setText(s,unit)}{s.rir!=null?` · RIR ${s.rir}`:s.rpe!=null?` · RPE ${s.rpe}`:''}</span>)}</div>:<div className="small dim">Немає завершених робочих підходів</div>}</div>})}</div>}
      </div>
    })}{!rows.length&&<div className="muted small">У цьому періоді немає тренувань.</div>}</div>
    {rows.length>12&&<div className="small dim">Показано всі {rows.length} тренувань за вибраний період.</div>}
  </div>
}
