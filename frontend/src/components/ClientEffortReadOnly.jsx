import { useMemo, useState } from 'react'
import { effortHistogram, effortSummary, effortWeeks, hasEffort, displayScale, scaleName, toScale, HARD_RIR } from '../lib/effort.js'
import { fmtNum } from '../lib/format.js'
import { t, useLang } from '../lib/i18n.js'
import LineChart from './LineChart.jsx'
import { Segmented } from './ui.jsx'

const normalized = raw => ({ ...raw, workouts: Array.isArray(raw?.workouts) ? raw.workouts : [], weekStart: raw?.weekStart ?? 1 })

export default function ClientEffortReadOnly({ state }) {
  useLang()
  const S = useMemo(() => normalized(state || {}), [state])
  const [win, setWin] = useState(90)
  if (!hasEffort(S)) return null
  const kind = displayScale(S)
  const hd = scaleName(kind)
  const sum = effortSummary(S, win)
  const weeks = effortWeeks(S, win)
  const hist = effortHistogram(S, win)
  const max = Math.max(1, ...hist.map(x => x.n))
  const points = weeks.map(w => ({ t: w.t, y: toScale(kind, w.rir), note: `${w.sets} ${t('sets')}` }))
  const binLabel = b => kind === 'rpe' ? (b.tail ? '≤ 6' : String(10 - b.rir)) : (b.tail ? `${b.rir}+` : String(b.rir))

  return <div className="card">
    <div className="row between" style={{alignItems:'flex-end',gap:12}}>
      <div><h2 style={{margin:0}}>{t('Effort')}</h2><div className="small dim">{t('How close the completed sets were to failure')} · read-only</div></div>
      <span className="tag acc">{hd}</span>
    </div>
    <div style={{marginTop:10}}><Segmented className="seg-range" value={win} onChange={setWin} options={[{value:30,label:'30d'},{value:90,label:'90d'},{value:365,label:'1Y'},{value:0,label:t('All')}]}/></div>
    <div className="grid2" style={{marginTop:10}}>
      <div className="stat"><div className="n">{sum.avg == null ? '—' : `${fmtNum(toScale(kind,sum.avg))} ${hd}`}</div><div className="l">{t('average effort')}</div><div className="s">{sum.rated} / {sum.done} {t('sets rated')}</div></div>
      <div className="stat"><div className="n">{sum.hardPct == null ? '—' : `${Math.round(sum.hardPct*100)}%`}</div><div className="l">{t('hard sets')}</div><div className="s">{hd} {fmtNum(toScale(kind,HARD_RIR))} {t('or harder')}</div></div>
    </div>
    {points.length > 1 && <><h4 className="sec" style={{marginTop:12}}>{t('Weekly trend')}</h4><div className="chart"><LineChart points={points} h={150} unit={hd} invert={kind==='rir'} /></div></>}
    <h4 className="sec" style={{marginTop:12}}>{t('Set distribution')}</h4>
    {hist.map(b => <div className="mrow" key={b.rir}><span className="nm">{hd} {binLabel(b)}</span><span className="bar"><i style={{width:`${Math.round(b.n/max*100)}%`}}/></span><span className="v">{b.n ? `${b.n} · ${Math.round(b.pct*100)}%` : '—'}</span></div>)}
  </div>
}