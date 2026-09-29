import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutineIds, effectiveRoutines } from '../lib/history.js'
import { todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { defaultManagementRoute, loadPlatformIdentity } from '../lib/platform-role.js'
import { managementLabels, managementModeFromPath, managementRoute } from '../lib/management-path.js'
import Icon from './Icon.jsx'

export default function TabBar({ onStart }) {
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const isGuest = useStore(s => s.isGuest())
  const [panelTo, setPanelTo] = useState(null)

  useEffect(() => {
    let live = true
    if (!user) { setPanelTo(null); return () => { live = false } }
    loadPlatformIdentity()
      .then(me => { if (live) setPanelTo(defaultManagementRoute(me)) })
      .catch(() => { if (live) setPanelTo(null) })
    return () => { live = false }
  }, [user?.id])

  if (!user && !isGuest) return null

  const management = managementModeFromPath(loc.pathname)
  if (management) {
    const labels = managementLabels(management.mode)
    const MTab = ({ section, icon }) => <button className={management.section === section ? 'on' : ''} onClick={() => nav(managementRoute(management.mode, section))}>
      <Icon name={icon} /><span>{labels[section]}</span>
    </button>
    return <nav id="tabbar">
      <MTab section="home" icon="house" />
      <MTab section="people" icon="personCircle" />
      <button className={'start' + (management.section === 'dashboard' ? ' on' : '')} onClick={() => nav(managementRoute(management.mode, 'dashboard'))}>
        <span className="cir"><Icon name="chart" /></span>
        <span>{labels.dashboard}</span>
      </button>
      <MTab section="stats" icon="chartLine" />
      <MTab section="exercises" icon="list" />
    </nav>
  }

  const cur = loc.pathname.split('/')[1] || 'home'
  const on = k => cur === k || (cur === 'history' && k === 'stats') || (cur === 'settings' && k === 'home') || (cur === 'muscles' && k === 'library') || (k === 'panel' && ['trainer', 'business', 'admin'].includes(cur))

  const startWorkout = () => {
    if (!S.active) {
      if (effectiveRoutines(S, todayISO()).some(r => r.ex.length)) { onStart(effectiveRoutineIds(S, todayISO())); return }
    }
    nav('/workout')
  }
  const Tab = ({ k, icon, to, label }) => (
    <button className={on(k) ? 'on' : ''} onClick={() => nav(to)}>
      <Icon name={icon} /><span>{label}</span>
    </button>
  )

  return (
    <nav id="tabbar">
      <Tab k="home" icon="house" to="/home" label={t('Home')} />
      <Tab k="plan" icon="calendar" to="/plan" label={t('Plan')} />
      <button className={'start' + (S.active ? ' rec' : '') + (S.active && cur === 'workout' ? ' on' : '')} onClick={startWorkout}>
        <span className="cir"><Icon name={S.active ? (cur === 'workout' ? 'dumbbell' : 'play') : 'dumbbell'} /></span>
        <span>{S.active ? (cur === 'workout' ? t('Workout') : t('Resume')) : t('Start')}</span>
      </button>
      <Tab k="stats" icon="chart" to="/stats" label={t('Stats')} />
      {panelTo ? <Tab k="panel" icon="wrench" to={panelTo} label="Panel" /> : <Tab k="library" icon="list" to="/library" label={t('Exercises')} />}
    </nav>
  )
}
