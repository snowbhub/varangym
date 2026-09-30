import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutineIds, effectiveRoutines } from '../lib/history.js'
import { todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { roleRoute, viewOf } from '../lib/role-mode.js'
import Icon from './Icon.jsx'

export default function TabBar({ onStart }) {
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const isGuest = useStore(s => s.isGuest())

  if (!user && !isGuest) return null
  const parts = loc.pathname.split('/')
  const cur = parts[1] || 'home'
  const roleMode = ['trainer','business','admin'].includes(cur) ? cur : null
  const roleView = parts[2] === 'exercises' ? 'exercises' : viewOf(loc.search)

  if (roleMode) {
    const copy = roleMode === 'admin'
      ? { people: 'Акаунти', dashboard: 'Фінанси', dashboardIcon: 'creditCard' }
      : roleMode === 'business'
        ? { people: 'Команда', dashboard: 'Плани', dashboardIcon: 'calendar' }
        : { people: 'Клієнти', dashboard: 'Програми', dashboardIcon: 'calendar' }
    const RoleTab = ({ view, icon, label }) => (
      <button className={roleView === view ? 'on' : ''} onClick={() => nav(roleRoute(roleMode, view))}>
        <Icon name={icon} /><span>{label}</span>
      </button>
    )
    return <nav id="tabbar">
      <RoleTab view="home" icon="house" label="Головна" />
      <RoleTab view="people" icon="personCircle" label={copy.people} />
      <button className={'start' + (roleView === 'dashboard' ? ' on' : '')} onClick={() => nav(roleRoute(roleMode, 'dashboard'))}>
        <span className="cir"><Icon name={copy.dashboardIcon} /></span>
        <span>{copy.dashboard}</span>
      </button>
      <RoleTab view="stats" icon="chartLine" label="Статистика" />
      <RoleTab view="exercises" icon="list" label="Вправи" />
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
