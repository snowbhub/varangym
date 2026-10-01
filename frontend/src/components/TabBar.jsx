import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutineIds, effectiveRoutines } from '../lib/history.js'
import { todayISO } from '../lib/format.js'
import { t, useLang } from '../lib/i18n.js'
import { getRoleMode, roleRoute, viewOf } from '../lib/role-mode.js'
import Icon from './Icon.jsx'

export default function TabBar({ onStart }) {
  useLang()
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const isGuest = useStore(s => s.isGuest())
  const parts = loc.pathname.split('/')
  const cur = parts[1] || 'home'
  const legacyPathRole = ['trainer','business','admin'].includes(cur) ? cur : null

  if (!user && !isGuest) return null
  const storedRole = getRoleMode()
  const carriesMode = ['home','settings','plan','muscles','library'].includes(cur)
  const roleMode = legacyPathRole || (carriesMode ? storedRole : null)
  const roleView = legacyPathRole
    ? (parts[2] === 'exercises' ? 'exercises' : viewOf(loc.search))
    : roleMode
      ? cur === 'home' ? viewOf(loc.search)
        : cur === 'plan' ? 'dashboard'
          : (cur === 'muscles' || cur === 'library') ? 'exercises'
            : null
      : null

  if (roleMode) {
    const copy = roleMode === 'admin'
      ? { people: t('Accounts'), dashboard: t('Finances'), dashboardIcon: 'chart' }
      : roleMode === 'business'
        ? { people: t('Team'), dashboard: t('Plans'), dashboardIcon: 'calendar' }
        : { people: t('Clients'), dashboard: t('Programs'), dashboardIcon: 'calendar' }
    const RoleTab = ({ view, icon, label }) => (
      <button className={roleView === view ? 'on' : ''} onClick={() => nav(roleRoute(roleMode, view))}>
        <Icon name={icon} /><span>{label}</span>
      </button>
    )
    return <nav id="tabbar">
      <RoleTab view="home" icon="house" label={t('Home')} />
      <RoleTab view="people" icon="personCircle" label={copy.people} />
      <button className={'start' + (roleView === 'dashboard' ? ' on' : '')} onClick={() => nav(roleRoute(roleMode, 'dashboard'))}>
        <span className="cir"><Icon name={copy.dashboardIcon} /></span>
        <span>{copy.dashboard}</span>
      </button>
      <RoleTab view="stats" icon="chartLine" label={t('Stats')} />
      <RoleTab view="exercises" icon="list" label={t('Exercises')} />
    </nav>
  }

  const on = k => cur === k || (cur === 'history' && k === 'stats') || (cur === 'settings' && k === 'home') || (cur === 'muscles' && k === 'library')

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
      <Tab k="library" icon="list" to="/library" label={t('Exercises')} />
    </nav>
  )
}
