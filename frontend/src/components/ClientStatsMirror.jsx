import { useMemo, useState } from 'react'
import { EXIDX } from '../lib/exercises.js'
import { lastBW, streakWeeks } from '../lib/history.js'
import { fmtNum, todayISO, weekStartOf } from '../lib/format.js'
import { t, exerciseNameFor } from '../lib/i18n.js'
import { loadOfWorkouts, muscleBalanceWindow, rankOf, MUSCLE_NAME } from '../lib/muscles.js'
import { isWarmupRow } from '../lib/workout-model.js'
import Heatmap from './Heatmap.jsx'
import BodyMap, { BodyMapLegend } from './BodyMap.jsx'
import LineChart from './LineChart.jsx'
import Icon from './Icon.jsx'
import { Segmented } from './ui.jsx'

const msDay=86400000
const ts=v=>Number(v?.t||new Date(v?.d||0).getTime())||0
const done=s=>s?.done===true&&!isWarmupRow(s)
const n=v=>Number(v)||0

function normalizedState(raw={}){
  return {
    ...raw,
    lang:raw.lang||'uk',unit:raw.unit||'kg',body:raw.body==='female'?'female':'male',weekStart:raw.weekStart??1,
    workouts:Array.isArray(raw.workouts)?raw.workouts:[],bodyweight:Array.isArray(raw.bodyweight)?raw.bodyweight:[],
    routines:Array.isArray(raw.routines)?raw.routines:[],customEx:Array.isArray(raw.customEx)?raw.customEx:[]
  }
}

function MuscleCard({S}){
  const [win,setWin]=useState(30)
  const inWin=muscleBalanceWindow(S.workouts,win,Date.now(),todayISO(),weekStartOf(S))
  const load=loadOfWorkouts(inWin,null)
  const {worked,missed}=rankOf(load)
  const max=worked.length?load[worked[0]]:1
  return <div className="card">
    <div className="row between"><h2 style={{margin:0}}>{t('Muscle balance')}</h2><span className="tag acc">{S.body==='female'?'♀':'♂'}</span></div>
    <Segmented className="seg-range" value={win} onChange={setWin} options={[{value:7,label:t('Week')},{value:30,label:'30d'},{value:90,label:'90d'},{value:0,label:t('All')}]} />
    {inWin.length?<>
      <BodyMap load={load} body={S.body}/><BodyMapLegend/>
      {worked.slice(0,5).map(m=><div className="mrow" key={m}><span className="nm">{t(MUSCLE_NAME[m])}</span><span className="bar"><i style={{width:Math.round((load[m]||0)/max*100)+'%'}}/></span><span className="v">{fmtNum(Math.round((load[m]||0)*10)/10)} {t('sets')}</span></div>)}
      {!!missed.length&&<><h4 className="sec" style={{marginTop:12}}>{t('Not trained in this period')}</h4><div className="mchips">{missed.map(m=><span key={m} className="mchip miss">{t(MUSCLE_NAME[m])}</span>)}</div></>}
    </>:<div className="muted small">{t('No workouts in this period yet.')}</div>}
  </div>
}

function exerciseProgress(S){
  const rows=new Map()
  for(const w of S.workouts){
    for(const e of w.entries||[]){
      const sets=(e.sets||[]).filter(done)
      if(!sets.length)continue
      const weighted=sets.some(s=>n(s.w)>0)
      const y=weighted?Math.max(...sets.map(s=>n(s.w))):Math.max(...sets.map(s=>n(s.r)))
      if(!(y>0))continue
      const rec=rows.get(e.id)||{id:e.id,points:[],count:0,weighted}
      rec.points.push({t:n(w.start)||new Date(w.d).getTime(),y,d:w.d});rec.count++;rec.weighted=rec.weighted||weighted;rows.set(e.id,rec)
    }
  }
  return [...rows.values()].sort((a,b)=>b.count-a.count)[0]||null
}

export default function ClientStatsMirror({state,client}){
  const S=useMemo(()=>normalizedState(state),[state])
  const [range,setRange]=useState(90)
  const now=Date.now(),workouts=S.workouts
  const monthW=workouts.filter(w=>String(w.d||'').slice(0,7)===todayISO().slice(0,7)).length
  const bwPts=S.bodyweight.filter(b=>range===0||ts(b)>now-range*msDay).map(b=>({t:ts(b),y:n(b.w),d:b.d}))
  const bw30=S.bodyweight.filter(b=>ts(b)>now-30*msDay)
  const bwDelta=bw30.length>1?n(bw30.at(-1).w)-n(bw30[0].w):null
  const ep=useMemo(()=>exerciseProgress(S),[S])
  const latest=[...workouts].sort((a,b)=>(n(b.start)||new Date(b.d).getTime())-(n(a.start)||new Date(a.d).getTime())).slice(0,8)
  return <>
    <div className="card" style={{marginBottom:12}}>
      <div className="lbl2">Статистика клієнта · read-only</div>
      <div className="big" style={{fontSize:27}}>{client?.display_name||client?.name||'Клієнт'}</div>
      <div className="ss">Це ті самі дані профілю, з яких клієнт бачить свою статистику у VARANGYM.</div>
    </div>
    <div className="tiles">
      <div className="tile"><div className="l"><Icon name="dumbbell"/>{t('Workouts')}</div><div className="v">{workouts.length}</div></div>
      <div className="tile"><div className="l"><Icon name="calendar"/>{t('This month')}</div><div className="v">{monthW}</div></div>
      <div className="tile"><div className="l"><Icon name="flame"/>{t('Week streak')}</div><div className="v">{streakWeeks(S)}</div></div>
      <div className="tile"><div className="l"><Icon name="scale"/>{t('Weight 30d')}</div><div className="v" style={{fontSize:22}}>{bwDelta==null?'—':`${bwDelta>0?'+':''}${fmtNum(bwDelta)} ${S.unit}`}</div></div>
    </div>
    <div className="card"><h2>{t('Activity — last 12 months')} <span className="dim" style={{textTransform:'none',letterSpacing:0}}>· {t('by time trained')}</span></h2><Heatmap S={S}/></div>
    {workouts.length>0&&<MuscleCard S={S}/>} 
    <div className="card">
      <div className="row between" style={{marginBottom:8}}><h2 style={{margin:0}}>{t('Body weight')}</h2><div className="row" style={{gap:8}}><span className="tag">{lastBW(S)?.w?`${fmtNum(lastBW(S).w)} ${S.unit}`:'—'}</span>{S.targetW&&<span className="tag acc">◎ {fmtNum(S.targetW)}</span>}</div></div>
      <Segmented className="seg-range" value={range} onChange={setRange} options={[{value:30,label:'1M'},{value:90,label:'3M'},{value:365,label:'1Y'},{value:0,label:t('All')}]} />
      <div className="chart"><LineChart points={bwPts} h={170} unit={S.unit} goal={S.targetW}/></div>
    </div>
    {ep&&<div className="card">
      <div className="small dim" style={{marginBottom:12}}>Exercise progress</div>
      <div className="row between"><div><div className="ttl">{EXIDX[ep.id]?exerciseNameFor(EXIDX[ep.id]):ep.id}</div><div className="ss">{ep.count} тренувань з цією вправою</div></div><Icon name="chartLine"/></div>
      <div className="chart" style={{marginTop:12}}><LineChart points={ep.points} h={180} unit={ep.weighted?S.unit:t('reps')}/></div>
      <div className="small dim">Рекорд: <b style={{color:'var(--acc)'}}>{fmtNum(Math.max(...ep.points.map(p=>p.y)))} {ep.weighted?S.unit:t('reps')}</b></div>
    </div>}
    <div className="sect"><h2 className="sect-t">Recent workouts</h2><div className="sect-b">
      {latest.length?latest.map(w=><div className="lrow" key={w.id||`${w.d}:${w.start}`}><span className="lrow-i" style={{'--tint':'var(--acc)'}}><Icon name="dumbbell"/></span><span className="lrow-m"><span className="lrow-t">{w.name||'Workout'}</span><span className="lrow-s">{w.d||''} · {(w.entries||[]).reduce((a,e)=>a+(e.sets||[]).filter(done).length,0)} підходів</span></span></div>):<div className="lrow"><span className="lrow-m"><span className="lrow-t">Немає тренувань</span></span></div>}
    </div></div>
  </>
}
