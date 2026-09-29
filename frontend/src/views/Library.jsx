import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { EXDB, BODYPARTS, allExercises, equipmentOf, searchExercises } from '../lib/exercises.js'
import { MUSCLE_NAME } from '../lib/muscles.js'
import { activeProfile, exAvailable } from '../lib/equipment.js'
import { bestWeightFor } from '../lib/history.js'
import { fmtNum } from '../lib/format.js'
import { t, exerciseNameFor } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import { downloadExerciseOffline, exerciseOfflineStatus, offlineMediaSupported, removeExerciseOffline } from '../lib/offline-media.js'
import { Thumb } from '../components/Media.jsx'
import { exerciseDetailSheet, addToRoutineSheet, customExSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { tappable, useRevealActiveChip } from '../lib/use-sheet-keyboard.js'
import { isFav, sortFavouritesFirst } from '../lib/favourites.js'
import { useUI } from '../store/useUI.js'

function OfflineExerciseButton({ ex }) {
  const toast = useUI(s => s.toast)
  const [cached, setCached] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    exerciseOfflineStatus(ex).then(s => { if (live) setCached(!!s.cached) }).catch(() => {})
    return () => { live = false }
  }, [ex.id, ex.img, ex.gif])

  if (!offlineMediaSupported() || (!ex.img && !ex.gif)) return null

  const toggle = async ev => {
    ev.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      if (cached) {
        await removeExerciseOffline(ex)
        setCached(false)
        toast(t('Removed from offline downloads'))
      } else {
        await downloadExerciseOffline(ex)
        setCached(true)
        toast(t('Exercise downloaded for offline use'))
      }
    } catch (e) {
      toast(e.message || t('Could not download exercise'))
    }
    setBusy(false)
  }

  return <button
    className="iconbtn"
    aria-label={cached ? t('Available offline') : t('Download for offline use')}
    title={cached ? t('Available offline') : t('Download for offline use')}
    disabled={busy}
    onClick={toggle}
    style={{
      width: 38,
      height: 38,
      flex: '0 0 38px',
      color: cached ? 'var(--acc)' : 'var(--fg)',
      background: cached ? 'color-mix(in srgb, var(--acc) 12%, transparent)' : 'transparent',
      opacity: busy ? .48 : 1,
      transform: busy ? 'translateY(2px)' : 'none',
      transition: 'color .22s ease, background .22s ease, opacity .18s ease, transform .18s ease',
    }}
  ><Icon name="download" /></button>
}

export default function Library() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const [q, setQ] = useState('')
  const [bp, setBp] = useState('')
  const [eq, setEq] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [shown, setShown] = useState(40)
  const [platformCatalog, setPlatformCatalog] = useState(null)
  const bpStrip = useRef(null), eqStrip = useRef(null)
  const profile = activeProfile(S)
  const locale = String(S.lang || 'uk').slice(0, 16)

  useEffect(() => {
    let live = true
    if (!user) { setPlatformCatalog(null); return () => { live = false } }
    api(`/api/exercise-admin/catalog?locale=${encodeURIComponent(locale)}&limit=2000&offset=0`)
      .then(d => { if (live) setPlatformCatalog(d.exercises || []) })
      .catch(() => { if (live) setPlatformCatalog(null) })
    return () => { live = false }
  }, [user?.id, locale])

  const catalogue = useMemo(() => {
    const local = allExercises(S)
    if (!platformCatalog) return local
    const remote = new Map(platformCatalog.map(x => [String(x.legacy_key || ''), x]))
    return local.flatMap(ex => {
      // User-created exercises are local/profile data and are never hidden by platform catalog policy.
      const row = remote.get(String(ex.id))
      if (!row) return EXDB.some(x => x.id === ex.id) ? [] : [ex]
      const curated = row.admin_translations?.[locale]
      return [{
        ...ex,
        bp: row.body_part || ex.bp,
        tg: row.primary_muscle_key || ex.tg,
        eq: row.equipment_key || ex.eq,
        img: row.image || ex.img,
        gif: row.gif || ex.gif,
        localizedName: curated?.name || undefined,
        localizedInstructions: Array.isArray(curated?.instructions) && curated.instructions.length ? curated.instructions : undefined,
        desc: curated?.description || ex.desc,
      }]
    })
  }, [S, platformCatalog, locale])

  const base = searchExercises(catalogue.filter(e => !bp || e.bp === bp), q)
  const eqFiltered = (profile && !showAll) ? base.filter(e => exAvailable(S, e)) : base
  const eqOpts = equipmentOf(eqFiltered)
  const eqOn = eqOpts.includes(eq) ? eq : ''
  const f = sortFavouritesFirst(eqOn ? eqFiltered.filter(e => e.eq === eqOn) : eqFiltered, S)
  useRevealActiveChip(bpStrip, bp)
  useRevealActiveChip(eqStrip, eqOn)

  return <>
    <div className="hdr"><div><h1>{t('Exercises')}</h1><div className="sub">{t('{0} exercises with animations', platformCatalog?.length || EXDB.length)}</div></div>
      <Button size="sm" variant="tinted" icon="target" onClick={() => nav('/muscles')}>{t('By muscle')}</Button>
    </div>
    <div className="search" style={{ marginBottom: 10 }}><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      <input className="input" placeholder={t('Search…')} value={q} onChange={e => { setQ(e.target.value); setShown(40) }} /></div>
    {profile && <div className="small dim row" style={{ margin: '-4px 2px 10px', gap: 6, alignItems: 'center' }}>
      <Icon name="dumbbell" style={{ fontSize: 13 }} />
      {showAll ? t('Showing all equipment') : t('Showing what you have in "{0}"', profile.name)}
      <button className="chip nocap" style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 12 }} onClick={() => setShowAll(v => !v)}>
        {showAll ? t('Filter by "{0}"', profile.name) : t('Show all equipment')}
      </button>
    </div>}
    <div className="chips" ref={bpStrip} style={{ marginBottom: eqOpts.length > 1 ? 8 : 12 }}>
      <button className={'chip nocap' + (!bp ? ' on' : '')} onClick={() => { setBp(''); setEq(''); setShown(40) }}>{t('All')}</button>
      {BODYPARTS.map(b => <button key={b} className={'chip' + (bp === b ? ' on' : '')} onClick={() => { setBp(b); setShown(40) }}>{t(b)}</button>)}
    </div>
    {eqOpts.length > 1 && <div className="chips" ref={eqStrip} style={{ marginBottom: 12 }}>
      <button className={'chip nocap' + (!eqOn ? ' on' : '')} onClick={() => { setEq(''); setShown(40) }}>{t('Any equipment')}</button>
      {eqOpts.map(x => <button key={x} className={'chip' + (eqOn === x ? ' on' : '')} onClick={() => { setEq(x); setShown(40) }}>{t(x)}</button>)}
    </div>}
    <div className="list">
      <div className="item" {...tappable(() => customExSheet(null, ex => exerciseDetailSheet(ex), q.trim()))}>
        <div className="thumb thumb-x"><Icon name="sparkles" /></div>
        <div className="grow"><div className="tt">{t('Create your own exercise')}</div><div className="ss">{t('name + body part, no animation')}</div></div><Icon name="plus" className="chev" />
      </div>
      {f.slice(0, shown).map(e => {
        const best = bestWeightFor(S, e.id)
        return <div key={e.id} className="item" {...tappable(() => exerciseDetailSheet(e))}>
          <Thumb ex={e} />
          <div className="grow"><div className="tt capitalize">{isFav(S, e.id) && <Icon name="starFill" className="fav-star" />}{exerciseNameFor(e)}</div><div className="ss capitalize">{t(MUSCLE_NAME[e.tg] || e.tg || e.bp)} · {t(e.eq)}</div></div>
          {best > 0 && <span className="tag acc">{fmtNum(best)}</span>}
          <OfflineExerciseButton ex={e} />
          <Button size="sm" variant="tinted" icon="plus" onClick={ev => { ev.stopPropagation(); addToRoutineSheet(e) }}>{t('Plan')}</Button>
        </div>
      })}
      {f.length === 0 && <div className="empty"><div className="ico"><Icon name="magnifier" /></div>{t('No match')}</div>}
    </div>
    {f.length > shown && <><div style={{ height: 10 }} /><Button onClick={() => setShown(s => s + 40)}>{t('Show more')}</Button></>}
  </>
}
