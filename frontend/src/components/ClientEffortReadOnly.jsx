import { useMemo, useState } from 'react'
import { effortHistogram, effortSummary, effortWeeks, hasEffort, displayScale, scaleName, toScale, HARD_RIR } from '../lib/effort.js'
import { fmtNum } from '../lib/format.js'
import LineChart from './LineChart.jsx'
import { Segmented } from './ui.jsx'

const normalized = raw => ({ ...raw, workouts: Array.isArray(raw?.workouts) ? raw.workouts : [], weekStart: raw?.weekStart ?? 1 })

export default function ClientEffortReadOnly({ state }) {
  const S = useMemo(() => normalized(state || {}), [state])
  const [win, setWin] = useState(90)
  if (!hasEffort(S)) return null
  const kind = displayScale(S)
  const hd = scaleName(kind)
  const sum = effortSummary(S, win)
  const weeks = effortWeeks(S, win)
  const hist = effortHistogram(S, win)
  const max = Math.max(1, ...hist.map(x => x.n))
  const points = weeks.map(w => ({ t: w.t, y: toScale(kind, w.rir), note: `${w.sets} sets` }))
  const binLabel = b => kind === 'rpe' ? (b.tail ? '≤ 6' : String(10 - b.rir)) : (b.tail ? `${b.rir}+` : String(b.rir))

  return <div className="card">
    <div className="row between" style={{alignItems:'flex-end',gap:12}}>
      <div><h2 style={{margin:0}}>Зусилля</h2><div className="small dim">Наскільки близько підходи були до відмови · read-only</div></div>
      <span className="tag acc">{hd}</span>
    </div>
    <div style={{marginTop:10}}><Segmented className="seg-range" value={win} onChange={setWin} options={[{value:30,label:'30d'},{value:90,label:'90d'},{value:365,label:'1Y'},{value:0,label:'Усе'}]} /></div>
    <div className="grid2" style={{marginTop:10}}>
      <div className="stat"><div className="n">{sum.avg == null ? '—' : `${fmtNum(toScale(kind,sum.avg))} ${hd}`}</div><div className="l">середнє зусилля</div><div className="s">{sum.rated} з {sum.done} підходів оцінено</div></div>
      <div className="stat"><div className="n">{sum.hardPct == null ? '—' : `${Math.round(sum.hardPct*100)}%`}</div><div className="l">важких підходів</div><div className="s">{hd} {fmtNum(toScale(kind,HARD_RIR))} або важче</div></div>
    </div>
    {points.length > 1 && <><h4 className="sec" style={{marginTop:12}}>Динаміка по тижнях</h4><div className="chart"><LineChart points={points} h={150} unit={hd} invert={kind==='rir'} /></div></>}
    <h4 className="sec" style={{marginTop:12}}>Розподіл підходів</h4>
    {hist.map(b => <div className="mrow" key={b.rir}><span className="nm">{hd} {binLabel(b)}</span><span className="bar"><i style={{width:`${Math.round(b.n/max*100)}%`}}/></span><span className="v">{b.n ? `${b.n} · ${Math.round(b.pct*100)}%` : '—'}</span></div>)}
  </div>
}
