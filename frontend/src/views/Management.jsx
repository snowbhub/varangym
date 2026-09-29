import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useUI } from '../store/useUI.js'
import Icon from '../components/Icon.jsx'
import { Button, TextField } from '../components/ui.jsx'
import '../management.css'

const ROLE_LABEL = {
  trainer: 'Тренер', owner: 'Власник', admin: 'Адміністратор', client: 'Клієнт',
}

const money = (cents, currency = 'EUR') => {
  const n = Number(cents || 0) / 100
  try { return new Intl.NumberFormat('uk-UA', { style: 'currency', currency }).format(n) }
  catch { return `${n.toFixed(2)} ${currency}` }
}

const shortDate = value => {
  if (!value) return '—'
  try { return new Date(value).toLocaleDateString('uk-UA') } catch { return '—' }
}

function StaticLoading() {
  return <div className="mg-static-loading" aria-label="Завантаження"><i /><i /><i /></div>
}

function Empty({ children }) {
  return <div className="mg-empty">{children}</div>
}

function Metric({ label, value, note }) {
  return <div className="mg-metric"><span>{label}</span><b>{value}</b>{note && <small>{note}</small>}</div>
}

function Header({ title, subtitle, onBack, right }) {
  return <div className="hdr mg-header">
    <button className="iconbtn" onClick={onBack} aria-label="Назад"><Icon name="chevronLeft" /></button>
    <div className="grow"><h1>{title}</h1>{subtitle && <div className="sub">{subtitle}</div>}</div>
    {right || <span className="mg-header-spacer" />}
  </div>
}

function RoleSwitcher({ modes, value, onChange }) {
  if (modes.length <= 1) return null
  return <div className="mg-role-switch" role="tablist">
    {modes.map(m => <button key={m.id} className={value === m.id ? 'on' : ''} onClick={() => onChange(m.id)}>
      <Icon name={m.icon} /><span>{m.label}</span>
    </button>)}
  </div>
}

function WorkspaceSelect({ memberships, value, onChange }) {
  if (memberships.length <= 1) return null
  return <label className="mg-field">
    <span>Workspace</span>
    <select value={value} onChange={e => onChange(e.target.value)}>
      {memberships.map(m => <option key={`${m.workspace_id}:${m.role}`} value={m.workspace_id}>{m.workspace_name} · {ROLE_LABEL[m.role] || m.role}</option>)}
    </select>
  </label>
}

function InviteComposer({ session, mode, workspaceId, workspaces = [] }) {
  const toast = useUI(s => s.toast)
  const [open, setOpen] = useState(false)
  const [targetRole, setTargetRole] = useState(mode === 'trainer' ? 'client' : mode === 'business' ? 'trainer' : 'solo_client')
  const [selectedWorkspace, setSelectedWorkspace] = useState(workspaceId || '')
  const [email, setEmail] = useState('')
  const [orgName, setOrgName] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (workspaceId) setSelectedWorkspace(workspaceId) }, [workspaceId])

  const options = mode === 'trainer'
    ? [['client', 'Клієнт']]
    : mode === 'business'
      ? [['client', 'Клієнт'], ['trainer', 'Тренер'], ['organization_admin', 'Адміністратор бізнесу']]
      : [['solo_client', 'Самостійний клієнт'], ['independent_trainer', 'Самостійний тренер'], ['organization_owner', 'Власник бізнесу'], ['platform_admin', 'Platform admin'], ['client', 'Клієнт workspace'], ['trainer', 'Тренер workspace']]

  const requiresWorkspace = ['client', 'trainer', 'organization_admin'].includes(targetRole)
  const requiresName = ['organization_owner', 'independent_trainer'].includes(targetRole)

  const create = async () => {
    if (requiresWorkspace && !selectedWorkspace) return toast('Вибери workspace')
    if (requiresName && !orgName.trim()) return toast('Введи назву workspace')
    setBusy(true)
    try {
      const d = await api('/api/invites', {
        method: 'POST',
        body: JSON.stringify({
          targetRole,
          workspaceId: requiresWorkspace ? selectedWorkspace : null,
          trainerUserId: targetRole === 'client' && mode === 'trainer' ? session.user.id : null,
          email: email.trim() || null,
          maxUses: 1,
          expiresInDays: 7,
          metadata: requiresName ? { organizationName: orgName.trim(), workspaceName: orgName.trim() } : {},
        }),
      })
      setResult(d)
      toast('Код створено')
    } catch (e) { toast(e.message || 'Не вдалося створити код') }
    setBusy(false)
  }

  const copy = async () => {
    const code = result?.code
    if (!code) return
    try { await navigator.clipboard.writeText(code); toast('Код скопійовано') } catch { toast(code) }
  }

  return <div className="card mg-invite-card">
    <button className="mg-card-head" onClick={() => setOpen(v => !v)}>
      <span className="lrow-i" style={{ background: 'var(--green)' }}><Icon name="plus" /></span>
      <span className="grow"><b>Запрошення</b><small>Додати нового користувача без другого логіна</small></span>
      <Icon name={open ? 'chevronUp' : 'chevronRight'} className="chev" />
    </button>
    {open && <div className="mg-invite-body">
      <label className="mg-field"><span>Кого запросити</span><select value={targetRole} onChange={e => setTargetRole(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      {requiresWorkspace && <label className="mg-field"><span>Workspace</span><select value={selectedWorkspace} onChange={e => setSelectedWorkspace(e.target.value)}><option value="">Оберіть…</option>{workspaces.map(w => <option key={w.id || w.workspace_id} value={w.id || w.workspace_id}>{w.name || w.workspace_name}</option>)}</select></label>}
      {requiresName && <label className="mg-field"><span>Назва workspace</span><TextField value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Наприклад, Kiril Coach" /></label>}
      <label className="mg-field"><span>Email <i>необовʼязково</i></span><TextField type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></label>
      <Button variant="primary" onClick={create} disabled={busy}>{busy ? 'Створення…' : 'Створити код'}</Button>
      {result?.code && <div className="mg-invite-result"><span>Код</span><strong>{result.code}</strong><Button size="sm" onClick={copy} icon="clipboard">Скопіювати</Button></div>}
    </div>}
  </div>
}

function ProgramEditor({ session, workspaceId, client, onPublished }) {
  const toast = useUI(s => s.toast)
  const [name, setName] = useState('')
  const [versionId, setVersionId] = useState('')
  const [days, setDays] = useState([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    setName('')
    setVersionId('')
    setDays([])
    setQuery('')
    setResults([])
  }, [client?.id, workspaceId])

  const create = async () => {
    if (!name.trim()) return toast('Введи назву програми')
    setBusy(true)
    try {
      const d = await api('/api/training/programs', { method: 'POST', body: JSON.stringify({ workspaceId, clientId: client.id, name: name.trim() }) })
      setVersionId(d.version.id)
      setDays([{ title: 'День 1', weekday: null, exercises: [] }])
      toast('Чернетку створено')
    } catch (e) { toast(e.message) }
    setBusy(false)
  }

  const search = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const d = await api(`/api/training/exercises?workspaceId=${encodeURIComponent(workspaceId)}&scope=global&q=${encodeURIComponent(query.trim())}&limit=40`)
      setResults(d.exercises || [])
    } catch (e) { toast(e.message) }
    setSearching(false)
  }

  const addDay = () => setDays(x => [...x, { title: `День ${x.length + 1}`, weekday: null, exercises: [] }])
  const updateDay = (i, patch) => setDays(x => x.map((d, di) => di === i ? { ...d, ...patch } : d))
  const removeDay = i => setDays(x => x.filter((_, di) => di !== i))
  const addExercise = ex => setDays(x => {
    if (!x.length) return [{ title: 'День 1', weekday: null, exercises: [{ exerciseId: ex.id, name: ex.name, sets: 3, reps: 10, restSec: 90 }] }]
    return x.map((d, i) => i === x.length - 1 ? { ...d, exercises: [...d.exercises, { exerciseId: ex.id, name: ex.name, sets: 3, reps: 10, restSec: 90 }] } : d)
  })
  const updateExercise = (di, ei, patch) => setDays(x => x.map((d, i) => i === di ? { ...d, exercises: d.exercises.map((ex, j) => j === ei ? { ...ex, ...patch } : ex) } : d))
  const removeExercise = (di, ei) => setDays(x => x.map((d, i) => i === di ? { ...d, exercises: d.exercises.filter((_, j) => j !== ei) } : d))

  const save = async () => {
    if (!versionId) return
    setBusy(true)
    try {
      await api('/api/training/programs/save', {
        method: 'POST',
        body: JSON.stringify({
          versionId,
          days: days.map((d, i) => ({
            title: d.title || `День ${i + 1}`,
            weekday: d.weekday === '' || d.weekday == null ? null : Number(d.weekday),
            sequenceIndex: i,
            exercises: d.exercises.map(ex => ({ exerciseId: ex.exerciseId, prescription: { sets: Number(ex.sets) || 1, reps: Number(ex.reps) || 1, restSec: Number(ex.restSec) || 0 } })),
          })),
        }),
      })
      toast('Чернетку збережено')
      return true
    } catch (e) { toast(e.message); return false }
    finally { setBusy(false) }
  }

  const publish = async () => {
    if (!days.length || !days.some(d => d.exercises.length)) return toast('Додай хоча б одну вправу')
    const ok = await save()
    if (!ok) return
    setBusy(true)
    try {
      await api('/api/training/programs/publish', { method: 'POST', body: JSON.stringify({ versionId }) })
      toast('Програму опубліковано клієнту')
      setVersionId(''); setDays([]); setName('')
      onPublished?.()
    } catch (e) { toast(e.message) }
    setBusy(false)
  }

  if (!versionId) return <div className="card">
    <h2>Нова програма для {client.display_name}</h2>
    <div className="mg-inline-form"><TextField value={name} onChange={e => setName(e.target.value)} placeholder="Назва програми" /><Button variant="primary" onClick={create} disabled={busy}>Створити</Button></div>
  </div>

  return <div className="card mg-editor">
    <div className="row between mg-editor-head"><div><h2>{name}</h2><div className="muted small">Чернетка · зміни зберігаються в PostgreSQL</div></div><Button size="sm" icon="plus" onClick={addDay}>День</Button></div>
    <div className="mg-search"><TextField value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') search() }} placeholder="Пошук вправи" /><Button onClick={search} disabled={searching}>{searching ? '…' : 'Знайти'}</Button></div>
    {!!results.length && <div className="mg-ex-results">{results.slice(0, 20).map(ex => <button key={ex.id} onClick={() => addExercise(ex)}><span><b>{ex.name}</b><small>{ex.primary_muscle_key || ex.equipment_key || ''}</small></span><Icon name="plus" /></button>)}</div>}
    <div className="mg-days">{days.map((d, di) => <div className="mg-day" key={di}>
      <div className="mg-day-head"><TextField value={d.title} onChange={e => updateDay(di, { title: e.target.value })} /><select value={d.weekday ?? ''} onChange={e => updateDay(di, { weekday: e.target.value === '' ? null : Number(e.target.value) })}><option value="">Без дня</option><option value="1">Пн</option><option value="2">Вт</option><option value="3">Ср</option><option value="4">Чт</option><option value="5">Пт</option><option value="6">Сб</option><option value="0">Нд</option></select><button className="iconbtn mg-remove" onClick={() => removeDay(di)} aria-label="Видалити день"><Icon name="trash" /></button></div>
      {d.exercises.length ? d.exercises.map((ex, ei) => <div className="mg-program-ex" key={`${ex.exerciseId}:${ei}`}>
        <div className="grow"><b>{ex.name}</b><div className="mg-prescription"><label>Підходи<input type="number" min="1" value={ex.sets} onChange={e => updateExercise(di, ei, { sets: e.target.value })} /></label><label>Повтори<input type="number" min="1" value={ex.reps} onChange={e => updateExercise(di, ei, { reps: e.target.value })} /></label><label>Відпочинок<input type="number" min="0" value={ex.restSec} onChange={e => updateExercise(di, ei, { restSec: e.target.value })} /></label></div></div>
        <button className="iconbtn mg-remove" onClick={() => removeExercise(di, ei)} aria-label="Видалити вправу"><Icon name="trash" /></button>
      </div>) : <div className="mg-empty compact">Додай вправу з пошуку — вона потрапить у останній день.</div>}
    </div>)}</div>
    <div className="mg-actions"><Button onClick={save} disabled={busy}>Зберегти</Button><Button variant="primary" onClick={publish} disabled={busy}>Опублікувати клієнту</Button></div>
  </div>
}

function TrainerPanel({ session, memberships }) {
  const toast = useUI(s => s.toast)
  const [workspaceId, setWorkspaceId] = useState(memberships[0]?.workspace_id || '')
  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState('')
  const [programs, setPrograms] = useState([])
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true); setClientId(''); setPrograms([]); setProgress(null)
    api(`/api/coach/clients?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(d => setClients(d.clients || [])).catch(e => toast(e.message)).finally(() => setLoading(false))
  }, [workspaceId])

  const openClient = async id => {
    setClientId(id); setLoading(true)
    try {
      const [p, pr] = await Promise.all([
        api(`/api/training/programs?workspaceId=${encodeURIComponent(workspaceId)}&clientId=${encodeURIComponent(id)}`),
        api(`/api/training/coach/progress?workspaceId=${encodeURIComponent(workspaceId)}&clientId=${encodeURIComponent(id)}`),
      ])
      setPrograms(p.programs || []); setProgress(pr)
    } catch (e) { toast(e.message) }
    setLoading(false)
  }
  const selected = clients.find(c => c.id === clientId)

  return <>
    <WorkspaceSelect memberships={memberships} value={workspaceId} onChange={setWorkspaceId} />
    <div className="mg-metrics"><Metric label="Клієнти" value={clients.length} /><Metric label="Активні 30 днів" value={clients.filter(c => Number(c.workouts_30d) > 0).length} /><Metric label="Workspace" value={memberships.find(m => m.workspace_id === workspaceId)?.workspace_name || '—'} /></div>
    <InviteComposer session={session} mode="trainer" workspaceId={workspaceId} workspaces={memberships.map(m => ({ id: m.workspace_id, name: m.workspace_name }))} />
    <div className="card">
      <div className="row between"><h2>Клієнти</h2><span className="muted small">{clients.length}</span></div>
      {loading && !clients.length ? <StaticLoading /> : clients.length ? <div className="mg-list">{clients.map(c => <button key={c.id} className={'mg-list-row' + (clientId === c.id ? ' on' : '')} onClick={() => openClient(c.id)}>
        <span className="mg-avatar">{(c.display_name || '?').slice(0, 1).toUpperCase()}</span><span className="grow"><b>{c.display_name}</b><small>{c.workouts_30d || 0} тренувань / 30 днів · останнє {shortDate(c.last_workout_at)}</small></span><Icon name="chevronRight" className="chev" />
      </button>)}</div> : <Empty>Клієнтів ще немає. Створи код запрошення вище.</Empty>}
    </div>
    {selected && <>
      <div className="card">
        <div className="row between"><div><div className="small muted">Клієнт</div><h2 className="mg-client-name">{selected.display_name}</h2></div><span className="adm-pill acc">{selected.workouts_30d || 0} / 30 днів</span></div>
        <div className="mg-metrics mg-metrics-inline"><Metric label="Тренувань" value={progress?.workouts?.length || 0} /><Metric label="Остання вага" value={progress?.bodyweights?.[0]?.weight ? `${progress.bodyweights[0].weight} кг` : '—'} /><Metric label="Вправ у прогресі" value={progress?.performances?.length || 0} /></div>
      </div>
      <div className="card"><div className="row between"><h2>Програми</h2><span className="muted small">{programs.length}</span></div>{programs.length ? <div className="mg-list">{programs.map(p => <div className="mg-list-row" key={p.id}><span className="grow"><b>{p.name}</b><small>v{p.latest_version || 0} · {p.published_version_id ? 'опубліковано' : 'чернетка'}</small></span><span className={'adm-pill ' + (p.published_version_id ? 'ok' : 'warn')}>{p.published_version_id ? 'active' : 'draft'}</span></div>)}</div> : <Empty>У клієнта ще немає програм.</Empty>}</div>
      <ProgramEditor session={session} workspaceId={workspaceId} client={selected} onPublished={() => openClient(selected.id)} />
      <div className="card"><h2>Останні тренування</h2>{progress?.workouts?.length ? <div className="mg-list">{progress.workouts.slice(0, 12).map(w => <div className="mg-list-row" key={w.id}><span className="grow"><b>{w.name}</b><small>{shortDate(w.started_at)} · {w.completed_sets || 0} підходів</small></span><span className="muted small">{Math.round(Number(w.volume || 0))} kg</span></div>)}</div> : <Empty>Історії поки немає.</Empty>}</div>
    </>}
  </>
}

function BusinessPanel({ session, memberships }) {
  const toast = useUI(s => s.toast)
  const [workspaceId, setWorkspaceId] = useState(memberships[0]?.workspace_id || '')
  const [overview, setOverview] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = async id => {
    if (!id) return
    setLoading(true)
    try {
      const o = await api(`/api/business/overview?workspaceId=${encodeURIComponent(id)}`)
      setOverview(o)
      try { setAnalytics(await api(`/api/analytics/business?workspaceId=${encodeURIComponent(id)}&days=30`)) } catch { setAnalytics(null) }
    } catch (e) { toast(e.message) }
    setLoading(false)
  }
  useEffect(() => { load(workspaceId) }, [workspaceId])

  const ws = memberships.map(m => ({ id: m.workspace_id, name: m.workspace_name }))
  return <>
    <WorkspaceSelect memberships={memberships} value={workspaceId} onChange={setWorkspaceId} />
    {loading && !overview ? <StaticLoading /> : overview && <>
      <div className="mg-metrics"><Metric label="Тренери" value={overview.stats.trainers} /><Metric label="Клієнти" value={overview.stats.clients} /><Metric label="Менеджери" value={overview.stats.managers} /></div>
      <InviteComposer session={session} mode="business" workspaceId={workspaceId} workspaces={ws} />
      <div className="card"><div className="row between"><h2>Тренери</h2><span className="muted small">{overview.trainers.length}</span></div>{overview.trainers.length ? <div className="mg-list">{overview.trainers.map(t => <div className="mg-list-row" key={t.id}><span className="mg-avatar">{(t.display_name || '?').slice(0, 1).toUpperCase()}</span><span className="grow"><b>{t.display_name}</b><small>{t.email || 'Без email'}</small></span><span className="adm-pill">{t.clients} клієнтів</span></div>)}</div> : <Empty>Ще немає тренерів.</Empty>}</div>
      <div className="card"><h2>Останні 30 днів</h2>{analytics ? <><div className="mg-metrics mg-metrics-inline"><Metric label="Дохід" value={money(analytics.revenue?.period_cents)} /><Metric label="Оплат" value={analytics.revenue?.paid_count || 0} /><Metric label="Тренерів у звіті" value={analytics.trainers?.length || 0} /></div><div className="mg-list">{(analytics.trainers || []).map(t => <div className="mg-list-row" key={t.id}><span className="grow"><b>{t.display_name}</b><small>{t.workouts_period || 0} тренувань · {t.active_clients_7d || 0} активних клієнтів / 7 днів</small></span></div>)}</div></> : <div className="mg-note">Основні дані бізнесу працюють. Розширена аналітика тимчасово недоступна — панель не ламається через помилку аналітичного сервісу.</div>}</div>
    </>}
  </>
}

function AdminPanel({ session }) {
  const toast = useUI(s => s.toast)
  const [overview, setOverview] = useState(null)
  const [workspaces, setWorkspaces] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [o, w] = await Promise.all([api('/api/admin/overview'), api('/api/admin/workspaces')])
      setOverview(o); setWorkspaces(w.workspaces || [])
      try { setAnalytics(await api('/api/analytics/admin?days=30')) } catch { setAnalytics(null) }
    } catch (e) { toast(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  if (loading && !overview) return <StaticLoading />
  return <>
    {overview && <div className="mg-metrics"><Metric label="Користувачі" value={overview.users.total} note={`${overview.users.active} active`} /><Metric label="Бізнеси" value={overview.workspaces.organizations} /><Metric label="Trainer-client" value={overview.trainerClientLinks} /></div>}
    <InviteComposer session={session} mode="admin" workspaces={workspaces.map(w => ({ id: w.id, name: w.name }))} />
    <div className="card"><div className="row between"><h2>Workspaces</h2><Button size="sm" icon="refresh" onClick={load}>Оновити</Button></div>{workspaces.length ? <div className="mg-list">{workspaces.map(w => <div className="mg-list-row" key={w.id}><span className="grow"><b>{w.name}</b><small>{w.type} · {w.members} учасників</small></span><span className="mg-workspace-counts"><i>{w.trainers} T</i><i>{w.clients} C</i></span></div>)}</div> : <Empty>Workspace ще немає.</Empty>}</div>
    <div className="card"><h2>Платформа · 30 днів</h2>{analytics ? <><div className="mg-metrics mg-metrics-inline"><Metric label="Нові користувачі" value={analytics.users?.new_users || 0} /><Metric label="Active 7d" value={analytics.users?.active_7d || 0} /><Metric label="Дохід" value={money(analytics.revenue?.period_cents)} /></div>{analytics.userList?.length ? <div className="mg-list">{analytics.userList.slice(0, 20).map(u => <div className="mg-list-row" key={u.id}><span className="grow"><b>{u.display_name}</b><small>{u.email || u.locale || '—'} · {u.workouts_30d || 0} тренувань / 30 днів</small></span>{u.is_platform_admin && <span className="adm-pill acc">admin</span>}</div>)}</div> : null}</> : <div className="mg-note">Огляд користувачів і workspace доступний вище. Розширена аналітика не блокує адмін-панель, якщо analytics API відповідає помилкою.</div>}</div>
  </>
}

export default function Management() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const [session, setSession] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState(null)

  useEffect(() => {
    let alive = true
    api('/api/me').then(d => { if (alive) setSession(d) }).catch(e => { if (alive) setError(e) })
    return () => { alive = false }
  }, [])

  const memberships = session?.memberships || []
  const trainerMemberships = useMemo(() => memberships.filter(m => ['trainer', 'owner', 'admin'].includes(m.role)), [memberships])
  const businessMemberships = useMemo(() => memberships.filter(m => m.workspace_type === 'organization' && ['owner', 'admin'].includes(m.role)), [memberships])
  const isPlatformAdmin = !!session?.user?.is_platform_admin
  const modes = useMemo(() => [
    ...(trainerMemberships.length ? [{ id: 'trainer', label: 'Тренер', icon: 'personCircle' }] : []),
    ...(businessMemberships.length ? [{ id: 'business', label: 'Бізнес', icon: 'chart' }] : []),
    ...(isPlatformAdmin ? [{ id: 'admin', label: 'Адмін', icon: 'shield' }] : []),
  ], [trainerMemberships.length, businessMemberships.length, isPlatformAdmin])

  useEffect(() => {
    if (!mode && modes.length) setMode(modes[0].id)
    else if (mode && !modes.some(m => m.id === mode)) setMode(modes[0]?.id || null)
  }, [modes, mode])

  if (error) return <div className="narrow"><Header title="Панель" onBack={() => nav('/home')} /><Empty>Сесію не знайдено. Увійди у VARANGYM один раз через основний екран.</Empty></div>
  if (!session) return <div className="narrow"><Header title="Панель" onBack={() => nav('/home')} /><StaticLoading /></div>
  if (!modes.length) return <div className="narrow"><Header title="Панель" onBack={() => nav('/home')} /><Empty>Для цього акаунта немає ролі тренера, власника бізнесу або platform admin.</Empty></div>

  const active = modes.find(m => m.id === mode)
  return <div className="narrow mg-page">
    <Header title={mode === 'trainer' ? 'Панель тренера' : mode === 'business' ? 'Бізнес-панель' : 'Адмін-панель'} subtitle={session.user.display_name || session.user.name} onBack={() => nav('/home')} right={<button className="iconbtn" onClick={() => nav('/settings')} aria-label="Налаштування"><Icon name="gear" /></button>} />
    <RoleSwitcher modes={modes} value={mode} onChange={setMode} />
    <div className="mg-role-context"><span className="lrow-i" style={{ background: mode === 'trainer' ? 'var(--indigo)' : mode === 'business' ? 'var(--blue)' : 'var(--red)' }}><Icon name={active?.icon || 'wrench'} /></span><span><b>{active?.label}</b><small>Той самий акаунт · той самий Passkey · без повторного входу</small></span></div>
    {mode === 'trainer' && <TrainerPanel session={session} memberships={trainerMemberships} />}
    {mode === 'business' && <BusinessPanel session={session} memberships={businessMemberships} />}
    {mode === 'admin' && <AdminPanel session={session} />}
  </div>
}
