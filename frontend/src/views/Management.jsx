import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useUI } from '../store/useUI.js'
import { confirmSheet } from '../sheets.jsx'
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

const PANEL_TABS = {
  trainer: [
    ['dashboard', 'Дашборд'],
    ['clients', 'Клієнти'],
    ['plan', 'Плани'],
    ['invites', 'Коди'],
    ['analytics', 'Аналітика'],
  ],
  business: [
    ['dashboard', 'Дашборд'],
    ['team', 'Команда'],
    ['invites', 'Коди'],
    ['analytics', 'Аналітика'],
    ['billing', 'Оплата'],
  ],
  admin: [
    ['dashboard', 'Дашборд'],
    ['users', 'Користувачі'],
    ['workspaces', 'Бізнеси'],
    ['invites', 'Коди'],
    ['billing', 'Оплати'],
  ],
}

const ADMIN_INVITE_ROLES = [
  ['solo_client', 'Solo client'],
  ['independent_trainer', 'Independent trainer'],
  ['organization_owner', 'Organization owner'],
  ['platform_admin', 'Platform admin'],
  ['client', 'Client у workspace'],
  ['trainer', 'Trainer у workspace'],
  ['organization_admin', 'Organization admin'],
]

const TRAINER_INVITE_ROLES = [['client', 'Client']]
const BUSINESS_INVITE_ROLES = [
  ['client', 'Client'],
  ['trainer', 'Trainer'],
  ['organization_admin', 'Organization admin'],
]

const needsWorkspace = role => ['client', 'trainer', 'organization_admin'].includes(role)
const number = value => new Intl.NumberFormat('uk-UA').format(Number(value || 0))
const money = (cents, currency = 'USD') => new Intl.NumberFormat('uk-UA', {
  style: 'currency', currency: String(currency || 'USD').toUpperCase(), maximumFractionDigits: 2,
}).format(Number(cents || 0) / 100)

function dateText(value, withTime = false) {
  if (!value) return '—'
  try {
    const d = new Date(value)
    return withTime ? d.toLocaleString('uk-UA') : d.toLocaleDateString('uk-UA')
  } catch { return '—' }
}

function sumDaily(daily = [], key = 'workouts') {
  return daily.reduce((n, x) => n + Number(x?.[key] || 0), 0)
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
    <div className="ttl">Не вдалося завантажити частину панелі</div>
    <div className="ss" style={{ marginTop: 5 }}>{message || 'Спробуй ще раз.'}</div>
    <div style={{ height: 12 }} />
    <Button onClick={onRetry}>Повторити</Button>
  </div>
}

function PanelTabs({ mode, value, onChange }) {
  return <div className="chips" style={{ margin: '0 0 14px', overflowX: 'auto', flexWrap: 'nowrap' }}>
    {(PANEL_TABS[mode] || []).map(([id, label]) => <button
      key={id}
      className={'chip' + (value === id ? ' on' : '')}
      style={{ flex: '0 0 auto' }}
      onClick={() => onChange(id)}
    >{label}</button>)}
  </div>
}

function MiniBars({ daily = [], valueKey = 'workouts', empty = 'Даних ще немає.' }) {
  const values = daily.map(x => Number(x?.[valueKey] || 0))
  const max = Math.max(0, ...values)
  if (!daily.length) return <div className="empty">{empty}</div>
  return <div style={{ height: 146, display: 'flex', gap: 4, alignItems: 'flex-end', paddingTop: 8, borderBottom: 'var(--hair) solid var(--sep)' }}>
    {daily.map((x, i) => {
      const v = values[i]
      const h = max ? Math.max(3, Math.round(v / max * 100)) : 2
      return <div key={`${x.day || i}:${i}`} title={`${x.day || ''}: ${v}`} style={{
        flex: 1, minWidth: 3, height: `${h}%`, borderRadius: '5px 5px 1px 1px',
        background: 'var(--acc)', opacity: v ? .9 : .22,
      }} />
    })}
  </div>
}

function AnalyticsBlock({ analytics, title = 'Активність', subtitle = 'останні 30 днів' }) {
  if (!analytics) return <div className="empty">Аналітика ще не завантажилась.</div>
  const top = analytics.topExercises || []
  return <>
    <div className="card">
      <div className="row between" style={{ marginBottom: 8 }}>
        <div><div className="lbl2">{title}</div><div className="ss">{subtitle}</div></div>
        <b>{number(sumDaily(analytics.daily))}</b>
      </div>
      <MiniBars daily={analytics.daily || []} />
    </div>
    <Section title="Найчастіші вправи">
      {top.length ? top.slice(0, 10).map((x, i) => <Row
        key={`${x.name}:${i}`}
        icon="dumbbell"
        iconTint="var(--acc)"
        title={`${i + 1}. ${x.name || 'Exercise'}`}
        subtitle={`${number(x.workouts)} тренувань`}
        value={`${number(x.completed_sets)} підх.`}
      />) : <Row title="Ще немає достатньо даних" />}
    </Section>
  </>
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

function InviteManager({ mode, workspaceId, workspaces = [], invites = [], onReload }) {
  const toast = useUI(s => s.toast)
  const roles = mode === 'admin' ? ADMIN_INVITE_ROLES : mode === 'business' ? BUSINESS_INVITE_ROLES : TRAINER_INVITE_ROLES
  const [role, setRole] = useState(roles[0][0])
  const [selectedWorkspace, setSelectedWorkspace] = useState(workspaceId || '')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [days, setDays] = useState(7)
  const [uses, setUses] = useState(1)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null)

  useEffect(() => { if (workspaceId) setSelectedWorkspace(workspaceId) }, [workspaceId])

  const copy = text => navigator.clipboard?.writeText(text).then(() => toast('Скопійовано')).catch(() => toast(text))
  const create = async () => {
    const ws = needsWorkspace(role) ? (selectedWorkspace || workspaceId) : null
    if (needsWorkspace(role) && !ws) return toast('Для цієї ролі вибери workspace')
    setBusy(true)
    try {
      const result = await api('/api/invites', {
        method: 'POST',
        body: JSON.stringify({
          targetRole: role,
          workspaceId: ws || null,
          email: email.trim() || null,
          maxUses: Math.max(1, Number(uses) || 1),
          expiresInDays: Math.max(1, Number(days) || 7),
          metadata: {
            organizationName: name.trim() || undefined,
            workspaceName: name.trim() || undefined,
          },
        }),
      })
      const code = result.code
      const url = `${location.origin}/?invite=${encodeURIComponent(code)}`
      setCreated({ code, url })
      toast('Код створено')
      await onReload?.()
    } catch (e) { toast(e.message || 'Не вдалося створити код') }
    finally { setBusy(false) }
  }

  const revoke = invite => confirmSheet({
    title: 'Відкликати цей код?',
    message: 'Після цього ним більше не можна буде зареєструватися. Уже створені акаунти не зміняться.',
    confirmText: 'Відкликати', danger: true,
    onConfirm: async () => {
      try {
        await api('/api/invites/revoke', { method: 'POST', body: JSON.stringify({ id: invite.id }) })
        toast('Код відкликано')
        await onReload?.()
      } catch (e) { toast(e.message || 'Помилка') }
    },
  })

  return <>
    <div className="card">
      <div className="lbl2">Новий код доступу</div>
      <div className="ss" style={{ margin: '4px 0 14px' }}>Код реєстрації створюється тут і працює з тим самим Passkey-входом VARANGYM.</div>
      <div style={{ display: 'grid', gap: 10 }}>
        <label className="small muted">Роль
          <select className="field" value={role} onChange={e => setRole(e.target.value)} style={{ marginTop: 5 }}>
            {roles.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {mode === 'admin' && needsWorkspace(role) && <label className="small muted">Workspace
          <select className="field" value={selectedWorkspace} onChange={e => setSelectedWorkspace(e.target.value)} style={{ marginTop: 5 }}>
            <option value="">— вибрати —</option>
            {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>}
        {(role === 'organization_owner' || role === 'independent_trainer') && <label className="small muted">Назва workspace
          <input className="field" value={name} onChange={e => setName(e.target.value)} placeholder="Наприклад, Kiril Coach" style={{ marginTop: 5 }} />
        </label>}
        <label className="small muted">Email (необовʼязково)
          <input className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" style={{ marginTop: 5 }} />
        </label>
        <div className="grid2">
          <label className="small muted">Днів дії
            <input className="field" type="number" min="1" max="365" value={days} onChange={e => setDays(e.target.value)} style={{ marginTop: 5 }} />
          </label>
          <label className="small muted">Використань
            <input className="field" type="number" min="1" max="500" value={uses} onChange={e => setUses(e.target.value)} style={{ marginTop: 5 }} />
          </label>
        </div>
        <Button variant="primary" icon="plus" onClick={create} disabled={busy}>{busy ? 'Створюю…' : 'Створити код'}</Button>
      </div>
    </div>

    {created && <div className="card">
      <div className="lbl2">Готово</div>
      <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: '.08em', margin: '8px 0 12px', wordBreak: 'break-all' }}>{created.code}</div>
      <div className="grid2">
        <Button onClick={() => copy(created.code)}>Копіювати код</Button>
        <Button onClick={() => copy(created.url)}>Копіювати лінк</Button>
      </div>
    </div>}

    <Section title="Створені коди">
      {invites.length ? invites.map(i => {
        const expired = new Date(i.expires_at).getTime() <= Date.now()
        const used = Number(i.use_count || 0) >= Number(i.max_uses || 1)
        const active = !i.revoked_at && !expired && !used
        return <Row
          key={i.id}
          icon="lock"
          iconTint={active ? 'var(--acc)' : 'var(--grey)'}
          title={i.code || i.target_role}
          subtitle={`${i.target_role} · ${i.use_count}/${i.max_uses} · до ${dateText(i.expires_at)}`}
        >
          <div className="row" style={{ gap: 5 }}>
            {i.code && <button className="iconbtn" onClick={() => copy(i.code)} aria-label="Копіювати"><Icon name="clipboard" /></button>}
            {active && <button className="iconbtn" style={{ color: 'var(--red)' }} onClick={() => revoke(i)} aria-label="Відкликати"><Icon name="trash" /></button>}
          </div>
        </Row>
      }) : <Row title="Кодів ще немає" subtitle="Створи перший код вище." />}
    </Section>
  </>
}

function PlanManager({ preview, clients, workspaceId, onPublished }) {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const [busyId, setBusyId] = useState(null)
  const days = preview?.days || []
  const publish = async client => {
    const clientId = client.user_id || client.id
    if (!days.length) return toast('Спочатку створи свій тижневий план у вкладці «План».')
    setBusyId(clientId)
    try {
      const result = await api('/api/profile-plan/publish', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, clientId, name: `${client.display_name || 'Client'} · VARANGYM` }),
      })
      toast(`План призначено · v${result.versionNumber}`)
      await onPublished?.()
    } catch (e) { toast(e.message || 'Не вдалося призначити план') }
    finally { setBusyId(null) }
  }

  return <>
    <div className="card">
      <div className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div className="lbl2">Мій шаблон програми</div>
          <div className="big" style={{ fontSize: 25 }}>{days.length} тренувальних днів</div>
          <div className="ss">Редагуєш програму у звичайній вкладці «План», а тут призначаєш її конкретному клієнту.</div>
        </div>
        <Button size="sm" onClick={() => nav('/plan')}>Редагувати</Button>
      </div>
    </div>
    <Section title="Дні програми">
      {days.length ? days.map((d, i) => <Row
        key={`${d.weekday}:${d.routineId}:${i}`}
        icon="calendar"
        iconTint="var(--acc)"
        title={d.name || `День ${i + 1}`}
        subtitle={`День тижня: ${d.weekday} · ${d.exercises || 0} вправ`}
      />) : <Row title="Тижневий план порожній" subtitle="Відкрий «План» і створи тренування." />}
    </Section>
    <Section title="Призначити клієнту">
      {clients.length ? clients.map(c => {
        const id = c.user_id || c.id
        return <Row
          key={id}
          icon="personCircle"
          iconTint="var(--blue)"
          title={c.display_name || 'Клієнт'}
          subtitle={c.email || ''}
        >
          <Button size="sm" onClick={() => publish(c)} disabled={busyId === id}>{busyId === id ? '…' : 'Призначити'}</Button>
        </Row>
      }) : <Row title="Немає клієнтів" subtitle="Спочатку створи клієнту код доступу." />}
    </Section>
  </>
}

function ClientDetail({ client, workspaceId, onBack, onPublished }) {
  const toast = useUI(s => s.toast)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [publishing, setPublishing] = useState(false)
  const clientId = client.user_id || client.id

  const load = () => {
    setError('')
    api(`/api/analytics/client/${encodeURIComponent(clientId)}?days=90&workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(setData)
      .catch(e => setError(e.message || 'Помилка'))
  }
  useEffect(load, [clientId, workspaceId])

  const publish = async () => {
    setPublishing(true)
    try {
      const result = await api('/api/profile-plan/publish', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, clientId, name: `${client.display_name || 'Client'} · VARANGYM` }),
      })
      toast(`План оновлено · v${result.versionNumber}`)
      await onPublished?.()
      load()
    } catch (e) { toast(e.message || 'Не вдалося призначити план') }
    finally { setPublishing(false) }
  }

  return <>
    <div className="row between" style={{ marginBottom: 14 }}>
      <Button size="sm" onClick={onBack}>← Клієнти</Button>
      <Button size="sm" variant="primary" onClick={publish} disabled={publishing}>{publishing ? 'Оновлюю…' : 'Призначити мій план'}</Button>
    </div>
    <div className="card">
      <div className="lbl2">Клієнт</div>
      <div className="big" style={{ fontSize: 28 }}>{client.display_name || data?.client?.display_name || 'Client'}</div>
      <div className="ss">{client.email || data?.client?.email || ''}</div>
    </div>
    {error && <ErrorCard message={error} onRetry={load} />}
    {!data && !error && <div className="empty">Завантаження прогресу…</div>}
    {data && <>
      <div className="grid2">
        <Metric value={number(data.summary?.workouts)} label="тренувань / 90 днів" />
        <Metric value={number(data.summary?.completed_sets)} label="виконаних підходів" />
        <Metric value={number(Math.round(Number(data.summary?.volume || 0)))} label="обсяг" />
        <Metric value={dateText(data.summary?.last_workout_at)} label="останнє тренування" />
      </div>
      <div className="card"><div className="lbl2">Активність · 90 днів</div><MiniBars daily={data.daily || []} /></div>
      <Section title="Поточна програма">
        {data.currentProgram ? <Row
          icon="calendar"
          iconTint="var(--acc)"
          title={data.currentProgram.name || 'Програма'}
          subtitle={`v${data.currentProgram.version_number || 1} · ${data.currentProgram.trainer_name || ''}`}
          value={`${data.currentProgram.days?.length || 0} днів`}
        /> : <Row title="Програма ще не призначена" />}
      </Section>
      <Section title="Останні тренування">
        {(data.recentWorkouts || []).length ? data.recentWorkouts.slice(0, 12).map(w => <Row
          key={w.id}
          icon="dumbbell"
          iconTint="var(--blue)"
          title={w.name || 'Тренування'}
          subtitle={`${dateText(w.started_at, true)} · ${number(w.completed_sets)} підходів`}
          value={number(Math.round(Number(w.volume || 0)))}
        />) : <Row title="Історії ще немає" />}
      </Section>
    </>}
  </>
}

export default function Management({ mode }) {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const [identity, setIdentity] = useState(null)
  const [data, setData] = useState(null)
  const [loadingIdentity, setLoadingIdentity] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState('')
  const [section, setSection] = useState('dashboard')
  const [selectedClient, setSelectedClient] = useState(null)

  const access = useMemo(() => platformAccess(identity), [identity])
  const trainerSpaces = useMemo(() => trainerMemberships(identity), [identity])
  const businessSpaces = useMemo(() => businessMemberships(identity), [identity])
  const [trainerWorkspaceId, setTrainerWorkspaceId] = useState('')
  const [businessWorkspaceId, setBusinessWorkspaceId] = useState('')

  useEffect(() => {
    setSection('dashboard')
    setSelectedClient(null)
  }, [mode])

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
        const [overview, analytics, preview, invites] = await Promise.allSettled([
          api(`/api/coach/clients?workspaceId=${encodeURIComponent(workspaceId)}`),
          api(`/api/analytics/coach?days=30&workspaceId=${encodeURIComponent(workspaceId)}`),
          api(`/api/profile-plan/preview?workspaceId=${encodeURIComponent(workspaceId)}`),
          api(`/api/invites?workspaceId=${encodeURIComponent(workspaceId)}`),
        ])
        setData({
          workspaceId,
          overview: overview.status === 'fulfilled' ? overview.value : { clients: [] },
          analytics: analytics.status === 'fulfilled' ? analytics.value : null,
          preview: preview.status === 'fulfilled' ? preview.value : { days: [] },
          invites: invites.status === 'fulfilled' ? invites.value.invites || [] : [],
          partialErrors: [overview, analytics, preview, invites].filter(x => x.status === 'rejected').map(x => x.reason?.message).filter(Boolean),
        })
      } else if (mode === 'business') {
        const workspaceId = businessWorkspaceId || businessSpaces[0]?.workspace_id
        if (!workspaceId) throw new Error('Немає business workspace.')
        const [overview, analytics, invites, billing] = await Promise.allSettled([
          api(`/api/business/overview?workspaceId=${encodeURIComponent(workspaceId)}`),
          api(`/api/analytics/business?days=30&workspaceId=${encodeURIComponent(workspaceId)}`),
          api(`/api/invites?workspaceId=${encodeURIComponent(workspaceId)}`),
          api('/api/billing/me'),
        ])
        setData({
          workspaceId,
          overview: overview.status === 'fulfilled' ? overview.value : { stats: {}, trainers: [] },
          analytics: analytics.status === 'fulfilled' ? analytics.value : null,
          invites: invites.status === 'fulfilled' ? invites.value.invites || [] : [],
          billing: billing.status === 'fulfilled' ? billing.value : null,
          partialErrors: [overview, analytics, invites, billing].filter(x => x.status === 'rejected').map(x => x.reason?.message).filter(Boolean),
        })
      } else {
        const [overview, workspaces, analytics, billing, invites] = await Promise.allSettled([
          api('/api/admin/overview'),
          api('/api/admin/workspaces'),
          api('/api/analytics/admin?days=30'),
          api('/api/billing/admin/summary'),
          api('/api/invites'),
        ])
        setData({
          overview: overview.status === 'fulfilled' ? overview.value : {},
          workspaces: workspaces.status === 'fulfilled' ? workspaces.value : { workspaces: [] },
          analytics: analytics.status === 'fulfilled' ? analytics.value : null,
          billing: billing.status === 'fulfilled' ? billing.value : null,
          invites: invites.status === 'fulfilled' ? invites.value.invites || [] : [],
          partialErrors: [overview, workspaces, analytics, billing, invites].filter(x => x.status === 'rejected').map(x => x.reason?.message).filter(Boolean),
        })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, allowed, trainerWorkspaceId, businessWorkspaceId])

  const modes = []
  if (access.trainer) modes.push({ value: 'trainer', label: 'Тренер' })
  if (access.business) modes.push({ value: 'business', label: 'Бізнес' })
  if (access.platformAdmin) modes.push({ value: 'admin', label: 'Адмін' })
  const switchMode = next => nav(next === 'trainer' ? '/trainer' : next === 'business' ? '/business' : '/admin')

  const showPartial = data?.partialErrors?.length ? [...new Set(data.partialErrors)].join(' · ') : ''

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/home')} aria-label="Головна"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}>
        <h1>{LABELS[mode] || 'VARANGYM'}</h1>
        <div className="sub">{identity?.user?.display_name || identity?.user?.name || ''}</div>
      </div>
      <button className="iconbtn" onClick={() => loadData().catch(e => toast(e.message))} aria-label="Оновити"><Icon name="reset" /></button>
    </div>

    {loadingIdentity ? <div className="empty">Завантаження…</div> : <>
      {modes.length > 1 && <div className="card" style={{ padding: 8 }}>
        <Segmented options={modes} value={mode} onChange={switchMode} />
      </div>}
      <PanelTabs mode={mode} value={section} onChange={next => { setSection(next); setSelectedClient(null) }} />
      {error && !loadingData && <ErrorCard message={error} onRetry={loadData} />}
      {showPartial && <div className="card" style={{ borderColor: 'var(--orange)' }}><div className="ss">Частина даних тимчасово недоступна: {showPartial}</div></div>}
      {loadingData && !data && <div className="empty">Завантаження…</div>}

      {!loadingData && data && mode === 'trainer' && (selectedClient
        ? <ClientDetail client={selectedClient} workspaceId={data.workspaceId} onBack={() => setSelectedClient(null)} onPublished={loadData} />
        : <TrainerPanel
            section={section}
            data={data}
            spaces={trainerSpaces}
            workspaceId={trainerWorkspaceId}
            setWorkspaceId={setTrainerWorkspaceId}
            setSelectedClient={setSelectedClient}
            onReload={loadData}
          />)}
      {!loadingData && data && mode === 'business' && <BusinessPanel
        section={section}
        data={data}
        spaces={businessSpaces}
        workspaceId={businessWorkspaceId}
        setWorkspaceId={setBusinessWorkspaceId}
        onReload={loadData}
      />}
      {!loadingData && data && mode === 'admin' && <AdminPanel section={section} data={data} onReload={loadData} />}
    </>}
  </div>
}

function TrainerPanel({ section, data, spaces, workspaceId, setWorkspaceId, setSelectedClient, onReload }) {
  const clients = data.overview?.clients || []
  const current = spaces.find(m => m.workspace_id === workspaceId) || spaces[0]
  const analytics = data.analytics
  return <>
    <WorkspacePicker spaces={spaces} value={workspaceId} onChange={setWorkspaceId} />
    {section === 'dashboard' && <>
      <div className="card">
        <div className="lbl2">Тренер</div>
        <div className="big" style={{ fontSize: 25 }}>{current?.workspace_name || 'VARANGYM'}</div>
        <div className="ss">Клієнти, програми, коди доступу та статистика в одному акаунті.</div>
      </div>
      <div className="grid2">
        <Metric value={clients.length} label="клієнтів" />
        <Metric value={number(sumDaily(analytics?.daily || []))} label="тренувань / 30 днів" />
        <Metric value={(data.preview?.days || []).length} label="днів у моєму плані" />
        <Metric value={data.invites.filter(i => !i.revoked_at && Number(i.use_count) < Number(i.max_uses) && new Date(i.expires_at) > new Date()).length} label="активних кодів" />
      </div>
      <div className="card"><div className="lbl2">Активність клієнтів</div><MiniBars daily={analytics?.daily || []} /></div>
      <Section title="Остання активність клієнтів">
        {clients.length ? clients.slice(0, 8).map(c => <Row
          key={c.user_id || c.id}
          icon="personCircle" iconTint="var(--blue)"
          title={c.display_name || 'Клієнт'}
          subtitle={`${c.workouts_30d || c.workouts_period || 0} тренувань / 30 днів`}
          value={dateText(c.last_workout_at)}
          accessory="chevron"
          onClick={() => setSelectedClient(c)}
        />) : <Row title="Клієнтів ще немає" />}
      </Section>
    </>}
    {section === 'clients' && <Section title={`Клієнти · ${clients.length}`}>
      {clients.length ? clients.map(c => <Row
        key={c.user_id || c.id}
        icon="personCircle" iconTint="var(--blue)"
        title={c.display_name || 'Клієнт'}
        subtitle={`${c.email || ''}${c.email ? ' · ' : ''}${c.workouts_30d || c.workouts_period || 0} тренувань / 30 днів`}
        value={dateText(c.last_workout_at)}
        accessory="chevron"
        onClick={() => setSelectedClient(c)}
      />) : <Row title="Клієнтів ще немає" subtitle="Створи код у вкладці «Коди»." />}
    </Section>}
    {section === 'plan' && <PlanManager preview={data.preview} clients={clients} workspaceId={data.workspaceId} onPublished={onReload} />}
    {section === 'invites' && <InviteManager mode="trainer" workspaceId={data.workspaceId} invites={data.invites} onReload={onReload} />}
    {section === 'analytics' && <AnalyticsBlock analytics={analytics} title="Тренування клієнтів" />}
  </>
}

function BusinessPanel({ section, data, spaces, workspaceId, setWorkspaceId, onReload }) {
  const overview = data.overview || {}
  const trainers = overview.trainers || []
  const stats = overview.stats || {}
  const analytics = data.analytics
  const workspace = overview.workspace || spaces.find(m => m.workspace_id === workspaceId)
  const workspaceBilling = data.billing?.workspaceBilling?.find(x => x.workspace_id === data.workspaceId)
  const workspaceSubs = data.billing?.workspaceSubscriptions?.filter(x => x.workspace_id === data.workspaceId) || []
  return <>
    <WorkspacePicker spaces={spaces} value={workspaceId} onChange={setWorkspaceId} />
    {section === 'dashboard' && <>
      <div className="card">
        <div className="lbl2">Бізнес</div>
        <div className="big" style={{ fontSize: 25 }}>{workspace?.name || workspace?.workspace_name || 'VARANGYM'}</div>
        <div className="ss">Команда, клієнти, доступи, аналітика та білінг.</div>
      </div>
      <div className="grid2">
        <Metric value={stats.trainers ?? trainers.length} label="тренерів" />
        <Metric value={stats.clients ?? 0} label="клієнтів" />
        <Metric value={number(sumDaily(analytics?.daily || []))} label="тренувань / 30 днів" />
        <Metric value={money(analytics?.revenue?.period_cents, 'USD')} label="дохід / 30 днів" />
      </div>
      <div className="card"><div className="lbl2">Активність залу</div><MiniBars daily={analytics?.daily || []} /></div>
      <Section title="Тренери">
        {trainers.slice(0, 8).map(t => <Row key={t.user_id || t.id} icon="personCircle" iconTint="var(--indigo)" title={t.display_name || 'Тренер'} subtitle={t.email || ''} value={`${t.clients || 0} клієнтів`} />)}
        {!trainers.length && <Row title="Тренерів ще немає" />}
      </Section>
    </>}
    {section === 'team' && <Section title={`Команда · ${trainers.length}`}>
      {trainers.length ? trainers.map(t => <Row key={t.user_id || t.id} icon="personCircle" iconTint="var(--indigo)" title={t.display_name || 'Тренер'} subtitle={t.email || ''} value={`${t.clients || 0} клієнтів`} />) : <Row title="Тренерів ще немає" subtitle="Створи код Trainer у вкладці «Коди»." />}
    </Section>}
    {section === 'invites' && <InviteManager mode="business" workspaceId={data.workspaceId} invites={data.invites} onReload={onReload} />}
    {section === 'analytics' && <AnalyticsBlock analytics={analytics} title="Активність бізнесу" />}
    {section === 'billing' && <>
      <div className="grid2">
        <Metric value={workspaceBilling?.plan_code || '—'} label="поточний план" note={workspaceBilling?.lifetime_access ? 'lifetime' : ''} />
        <Metric value={workspaceSubs.filter(x => x.status === 'active').length} label="активних підписок" />
        <Metric value={money(analytics?.revenue?.period_cents, 'USD')} label="дохід / 30 днів" />
        <Metric value={money(analytics?.revenue?.lifetime_cents, 'USD')} label="дохід за весь час" />
      </div>
      <Section title="Підписки">
        {workspaceSubs.length ? workspaceSubs.map(s => <Row key={s.id} icon="creditCard" title={s.plan_code} subtitle={`${s.status} · ${s.provider || ''}`} value={dateText(s.current_period_end)} />) : <Row title="Підписок ще немає" />}
      </Section>
    </>}
  </>
}

function AdminPanel({ section, data, onReload }) {
  const nav = useNavigate()
  const overview = data.overview || {}
  const analytics = data.analytics
  const workspaces = data.workspaces?.workspaces || []
  const users = analytics?.userList || []
  const billing = data.billing
  const revenue = billing?.revenue?.[0]
  return <>
    {section === 'dashboard' && <>
      <div className="card">
        <div className="lbl2">VARANGYM Platform</div>
        <div className="big" style={{ fontSize: 25 }}>Адміністрування</div>
        <div className="ss">Повний огляд платформи: користувачі, активність, коди, workspaces і платежі.</div>
      </div>
      <div className="grid2">
        <Metric value={analytics?.users?.total ?? overview.users?.total ?? 0} label="користувачів" note={`${analytics?.users?.active_30d ?? overview.users?.active ?? 0} active`} />
        <Metric value={overview.workspaces?.organizations ?? 0} label="організацій" />
        <Metric value={number(sumDaily(analytics?.daily || []))} label="тренувань / 30 днів" />
        <Metric value={data.invites.filter(i => !i.revoked_at && Number(i.use_count) < Number(i.max_uses) && new Date(i.expires_at) > new Date()).length} label="активних кодів" />
      </div>
      <div className="card"><div className="lbl2">Активність платформи</div><MiniBars daily={analytics?.daily || []} /></div>
      <div className="grid2">
        <Button onClick={() => nav('/admin/accounts')}>Акаунти · видалення · аудит</Button>
        <Button onClick={() => onReload?.()}>Оновити дані</Button>
      </div>
      <AnalyticsBlock analytics={analytics} title="Тренування платформи" />
    </>}
    {section === 'users' && <>
      <div className="card">
        <div className="row between"><div><div className="lbl2">Користувачі</div><div className="big" style={{ fontSize: 25 }}>{users.length || overview.users?.total || 0}</div></div><Button size="sm" onClick={() => nav('/admin/accounts')}>Керувати акаунтами</Button></div>
        <div className="ss" style={{ marginTop: 7 }}>У розширеному керуванні можна вимикати/видаляти акаунти, дивитися історію та audit log.</div>
      </div>
      <Section title="Останні користувачі">
        {users.length ? users.map(u => <Row
          key={u.id}
          icon="personCircle"
          iconTint={u.is_platform_admin ? 'var(--acc)' : 'var(--blue)'}
          title={u.display_name || 'User'}
          subtitle={`${u.email || ''}${u.current_program ? ` · ${u.current_program}` : ''}`}
          value={`${u.workouts_30d || 0} / 30д`}
        />) : <Row title="Список користувачів недоступний" subtitle="Спробуй оновити панель." />}
      </Section>
    </>}
    {section === 'workspaces' && <Section title={`Workspaces · ${workspaces.length}`}>
      {workspaces.length ? workspaces.map(w => <Row
        key={w.id}
        icon="personCircle"
        iconTint="var(--acc)"
        title={w.name}
        subtitle={`${w.type || 'workspace'} · ${w.members || 0} учасників`}
        value={`${w.trainers || 0} / ${w.clients || 0}`}
      />) : <Row title="Workspaces ще немає" />}
    </Section>}
    {section === 'invites' && <InviteManager mode="admin" workspaces={workspaces} invites={data.invites} onReload={onReload} />}
    {section === 'billing' && <>
      <div className="grid2">
        <Metric value={revenue ? money(revenue.month_cents, revenue.currency) : money(analytics?.revenue?.period_cents)} label="дохід цього місяця" />
        <Metric value={revenue ? money(revenue.lifetime_cents, revenue.currency) : money(analytics?.revenue?.lifetime_cents)} label="дохід за весь час" />
        <Metric value={(billing?.subscriptions || []).filter(x => x.status === 'active').reduce((n, x) => n + Number(x.count || 0), 0)} label="активних підписок" />
        <Metric value={billing?.provider || '—'} label="платіжний провайдер" />
      </div>
      <Section title="Тарифні плани">
        {(billing?.plans || []).length ? billing.plans.map(p => <Row
          key={p.code}
          icon="creditCard"
          iconTint="var(--acc)"
          title={p.metadata?.label || p.code}
          subtitle={`${p.audience} · ${p.billing_kind}`}
          value={money(p.price_cents, p.currency)}
        />) : <Row title="Тарифів немає" />}
      </Section>
      <Section title="Checkout">
        {(billing?.checkouts || []).length ? billing.checkouts.map((x, i) => <Row key={`${x.plan_code}:${x.status}:${i}`} title={x.plan_code} subtitle={x.status} value={`${x.count} · ${money(x.gross_cents)}`} />) : <Row title="Платежів ще немає" />}
      </Section>
    </>}
  </>
}
