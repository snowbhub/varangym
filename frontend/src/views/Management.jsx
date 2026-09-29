import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import {
  businessMemberships,
  defaultManagementRoute,
  loadPlatformIdentity,
  platformAccess,
  trainerMemberships,
} from '../lib/platform-role.js'
import Icon from '../components/Icon.jsx'
import { Button, Row, Section, Segmented } from '../components/ui.jsx'

const LABELS = {
  trainer: 'Панель тренера',
  business: 'Бізнес-панель',
  admin: 'Адмін-панель',
}

function dateText(v) {
  if (!v) return '—'
  try { return new Date(v).toLocaleDateString() } catch { return '—' }
}

function Metric({ value, label, note }) {
  return <div className="stat">
    <div className="n">{value ?? '—'}</div>
    <div className="l">{label}</div>
    {note && <div className="s">{note}</div>}
  </div>
}

function ErrorCard({ message, onRetry }) {
  return <div className="card">
    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
      <span className="lrow-i" style={{ background: 'var(--red)' }}><Icon name="exclamation" /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ttl">Не вдалося завантажити панель</div>
        <div className="ss" style={{ marginTop: 4 }}>{message || 'Спробуй ще раз.'}</div>
      </div>
    </div>
    <div style={{ height: 12 }} />
    <Button onClick={onRetry}>Повторити</Button>
  </div>
}

export default function Management({ mode }) {
  const nav = useNavigate()
  const [identity, setIdentity] = useState(null)
  const [data, setData] = useState(null)
  const [loadingIdentity, setLoadingIdentity] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState('')

  const access = useMemo(() => platformAccess(identity), [identity])
  const trainerSpaces = useMemo(() => trainerMemberships(identity), [identity])
  const businessSpaces = useMemo(() => businessMemberships(identity), [identity])
  const [trainerWorkspaceId, setTrainerWorkspaceId] = useState('')
  const [businessWorkspaceId, setBusinessWorkspaceId] = useState('')

  useEffect(() => {
    let live = true
    setLoadingIdentity(true)
    loadPlatformIdentity()
      .then(me => {
        if (!live) return
        setIdentity(me)
        const trainers = trainerMemberships(me)
        const businesses = businessMemberships(me)
        setTrainerWorkspaceId(v => v || trainers[0]?.workspace_id || '')
        setBusinessWorkspaceId(v => v || businesses[0]?.workspace_id || '')
        setError('')
      })
      .catch(e => { if (live) setError(e.message || 'Помилка авторизації') })
      .finally(() => { if (live) setLoadingIdentity(false) })
    return () => { live = false }
  }, [])

  const allowed = identity && (
    (mode === 'admin' && access.platformAdmin) ||
    (mode === 'business' && access.business) ||
    (mode === 'trainer' && access.trainer)
  )

  useEffect(() => {
    if (!identity || allowed) return
    const fallback = defaultManagementRoute(identity)
    nav(fallback || '/home', { replace: true })
  }, [identity, allowed, nav])

  const loadData = async () => {
    if (!identity || !allowed) return
    setLoadingData(true)
    setError('')
    try {
      if (mode === 'trainer') {
        const workspaceId = trainerWorkspaceId || trainerSpaces[0]?.workspace_id
        if (!workspaceId) throw new Error('Немає workspace тренера.')
        const result = await api(`/api/coach/clients?workspaceId=${encodeURIComponent(workspaceId)}`)
        setData({ ...result, workspaceId })
      } else if (mode === 'business') {
        const workspaceId = businessWorkspaceId || businessSpaces[0]?.workspace_id
        if (!workspaceId) throw new Error('Немає business workspace.')
        const result = await api(`/api/business/overview?workspaceId=${encodeURIComponent(workspaceId)}`)
        setData({ ...result, workspaceId })
      } else {
        const [overview, workspaces] = await Promise.all([
          api('/api/admin/overview'),
          api('/api/admin/workspaces'),
        ])
        setData({ overview, workspaces })
      }
    } catch (e) {
      setData(null)
      setError(e.message || 'Помилка завантаження')
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    if (!allowed) return
    loadData()
    // Workspace IDs are explicit dependencies so switching one reloads only this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, allowed, trainerWorkspaceId, businessWorkspaceId])

  const modes = []
  if (access.trainer) modes.push({ value: 'trainer', label: 'Тренер' })
  if (access.business) modes.push({ value: 'business', label: 'Бізнес' })
  if (access.platformAdmin) modes.push({ value: 'admin', label: 'Адмін' })

  const switchMode = next => nav(next === 'trainer' ? '/trainer' : next === 'business' ? '/business' : '/admin')

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/home')} aria-label="Головна"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}>
        <h1>{LABELS[mode] || 'VARANGYM'}</h1>
        <div className="sub">{identity?.user?.display_name || identity?.user?.name || ''}</div>
      </div>
      <button className="iconbtn" onClick={loadData} aria-label="Оновити"><Icon name="reset" /></button>
    </div>

    {loadingIdentity ? <div className="empty">Завантаження…</div> : <>
      {modes.length > 1 && <div className="card" style={{ padding: 8 }}>
        <Segmented options={modes} value={mode} onChange={switchMode} />
      </div>}

      {error && !loadingData && <ErrorCard message={error} onRetry={loadData} />}
      {loadingData && <div className="empty">Завантаження…</div>}

      {!loadingData && data && mode === 'trainer' && <TrainerPanel
        data={data}
        spaces={trainerSpaces}
        workspaceId={trainerWorkspaceId}
        setWorkspaceId={setTrainerWorkspaceId}
      />}
      {!loadingData && data && mode === 'business' && <BusinessPanel
        data={data}
        spaces={businessSpaces}
        workspaceId={businessWorkspaceId}
        setWorkspaceId={setBusinessWorkspaceId}
      />}
      {!loadingData && data && mode === 'admin' && <AdminPanel data={data} />}
    </>}
  </div>
}

function WorkspacePicker({ spaces, value, onChange }) {
  if (spaces.length <= 1) return null
  return <Section title="Workspace">
    {spaces.map(m => <Row
      key={`${m.workspace_id}:${m.role}`}
      icon="personCircle"
      iconTint={m.workspace_id === value ? 'var(--acc)' : 'var(--grey)'}
      title={m.workspace_name || 'Workspace'}
      subtitle={m.role}
      accessory={m.workspace_id === value ? 'check' : 'chevron'}
      onClick={() => onChange(m.workspace_id)}
    />)}
  </Section>
}

function TrainerPanel({ data, spaces, workspaceId, setWorkspaceId }) {
  const clients = data.clients || []
  const current = spaces.find(m => m.workspace_id === workspaceId) || spaces[0]
  return <>
    <WorkspacePicker spaces={spaces} value={workspaceId} onChange={setWorkspaceId} />
    <div className="card">
      <div className="lbl2">Тренер</div>
      <div className="big" style={{ fontSize: 24 }}>{current?.workspace_name || 'VARANGYM'}</div>
      <div className="ss">Клієнти та їхня активність — у тому самому застосунку, без другого входу.</div>
    </div>
    <div className="grid2">
      <Metric value={clients.length} label="клієнтів" />
      <Metric value={clients.reduce((n, c) => n + Number(c.workouts_30d || 0), 0)} label="тренувань / 30 днів" />
    </div>
    <Section title="Клієнти">
      {clients.length ? clients.map(c => <Row
        key={c.user_id || c.id || `${c.display_name}:${c.email}`}
        icon="personCircle"
        iconTint="var(--blue)"
        title={c.display_name || 'Клієнт'}
        subtitle={`${c.email || ''}${c.email ? ' · ' : ''}${c.workouts_30d || 0} тренувань / 30 днів`}
        value={dateText(c.last_workout_at)}
      />) : <Row icon="personCircle" title="Клієнтів ще немає" subtitle="Додай клієнта через запрошення." />}
    </Section>
  </>
}

function BusinessPanel({ data, spaces, workspaceId, setWorkspaceId }) {
  const trainers = data.trainers || []
  const stats = data.stats || {}
  return <>
    <WorkspacePicker spaces={spaces} value={workspaceId} onChange={setWorkspaceId} />
    <div className="card">
      <div className="lbl2">Бізнес</div>
      <div className="big" style={{ fontSize: 24 }}>{data.workspace?.name || spaces.find(m => m.workspace_id === workspaceId)?.workspace_name || 'VARANGYM'}</div>
      <div className="ss">Керування залом і командою всередині основного VARANGYM.</div>
    </div>
    <div className="grid2">
      <Metric value={stats.trainers ?? 0} label="тренерів" />
      <Metric value={stats.clients ?? 0} label="клієнтів" />
      <Metric value={stats.managers ?? 0} label="менеджерів" />
      <Metric value={trainers.reduce((n, t) => n + Number(t.clients || 0), 0)} label="призначень" />
    </div>
    <Section title="Тренери">
      {trainers.length ? trainers.map(t => <Row
        key={t.user_id || t.id || `${t.display_name}:${t.email}`}
        icon="personCircle"
        iconTint="var(--indigo)"
        title={t.display_name || 'Тренер'}
        subtitle={t.email || ''}
        value={`${t.clients || 0} клієнтів`}
      />) : <Row icon="personCircle" title="Тренерів ще немає" />}
    </Section>
  </>
}

function AdminPanel({ data }) {
  const d = data.overview || {}
  const ws = data.workspaces?.workspaces || []
  return <>
    <div className="card">
      <div className="lbl2">VARANGYM Platform</div>
      <div className="big" style={{ fontSize: 24 }}>Адміністрування</div>
      <div className="ss">Користувачі, бізнеси та workspaces в єдиному інтерфейсі.</div>
    </div>
    <div className="grid2">
      <Metric value={d.users?.total ?? 0} label="користувачів" note={`${d.users?.active ?? 0} active`} />
      <Metric value={d.workspaces?.organizations ?? 0} label="організацій" />
      <Metric value={d.trainerClientLinks ?? 0} label="trainer-client" />
      <Metric value={d.invites?.usable ?? 0} label="активних кодів" />
    </div>
    <Section title="Workspaces">
      {ws.length ? ws.map(w => <Row
        key={w.id}
        icon="personCircle"
        iconTint="var(--acc)"
        title={w.name}
        subtitle={`${w.type || 'workspace'} · ${w.members || 0} учасників`}
        value={`${w.trainers || 0} / ${w.clients || 0}`}
      />) : <Row icon="personCircle" title="Workspaces ще немає" />}
    </Section>
  </>
}
