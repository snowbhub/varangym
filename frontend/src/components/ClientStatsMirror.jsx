import { useMemo, useState } from 'react'
import { EXIDX, betterWeight } from '../lib/exercises.js'
import {
  lastBW, streakWeeks, modeOf, metricModeForEntry, metricRowsForEntry, bestWeightForEntry,
} from '../lib/history.js'
import { fmtNum, todayISO, weekStartOf } from '../lib/format.js'
import { t, exerciseNameFor } from '../lib/i18n.js'
import { loadOfWorkouts, muscleBalanceWindow, rankOf, MUSCLE_NAME } from '../lib/muscles.js'
import { fatigueOf, strengthOf, STRENGTH_FLOOR, LB_TO_KG } from '../lib/recovery.js'
import { isWarmupRow } from '../lib/workout-model.js'
import Heatmap from './Heatmap.jsx'
import BodyMap, { BodyMapLegend } from './BodyMap.jsx'
import LineChart from './LineChart.jsx'
import Icon from './Icon.jsx'
import { Segmented, SelectRow } from './ui.jsx'

const msDay = 86400000
const ts = v => Number(v?.t || new Date(v?.d || 0).getTime()) || 0
const n = v => Number(v) || 0
const done = s => s?.done === true && !isWarmupRow(s)

const FATIGUE_LEVELS = [
  { at: 0, level: 0 },
  { at: 0.15, level: 1 },
  { at: 0.25, level: 2 },
  { at: 0.4, level: 3 },
  { at: 0.55, level: 4, exclusive: true },
]
const STRENGTH_LEVELS = [
  { at: STRENGTH_FLOOR, level: 0 },
  { at: 0.625, level: 1 },
  { at: 0.75, level: 2 },
  { at: 0.875, level: 3 },
  { at: 1, level: 4 },
]

function normalizedState(raw = {}) {
  return {
    ...raw,
    lang: raw.lang || 'uk',
    unit: raw.unit || 'kg',
    body: raw.body === 'female' ? 'female' : 'male',
    weekStart: raw.weekStart ?? 1,
    workouts: Array.isArray(raw.workouts) ? raw.workouts : [],
    bodyweight: Array.isArray(raw.bodyweight) ? raw.bodyweight : [],
    routines: Array.isArray(raw.routines) ? raw.routines : [],
    customEx: Array.isArray(raw.customEx) ? raw.customEx : [],
  }
}

function latestMuscleTraining(workouts) {
  const latest = {}
  for (const workout of workouts || []) {
    const stamp = Number(workout?.start || new Date(workout?.d).getTime())
    if (!Number.isFinite(stamp)) continue
    for (const entry of workout.entries || []) {
      if (!(entry.sets || []).some(done)) continue
      const ex = EXIDX[entry.id] || entry
      const keys = [ex?.tg, ...(Array.isArray(ex?.sm) ? ex.sm : [])].filter(Boolean)
      for (const slug of keys) if (latest[slug] == null || stamp > latest[slug]) latest[slug] = stamp
    }
  }
  return latest
}

function MuscleAnalytics({ S }) {
  const [view, setView] = useState('balance')
  const [win, setWin] = useState(7)
  const now = Date.now()
  const workouts = S.workouts
  const bodyweightKg = useMemo(() => {
    if (!S.bodyweight.length) return null
    const last = [...S.bodyweight].sort((a, b) => String(a.d || '').localeCompare(String(b.d || ''))).at(-1)
    if (!(n(last?.w) > 0)) return null
    return S.unit === 'lb' ? n(last.w) * LB_TO_KG : n(last.w)
  }, [S.bodyweight, S.unit])
  const fatigue = useMemo(() => fatigueOf(workouts, now, { bodyweightKg, unit: S.unit }), [workouts, now, bodyweightKg, S.unit])
  const strength = useMemo(() => strengthOf(workouts, now, { bodyweightKg, unit: S.unit }), [workouts, now, bodyweightKg, S.unit])
  const latest = useMemo(() => latestMuscleTraining(workouts), [workouts])
  const inWin = muscleBalanceWindow(workouts, win, now, todayISO(), weekStartOf(S))
  const load = loadOfWorkouts(inWin, null)
  const { worked, missed } = rankOf(load)
  const max = worked.length ? load[worked[0]] : 1

  const topStrength = Object.keys(strength).sort((a, b) => n(strength[b]) - n(strength[a])).slice(0, 5)
  const lowStrength = Object.keys(strength).filter(x => n(strength[x]) < 1).sort((a, b) => n(strength[a]) - n(strength[b])).slice(0, 7)
  const topFatigue = Object.keys(fatigue).filter(x => n(fatigue[x]) > 0).sort((a, b) => n(fatigue[b]) - n(fatigue[a])).slice(0, 7)
  const age = slug => latest[slug] == null ? '—' : `${Math.max(0, Math.floor((now - latest[slug]) / msDay))} дн.`

  return <div className="card">
    <div className="row between" style={{ marginBottom: 10 }}>
      <div>
        <h2 style={{ margin: 0 }}>{view === 'balance' ? t('Muscle balance') : view === 'fatigue' ? t('Fatigue') : t('Strength')}</h2>
        <div className="small dim">{S.body === 'female' ? 'Жіночий профіль' : 'Чоловічий профіль'} · read-only</div>
      </div>
      <span className="tag acc">{S.body === 'female' ? '♀' : '♂'}</span>
    </div>
    <Segmented className="seg-range" value={view} onChange={setView} options={[
      { value: 'balance', label: t('Muscle balance') },
      { value: 'fatigue', label: t('Fatigue') },
      { value: 'strength', label: t('Strength') },
    ]} />

    {view === 'balance' ? <>
      <Segmented className="seg-range" value={win} onChange={setWin} options={[
        { value: 7, label: t('Week') }, { value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 0, label: t('All') },
      ]} />
      {inWin.length ? <>
        <BodyMap load={load} body={S.body} />
        <BodyMapLegend />
        {worked.slice(0, 5).map(m => <div className="mrow" key={m}>
          <span className="nm">{t(MUSCLE_NAME[m])}</span>
          <span className="bar"><i style={{ width: Math.round((load[m] || 0) / max * 100) + '%' }} /></span>
          <span className="v">{fmtNum(Math.round((load[m] || 0) * 10) / 10)} {t('sets')}</span>
        </div>)}
        {!!missed.length && <><h4 className="sec" style={{ marginTop: 12 }}>{t('Not trained in this period')}</h4><div className="mchips">{missed.map(m => <span key={m} className="mchip miss">{t(MUSCLE_NAME[m])}</span>)}</div></>}
      </> : <div className="muted small">{t('No workouts in this period yet.')}</div>}
    </> : view === 'fatigue' ? <>
      <BodyMap className="hm-fatigue" load={fatigue} thresholds={FATIGUE_LEVELS} body={S.body} />
      <div className="hm-legend hm-fatigue" aria-label={t('Fatigue')}><span>{t('Fatigued')}</span><div className="hm-c l4"/><span>{t('Recovering')}</span><div className="hm-c l2"/><span>{t('Ready')}</span><div className="hm-c l0"/></div>
      <div className="small dim" style={{ margin: '8px 0 10px' }}>Втома розрахована з тих самих завершених підходів, які бачить клієнт.</div>
      {topFatigue.length ? topFatigue.map(slug => <div className="mrow" key={slug}>
        <span className="nm">{t(MUSCLE_NAME[slug])}</span>
        <span className="bar"><i style={{ width: Math.round(n(fatigue[slug]) * 100) + '%' }} /></span>
        <span className="v">{Math.round(n(fatigue[slug]) * 100)}% · {age(slug)}</span>
      </div>) : <div className="muted small">Ще немає навантаження для розрахунку втоми.</div>}
    </> : <>
      <BodyMap className="hm-strength" load={strength} thresholds={STRENGTH_LEVELS} body={S.body} />
      <div className="hm-legend hm-strength"><span>100%</span><div className="hm-c l4"/><div className="hm-c l3"/><div className="hm-c l2"/><div className="hm-c l1"/><div className="hm-c l0"/><span>50%</span></div>
      <div className="small dim" style={{ margin: '8px 0 10px' }}>Збережена сила: 100% після недавнього тренування, потім поступово знижується до базового рівня.</div>
      {(lowStrength.length ? lowStrength : topStrength).map(slug => <div className="mrow" key={slug}>
        <span className="nm">{t(MUSCLE_NAME[slug])}</span>
        <span className="bar"><i style={{ width: Math.round(n(strength[slug]) * 100) + '%' }} /></span>
        <span className="v">{Math.round(n(strength[slug]) * 100)}% · {age(slug)}</span>
      </div>)}
    </>}
  </div>
}

function exerciseRows(S) {
  const byId = new Map()
  for (const w of S.workouts) {
    for (const entry of w.entries || []) {
      const sets = (entry.sets || []).filter(done)
      if (!sets.length) continue
      const rec = byId.get(entry.id) || { id: entry.id, entries: [], points: [], sessions: 0, weighted: false }
      const mode = metricModeForEntry(entry) || modeOf({ id: entry.id })
      const rows = metricRowsForEntry(entry, mode)
      let y = 0
      let unit = S.unit
      if (mode === 'reps') {
        const weighted = bestWeightForEntry(entry) > 0
        rec.weighted = rec.weighted || weighted
        y = weighted ? bestWeightForEntry(entry) : Math.max(0, ...rows.map(s => n(s.r)))
        unit = weighted ? S.unit : t('reps')
      } else if (mode === 'time') {
        y = Math.max(0, ...rows.map(s => n(s.sec)))
        unit = 's'
      } else if (mode === 'cardio') {
        y = Math.max(0, ...rows.map(s => n(s.speed || s.w)))
        unit = 'km/h'
      } else {
        y = Math.max(0, ...rows.map(s => n(s.w)))
      }
      if (y > 0) {
        rec.points.push({ t: n(w.start) || new Date(w.d).getTime(), y, d: w.d })
        rec.sessions++
        rec.unit = unit
      }
      rec.entries.push(entry)
      byId.set(entry.id, rec)
    }
  }
  const custom = new Map((S.customEx || []).map(x => [x.id, x]))
  const nameOf = id => EXIDX[id] ? exerciseNameFor(EXIDX[id]) : custom.get(id)?.n || byId.get(id)?.entries?.[0]?.muscleSnapshot?.n || byId.get(id)?.entries?.[0]?.n || id
  return [...byId.values()].filter(x => x.points.length).map(x => ({ ...x, name: nameOf(x.id) })).sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name))
}

function ExerciseProgress({ S }) {
  const rows = useMemo(() => exerciseRows(S), [S])
  const [selected, setSelected] = useState('')
  const cur = rows.find(x => x.id === selected) || rows[0] || null
  if (!cur) return <div className="card"><h2>{t('Exercise progress')}</h2><div className="muted small">{t('Finish your first workout to see progress curves here.')}</div></div>
  const best = cur.points.reduce((acc, p) => {
    if (acc == null) return p.y
    return cur.weighted ? betterWeight(cur.id, acc, p.y) : Math.max(acc, p.y)
  }, null)
  return <div className="card">
    <h2>{t('Exercise progress')}</h2>
    <div className="sect-b" style={{ marginBottom: 10 }}>
      <SelectRow title={t('Exercise')} sheetTitle={t('Exercise progress')} value={cur.id} onChange={setSelected} stackedValue options={rows.map(x => ({ value: x.id, label: `${x.name} — ${x.sessions}` }))} search={{ placeholder: t('Search…'), label: t('Search…'), emptyLabel: t('No match'), match: (o, q) => String(o.label || '').toLowerCase().includes(String(q || '').toLowerCase()) }} />
    </div>
    <div className="chart"><LineChart points={cur.points} h={180} unit={cur.unit || S.unit} /></div>
    <div className="row between small"><span className="dim">{cur.sessions} тренувань з цією вправою</span><span>{t('Best:')} <b className="accent">{fmtNum(best)} {cur.unit || S.unit}</b></span></div>
    <div style={{ marginTop: 8 }}>{[...cur.points].reverse().slice(0, 5).map((p, i) => <div key={`${p.t}:${i}`} className="row between small" style={{ padding: '6px 0', borderBottom: 'var(--hair) solid var(--sep)' }}><span className="muted">{p.d || ''}</span><span>{fmtNum(p.y)} {cur.unit || S.unit}</span></div>)}</div>
  </div>
}

export default function ClientStatsMirror({ state, client }) {
  const S = useMemo(() => normalizedState(state), [state])
  const [range, setRange] = useState(90)
  const now = Date.now(), workouts = S.workouts
  const monthW = workouts.filter(w => String(w.d || '').slice(0, 7) === todayISO().slice(0, 7)).length
  const bwPts = S.bodyweight.filter(b => range === 0 || ts(b) > now - range * msDay).map(b => ({ t: ts(b), y: n(b.w), d: b.d }))
  const bw30 = S.bodyweight.filter(b => ts(b) > now - 30 * msDay)
  const bwDelta = bw30.length > 1 ? n(bw30.at(-1).w) - n(bw30[0].w) : null
  const latest = [...workouts].sort((a, b) => (n(b.start) || new Date(b.d).getTime()) - (n(a.start) || new Date(a.d).getTime())).slice(0, 8)

  return <>
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="lbl2">Статистика клієнта · read-only</div>
      <div className="big" style={{ fontSize: 27 }}>{client?.display_name || client?.name || 'Клієнт'}</div>
      <div className="ss">Дані беруться безпосередньо з профілю клієнта. Нічого на цьому екрані не змінює його історію.</div>
    </div>

    <div className="tiles">
      <div className="tile"><div className="l"><Icon name="dumbbell" />{t('Workouts')}</div><div className="v">{workouts.length}</div></div>
      <div className="tile"><div className="l"><Icon name="calendar" />{t('This month')}</div><div className="v">{monthW}</div></div>
      <div className="tile"><div className="l"><Icon name="flame" />{t('Week streak')}</div><div className="v">{streakWeeks(S)}</div></div>
      <div className="tile"><div className="l"><Icon name="scale" />{t('Weight 30d')}</div><div className="v" style={{ fontSize: 22 }}>{bwDelta == null ? '—' : `${bwDelta > 0 ? '+' : ''}${fmtNum(bwDelta)} ${S.unit}`}</div></div>
    </div>

    <div className="card"><h2>{t('Activity — last 12 months')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {t('by time trained')}</span></h2><Heatmap S={S} /></div>
    {workouts.length > 0 && <MuscleAnalytics S={S} />}

    <div className="card">
      <div className="row between" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>{t('Body weight')}</h2><div className="row" style={{ gap: 8 }}><span className="tag">{lastBW(S)?.w ? `${fmtNum(lastBW(S).w)} ${S.unit}` : '—'}</span>{S.targetW && <span className="tag acc">◎ {fmtNum(S.targetW)}</span>}</div></div>
      <Segmented className="seg-range" value={range} onChange={setRange} options={[{ value: 30, label: '1M' }, { value: 90, label: '3M' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]} />
      <div className="chart"><LineChart points={bwPts} h={170} unit={S.unit} goal={S.targetW} /></div>
    </div>

    <ExerciseProgress S={S} />

    <div className="sect"><div className="row between" style={{ marginBottom: 8 }}><h2 className="sect-t" style={{ margin: 0 }}>{t('Recent workouts')}</h2><span className="tag acc">{workouts.length}</span></div><div className="sect-b">
      {latest.length ? latest.map(w => {
        const sets = (w.entries || []).reduce((a, e) => a + (e.sets || []).filter(done).length, 0)
        const volume = (w.entries || []).reduce((a, e) => a + (e.sets || []).filter(done).reduce((s, x) => s + n(x.w) * Math.max(1, n(x.r)), 0), 0)
        return <div className="lrow" key={w.id || `${w.d}:${w.start}`}><span className="lrow-i" style={{ '--tint': 'var(--acc)' }}><Icon name="dumbbell" /></span><span className="lrow-m"><span className="lrow-t">{w.name || 'Workout'}</span><span className="lrow-s">{w.d || ''} · {sets} підходів</span></span><span className="lrow-v">{volume > 0 ? `${fmtNum(Math.round(volume))} ${S.unit}` : '—'}</span></div>
      }) : <div className="lrow"><span className="lrow-m"><span className="lrow-t">Немає тренувань</span></span></div>}
    </div></div>
  </>
}
