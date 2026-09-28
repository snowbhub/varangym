import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { DAYN, weekOrder, weekStartOf, uid, exCount, routineCount } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { dayAssignSheet, dayAddRoutineSheet, starterPlanSheet, planToolsSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { glyphOf, DEFAULT_GLYPH } from '../lib/glyphs.js'
import { DEMO } from '../lib/demo.js'
import { MOBILE } from '../lib/mobile.js'
import { coachAvailable } from '../lib/coach.js'
import { EXIDX } from '../lib/exercises.js'
import { downloadExerciseOffline, offlineMediaSupported } from '../lib/offline-media.js'

export default function Plan() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const config = useStore(s => s.config)
  const coachMode = useStore(s => s.coachLocal?.mode)
  const user = useStore(s => s.user)
  const [offlineBusy, setOfflineBusy] = useState(false)
  const [offlineProgress, setOfflineProgress] = useState(null)

  const showCoach = coachAvailable(config, user, { demo: DEMO, mobile: MOBILE, coachMode })

  const planExerciseIds = useMemo(() => {
    const usedRoutines = new Set(Object.values(S.week || {}).flatMap(v => [].concat(v || [])))
    const ids = []
    for (const routine of S.routines || []) {
      if (!usedRoutines.has(routine.id)) continue
      for (const cfg of routine.ex || []) if (cfg?.id) ids.push(cfg.id)
    }
    return [...new Set(ids)]
  }, [S.week, S.routines])

  const downloadPlanOffline = async () => {
    if (offlineBusy) return
    if (!offlineMediaSupported()) {
      useUI.getState().toast(t('Offline downloads are not supported in this browser'))
      return
    }
    const exercises = planExerciseIds.map(id => EXIDX[id]).filter(Boolean)
    if (!exercises.length) {
      useUI.getState().toast(t('Your weekly plan has no downloadable exercises yet'))
      return
    }
    setOfflineBusy(true)
    setOfflineProgress({ done: 0, total: exercises.length })
    try {
      let done = 0
      for (const ex of exercises) {
        await downloadExerciseOffline(ex)
        done++
        setOfflineProgress({ done, total: exercises.length })
      }
      useUI.getState().toast(t('Plan saved for offline use'))
    } catch (err) {
      useUI.getState().toast(err?.message || t('Offline download failed'))
    } finally {
      setOfflineBusy(false)
      setTimeout(() => setOfflineProgress(null), 1800)
    }
  }

  const moveRoutine = (i, delta) => update(s => {
    const to = i + delta
    if (to < 0 || to >= s.routines.length) return
    const [moved] = s.routines.splice(i, 1)
    s.routines.splice(to, 0, moved)
  })

  const addRoutine = () => {
    const r = { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] }
    update(s => { s.routines.push(r) })
    nav('/plan/r/' + r.id)
  }

  const removeFromDay = (d, rid) => update(s => {
    const next = [].concat(s.week[d] || []).filter(id => id !== rid)
    if (next.length) s.week[d] = next; else delete s.week[d]
  })

  return <>
    <div className="hdr">
      <div><h1>{t('Plan')}</h1><div className="sub">{t('Your weekly routine')}</div></div>
      <div className="row" style={{ gap: 8 }}>
        <button className="iconbtn" disabled={offlineBusy || !planExerciseIds.length} onClick={downloadPlanOffline}
          aria-label={t('Download plan for offline use')} title={t('Download plan for offline use')}>
          <Icon name={offlineBusy ? 'clock' : 'download'} />
        </button>
        <button className="iconbtn" onClick={planToolsSheet} aria-label={t('Share your plan')} title={t('Share your plan')}><Icon name="upload" /></button>
      </div>
    </div>

    {offlineProgress && <div className="card small" style={{ marginBottom: 12 }}>
      <div className="row between"><b>{t('Offline plan')}</b><span className="muted">{offlineProgress.done}/{offlineProgress.total}</span></div>
      <div className="muted small" style={{ marginTop: 5 }}>{t('Downloading exercise images and animations so this plan stays usable without internet.')}</div>
    </div>}

    {showCoach && <button className="coach-cta" onClick={() => nav('/coach')}>
      <span className="coach-cta-av"><Icon name="sparkles" /></span>
      <span className="coach-cta-t">
        <b>{t('Coach')}</b>
        <span>{t('Plan design and reviews, from your own training')}</span>
      </span>
      <Icon name="chevronRight" className="coach-cta-chev" />
    </button>}

    <div className="cols"><div>
      <h4 className="sec">{t('Week schedule')}</h4>
      <div className="list" style={{ display: 'flex', flexDirection: 'column' }}>
        {weekOrder(weekStartOf(S)).map(d => {
          const dayRoutines = [].concat(S.week[d] || []).map(id => S.routines.find(x => x.id === id)).filter(Boolean)
          if (!dayRoutines.length) return <div key={d} className="item" {...tappable(() => dayAssignSheet(d))}>
            <div className="grow"><div className="tt">{t(DAYN[d])}</div></div>
            <span className="tag">{t('Rest')}</span>
            <Icon name="chevronRight" className="chev" /></div>
          return <div key={d} className="item" style={{ display: 'block', padding: '10px 14px' }}>
            <div className="row between" style={{ marginBottom: 6 }}>
              <div className="tt">{t(DAYN[d])}</div>
              <div className="small dim">{routineCount(dayRoutines.length)}</div>
            </div>
            {dayRoutines.map(r => <div key={r.id} className="row" style={{ gap: 8, padding: '4px 0 4px 8px' }}>
              <span className="lrow-i" style={{ width: 26, height: 26, fontSize: 14 }}><Icon name={glyphOf(r.emoji)} /></span>
              <div className="grow" style={{ minWidth: 0 }}><div className="tt" style={{ fontSize: 14 }}>{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
              <button className="iconbtn sm" aria-label={t('Remove')} onClick={() => removeFromDay(d, r.id)}><Icon name="xmark" /></button>
            </div>)}
            <button className="btn ghost sm" style={{ marginTop: 4, marginLeft: 8 }} onClick={() => dayAddRoutineSheet(d)}>
              <Icon name="plus" /> {t('Add routine')}
            </button>
          </div>
        })}
      </div>
    </div><div>
      <div className="row between" style={{ marginTop: 22, marginBottom: 10 }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Routines')}</h4>
        <Button size="sm" variant="tinted" icon="plus" onClick={addRoutine}>{t('New')}</Button>
      </div>
      {S.routines.length ? <div className="list">{S.routines.map((r, i) => <div key={r.id} className="item" {...tappable(() => nav('/plan/r/' + r.id))}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        {S.routines.length > 1 && <div style={{ display: 'flex', gap: 2, flex: 'none' }}>
          <button className="iconbtn" aria-label={t('Move up')} title={t('Move up')} disabled={i === 0}
            style={{ width: 28, height: 24, borderRadius: 7, fontSize: 12 }}
            onClick={ev => { ev.stopPropagation(); moveRoutine(i, -1) }}><Icon name="chevronUp" /></button>
          <button className="iconbtn" aria-label={t('Move down')} title={t('Move down')} disabled={i === S.routines.length - 1}
            style={{ width: 28, height: 24, borderRadius: 7, fontSize: 12 }}
            onClick={ev => { ev.stopPropagation(); moveRoutine(i, 1) }}><Icon name="chevronDown" /></button>
        </div>}
        <Icon name="chevronRight" className="chev" /></div>)}</div> : <>
        <div className="empty"><div className="ico"><Icon name="clipboard" /></div>{t('No routines yet.')}<br />{t('Create one or load the starter plan.')}</div>
        <Button icon="sparkles" onClick={starterPlanSheet}>{t('Load starter plan')}</Button>
      </>}
    </div></div>
  </>
}
