import { useEffect, useLayoutEffect, useRef } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation, useNavigationType } from 'react-router-dom'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { bindUI } from './components/ui.jsx'
import { ACCENTS, setWeightDecimals } from './lib/format.js'
import { setLang, useLang } from './lib/i18n.js'
import { setPlayOnSilent } from './lib/sound.js'
import { setNav } from './lib/nav.js'
import { initBackButton } from './lib/back.js'
import { useWakeLock } from './lib/wakelock.js'
import { installViewportGuard } from './lib/viewport-guard.js'
import { installChipDrag } from './lib/hchips.js'
import { syncPushSubscription } from './lib/push.js'
import { loadExerciseOverrides } from './lib/exercise-overrides.js'
import { api } from './lib/api.js'
import { MOBILE } from './lib/mobile.js'
import { startFlow } from './sheets.jsx'
import TabBar from './components/TabBar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Modals from './components/Modals.jsx'
import Toast from './components/Toast.jsx'
import SyncBanner from './components/SyncBanner.jsx'
import RestTimer from './components/RestTimer.jsx'
import TimerFlash from './components/TimerFlash.jsx'
import Login from './views/Login.jsx'
import MobileOnboarding from './views/MobileOnboarding.jsx'
import ModeHome, { RoleModeRoot } from './views/ModeHome.jsx'
import CheckIn from './views/CheckIn.jsx'
import Plan from './views/Plan.jsx'
import RoutineEdit from './views/RoutineEdit.jsx'
import Workout from './views/Workout.jsx'
import Stats from './views/Stats.jsx'
import History from './views/History.jsx'
import Library from './views/Library.jsx'
import Muscles from './views/Muscles.jsx'
import UnifiedSettings from './views/UnifiedSettings.jsx'
import RoleLibrary from './views/RoleLibrary.jsx'
import CoachChat from './views/CoachChat.jsx'
import CoachIntake from './views/CoachIntake.jsx'
import CoachSetup from './views/CoachSetup.jsx'

const scrollPositions = new Map()
bindUI(useUI)

const resolveTheme = theme => theme === 'light' || theme === 'dark'
  ? theme
  : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

function applyPrefs(theme, accent) {
  const de = document.documentElement
  de.dataset.theme = resolveTheme(theme)
  de.dataset.accent = ACCENTS[accent] ? accent : 'lime'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = de.dataset.theme === 'light' ? '#f2f2f7' : '#000000'
}

function Shell() {
  const navigate = useNavigate()
  const loc = useLocation()
  const navType = useNavigationType()
  const { S, user, ready } = useStore()
  useEffect(() => { setPlayOnSilent(!!S.soundOnSilent) }, [S.soundOnSilent])
  const isGuest = useStore(s => s.isGuest())
  const needsMobileOnboarding = useStore(s => s.needsMobileOnboarding)
  const langV = useLang()
  useEffect(() => { setNav(navigate) }, [navigate])
  useEffect(() => { applyPrefs(S.theme, S.accent) }, [S.theme, S.accent])
  useEffect(() => {
    if (S.theme !== 'system' || !window.matchMedia) return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyPrefs(S.theme, S.accent)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [S.theme, S.accent])
  useEffect(() => { setLang(S.lang || 'en') }, [S.lang])
  useEffect(() => { setWeightDecimals(S.wdec) }, [S.wdec])
  useEffect(() => { document.documentElement.lang = S.lang || 'en' }, [langV, S.lang])
  const pathRef = useRef(null)
  useEffect(() => installViewportGuard(), [])
  useEffect(() => installChipDrag(), [])
  useEffect(() => {
    if (MOBILE || !user || !ready) return
    syncPushSubscription().catch(() => {})
  }, [user?.id, ready])
  useEffect(() => {
    if (!user || !ready) return
    loadExerciseOverrides().catch(() => {})
  }, [user?.id, ready])
  useEffect(() => {
    if (!user?.id || !ready) return
    api(`/api/geo/user/${encodeURIComponent(user.id)}`).catch(() => {})
  }, [user?.id, ready])
  useEffect(() => {
    const onScroll = () => {
      if (document.body.style.position === 'fixed') return
      scrollPositions.set(pathRef.current, window.scrollY)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useLayoutEffect(() => {
    const samePath = pathRef.current === loc.pathname
    pathRef.current = loc.pathname
    if (navType !== 'POP') { window.scrollTo(0, 0); return }
    if (samePath) return
    const y = scrollPositions.get(loc.pathname) || 0
    const frame = window.requestAnimationFrame(() => window.scrollTo(0, y))
    return () => window.cancelAnimationFrame(frame)
  }, [loc.pathname, navType])
  useWakeLock(!!S.active && S.keepAwake !== false)

  const authed = user || isGuest
  if (!ready && !authed) return <div id="app" />

  return (
    <>
      <div id="app" className="vfade" key={loc.pathname + loc.search}>
        <ErrorBoundary>
          {authed && !needsMobileOnboarding && <SyncBanner />}
          {!authed ? <Login /> : needsMobileOnboarding ? <MobileOnboarding /> : (
            <Routes>
              <Route path="/home" element={<ModeHome />} />
              {S.checkIn !== false && <Route path="/checkin" element={<CheckIn />} />}
              <Route path="/plan" element={<Plan />} />
              <Route path="/plan/r/:id" element={<RoutineEdit />} />
              <Route path="/workout" element={<Workout />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/history" element={<History />} />
              <Route path="/library" element={<Library />} />
              <Route path="/muscles" element={<Muscles />} />
              <Route path="/settings" element={<UnifiedSettings />} />
              <Route path="/trainer/exercises" element={<RoleLibrary mode="trainer" />} />
              <Route path="/business/exercises" element={<RoleLibrary mode="business" />} />
              <Route path="/trainer" element={<RoleModeRoot mode="trainer" />} />
              <Route path="/business" element={<RoleModeRoot mode="business" />} />
              <Route path="/admin" element={<RoleModeRoot mode="admin" />} />
              <Route path="/coach" element={<CoachChat />} />
              <Route path="/coach/intake" element={<CoachIntake />} />
              <Route path="/coach/proposal" element={<Navigate to="/coach" replace />} />
              <Route path="/coach/setup" element={<CoachSetup />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          )}
        </ErrorBoundary>
      </div>
      {loc.pathname !== '/coach' && <TabBar onStart={startFlow} />}
      <RestTimer />
      <Modals />
      <Toast />
      <TimerFlash />
    </>
  )
}

export default function App() {
  const boot = useStore(s => s.boot)
  useEffect(() => { boot() }, [boot])
  useEffect(() => {
    let stop = null, gone = false
    initBackButton().then(fn => { if (gone) fn(); else stop = fn })
    return () => { gone = true; stop?.() }
  }, [])
  return <HashRouter><Shell /></HashRouter>
}
