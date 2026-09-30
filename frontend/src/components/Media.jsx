import { useEffect, useState } from 'react'
import { imgSrc, gifSrc } from '../lib/exercises.js'
import { effectiveExercise } from '../lib/exercise-overrides-core.js'
import { useStore } from '../store/useStore.js'
import { t, exerciseNameFor } from '../lib/i18n.js'
import Icon from './Icon.jsx'

const absoluteMedia = value => /^(?:https?:|data:|blob:)/i.test(String(value || ''))
const cleanMediaPath = value => String(value || '')
  .replace(/^\/+/, '')
  .replace(/^(?:(?:img|images|gif|gifs|video|videos)\/)+/i, '')

// Canonical exercise rows store just the filename, while imported/admin metadata may contain
// "images/foo.jpg", "/img/foo.jpg" or an absolute URL. Normalise all supported shapes here so
// the web/PWA/native UI never accidentally requests /img/images/foo.jpg or /gif/videos/foo.gif.
function mediaUrl(ex, key, builder) {
  const raw = ex?.[key]
  if (!raw) return ''
  if (absoluteMedia(raw)) return String(raw)
  const cleaned = cleanMediaPath(raw)
  if (!cleaned) return ''
  return builder({ ...ex, [key]: cleaned })
}

export default function Media({ ex, id, compact, minimizable }) {
  const [playing, setPlaying] = useState(true)
  const [failed, setFailed] = useState(null)
  const gifSize = useStore(s => s.S.gifSize)
  const lang = useStore(s => s.S.lang || 'en')
  const body = useStore(s => s.S.body || 'male')
  const update = useStore(s => s.update)
  const shown = effectiveExercise(ex, lang, body)
  if (!shown?.gif) return null
  if (minimizable && gifSize === 'off') return null
  const mini = minimizable && gifSize === 'mini'
  const toggleSize = e => { e.stopPropagation(); update(s => { s.gifSize = mini ? 'full' : 'mini' }) }
  const showGif = playing && failed == null
  const onError = () => setFailed(showGif ? 'gif' : 'all')
  const onTap = () => {
    if (failed) { setFailed(null); setPlaying(true); return }
    setPlaying(p => !p)
  }
  const src = showGif ? mediaUrl(shown, 'gif', gifSrc) : mediaUrl(shown, 'img', imgSrc)
  return (
    <div className={'exmedia' + (compact ? ' compact' : '') + (mini ? ' mini' : '') + (failed === 'all' ? ' broken' : '')} id={id} onClick={onTap}>
      {failed === 'all' || !src
        ? <div className="exmedia-x"><Icon name="dumbbell" /></div>
        : <img decoding="async" draggable={false} src={src} alt={exerciseNameFor(shown)} onError={onError} />}
      {minimizable && (
        <button className="giftoggle" onClick={toggleSize}>
          <Icon name={mini ? 'expand' : 'minimize'} />{mini ? t('Expand') : t('Minimize')}
        </button>
      )}
      {!mini && !failed && (
        <span className="gifhint">
          <Icon name={playing ? 'pause' : 'play'} />{playing ? t('tap to pause') : t('tap to play')}
        </span>
      )}
    </div>
  )
}

export function Thumb({ ex }) {
  const lang = useStore(s => s.S.lang || 'en')
  const body = useStore(s => s.S.body || 'male')
  const shown = effectiveExercise(ex, lang, body)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setAttempt(0)
    setFailed(false)
  }, [shown?.id, shown?.img])

  const base = mediaUrl(shown, 'img', imgSrc)
  if (!base || failed) return <div className="thumb thumb-x"><Icon name="dumbbell" /></div>
  const src = attempt ? `${base}${base.includes('?') ? '&' : '?'}retry=${attempt}` : base
  const retry = () => {
    if (attempt >= 2) { setFailed(true); return }
    const next = attempt + 1
    window.setTimeout(() => setAttempt(next), 300 * next)
  }
  return <img className="thumb" loading="lazy" fetchPriority="low" decoding="async" draggable={false} src={src} alt="" onError={retry} />
}
