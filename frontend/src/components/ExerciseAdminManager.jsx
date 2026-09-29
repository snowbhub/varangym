import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useUI } from '../store/useUI.js'
import Icon from './Icon.jsx'
import { Button, Row, Section, Switch } from './ui.jsx'

const splitLines = value => String(value || '').split('\n').map(x => x.trim()).filter(Boolean)
const joinLines = value => Array.isArray(value) ? value.join('\n') : ''

function AdminPlanAssignment() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const [workspaces, setWorkspaces] = useState([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [clients, setClients] = useState([])
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    api('/api/admin/workspaces').then(d => {
      const ws = d.workspaces || []
      setWorkspaces(ws)
      setWorkspaceId(v => v || ws[0]?.id || '')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    Promise.allSettled([
      api(`/api/coach/clients?workspaceId=${encodeURIComponent(workspaceId)}`),
      api(`/api/profile-plan/preview?workspaceId=${encodeURIComponent(workspaceId)}`),
    ]).then(([c,p]) => {
      setClients(c.status === 'fulfilled' ? (c.value.clients || []) : [])
      setPreview(p.status === 'fulfilled' ? p.value : null)
    })
  }, [workspaceId])

  const assign = async client => {
    const id = client.id || client.user_id
    setBusy(id)
    try {
      const d = await api('/api/profile-plan/publish', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, clientId: id, name: `${client.display_name || 'Client'} · VARANGYM` })
      })
      toast(`План призначено · v${d.versionNumber}`)
    } catch (e) { toast(e.message || 'Не вдалося призначити план') }
    finally { setBusy('') }
  }

  return <>
    <div className="card">
      <div className="row between" style={{ alignItems: 'flex-start', gap: 10 }}>
        <div><div className="lbl2">Плани користувачів</div><div className="big" style={{ fontSize: 23 }}>{preview?.days?.length || 0} днів у робочому плані</div><div className="ss">Адмін використовує той самий редактор План і може призначити його будь-якому клієнту вибраного workspace.</div></div>
        <Button size="sm" onClick={() => nav('/plan')}>Редагувати</Button>
      </div>
      <select className="field" value={workspaceId} onChange={e => setWorkspaceId(e.target.value)} style={{ marginTop: 12 }}>
        {workspaces.map(w => <option key={w.id} value={w.id}>{w.name} · {w.type}</option>)}
      </select>
    </div>
    <Section title={`Призначити план · ${clients.length} клієнтів`}>
      {clients.length ? clients.map(c => {
        const id = c.id || c.user_id
        return <Row key={id} icon="personCircle" title={c.display_name} subtitle={c.email || ''}>
          <Button size="sm" disabled={busy === id} onClick={() => assign(c)}>{busy === id ? '…' : 'Призначити'}</Button>
        </Row>
      }) : <Row title="У цьому workspace ще немає клієнтів" />}
    </Section>
  </>
}

function ExerciseEditor({ exercise, onClose, onSaved }) {
  const toast = useUI(s => s.toast)
  const [active, setActive] = useState(exercise.active !== false)
  const [equipment, setEquipment] = useState(exercise.equipment_key || '')
  const [primaryMuscle, setPrimaryMuscle] = useState(exercise.primary_muscle_key || '')
  const [bodyPart, setBodyPart] = useState(exercise.body_part || '')
  const [image, setImage] = useState(exercise.image || '')
  const [gif, setGif] = useState(exercise.gif || '')
  const tr = exercise.admin_translations || {}
  const [names, setNames] = useState({ uk: tr.uk?.name || '', ru: tr.ru?.name || '', en: tr.en?.name || (exercise.name || '') })
  const [descriptions, setDescriptions] = useState({ uk: tr.uk?.description || '', ru: tr.ru?.description || '', en: tr.en?.description || '' })
  const [instructions, setInstructions] = useState({ uk: joinLines(tr.uk?.instructions), ru: joinLines(tr.ru?.instructions), en: joinLines(tr.en?.instructions || exercise.instructions) })
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      await api('/api/exercise-admin/update', {
        method: 'POST',
        body: JSON.stringify({
          exerciseId: exercise.id, active, equipment, primaryMuscle, bodyPart, image, gif,
          translations: Object.fromEntries(['uk','ru','en'].map(locale => [locale, {
            name: names[locale], description: descriptions[locale], instructions: splitLines(instructions[locale]),
          }]))
        }),
      })
      toast('Вправу збережено')
      await onSaved?.()
      onClose?.()
    } catch (e) { toast(e.message || 'Не вдалося зберегти вправу') }
    finally { setBusy(false) }
  }

  const field = (label, value, setValue) => <label className="small muted">{label}<input className="field" value={value} onChange={e => setValue(e.target.value)} style={{ marginTop: 5 }} /></label>
  const textArea = (label, value, setValue, rows = 4) => <label className="small muted">{label}<textarea className="field" rows={rows} value={value} onChange={e => setValue(e.target.value)} style={{ marginTop: 5, resize: 'vertical' }} /></label>

  return <>
    <div className="row between" style={{ marginBottom: 12 }}><Button size="sm" onClick={onClose}>← Назад</Button><Button size="sm" variant="primary" onClick={save} disabled={busy}>{busy ? 'Зберігаю…' : 'Зберегти'}</Button></div>
    <div className="card"><div className="row between" style={{ alignItems: 'center' }}><div><div className="lbl2">Глобальна вправа</div><div className="big" style={{ fontSize: 24 }}>{exercise.name || exercise.legacy_key}</div><div className="ss">ID {exercise.legacy_key || exercise.id}</div></div><Switch checked={active} onChange={setActive} /></div><div className="ss" style={{ marginTop: 8 }}>{active ? 'Доступна всім користувачам' : 'Прихована з глобального каталогу та plan API'}</div></div>
    <Section title="Популярна назва"><div className="card" style={{ margin: 0, display: 'grid', gap: 10 }}>{field('Українська — як реально називають вправу в Україні', names.uk, v => setNames(x => ({ ...x, uk: v })))}{field('Русский — распространённое название', names.ru, v => setNames(x => ({ ...x, ru: v })))}{field('English', names.en, v => setNames(x => ({ ...x, en: v })))}</div></Section>
    <Section title="Класифікація"><div className="card" style={{ margin: 0, display: 'grid', gap: 10 }}>{field('Обладнання', equipment, setEquipment)}{field('Основний мʼяз', primaryMuscle, setPrimaryMuscle)}{field('Частина тіла', bodyPart, setBodyPart)}</div></Section>
    <Section title="Медіа"><div className="card" style={{ margin: 0, display: 'grid', gap: 10 }}>{field('Зображення / filename', image, setImage)}{field('GIF / animation filename', gif, setGif)}<div className="dim small">Зміна зберігається як адмін-override і не буде перезаписана при оновленні ExerciseDB.</div></div></Section>
    {['uk','ru','en'].map(locale => <Section key={locale} title={`Опис · ${locale.toUpperCase()}`}><div className="card" style={{ margin: 0, display: 'grid', gap: 10 }}>{textArea('Опис', descriptions[locale], v => setDescriptions(x => ({ ...x, [locale]: v })), 4)}{textArea('Інструкції — один крок у кожному рядку', instructions[locale], v => setInstructions(x => ({ ...x, [locale]: v })), 7)}</div></Section>)}
  </>
}

export default function ExerciseAdminManager() {
  const [q, setQ] = useState('')
  const [locale, setLocale] = useState('uk')
  const [data, setData] = useState({ exercises: [], total: 0 })
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const toast = useUI(s => s.toast)
  const limit = 60

  const load = async (nextOffset = offset) => {
    setLoading(true)
    try {
      const d = await api(`/api/exercise-admin/admin?locale=${encodeURIComponent(locale)}&q=${encodeURIComponent(q)}&limit=${limit}&offset=${nextOffset}`)
      setData(d); setOffset(nextOffset)
      if (selected) { const refreshed = (d.exercises || []).find(x => x.id === selected.id); if (refreshed) setSelected(refreshed) }
    } catch (e) { toast(e.message || 'Не вдалося завантажити каталог') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    const timer = setTimeout(() => load(0), q ? 250 : 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, locale])

  const page = Math.floor(offset / limit) + 1
  const pages = Math.max(1, Math.ceil(Number(data.total || 0) / limit))
  const stats = useMemo(() => ({ visible: (data.exercises || []).filter(x => x.active !== false).length, hidden: (data.exercises || []).filter(x => x.active === false).length }), [data.exercises])

  if (selected) return <ExerciseEditor exercise={selected} onClose={() => setSelected(null)} onSaved={() => load(offset)} />

  return <>
    <AdminPlanAssignment />
    <div className="card"><div className="row between" style={{ gap: 10, alignItems: 'flex-end' }}><div><div className="lbl2">Глобальний каталог вправ</div><div className="big" style={{ fontSize: 25 }}>{data.total || 0}</div><div className="ss">Видимість, популярні назви UK/RU/EN, описи, класифікація та медіа.</div></div><select className="field" style={{ width: 100 }} value={locale} onChange={e => setLocale(e.target.value)}><option value="uk">UK</option><option value="ru">RU</option><option value="en">EN</option></select></div><div className="search" style={{ marginTop: 12 }}><Icon name="magnifier" /><input className="input" placeholder="Пошук по назві, ID, мʼязу, обладнанню…" value={q} onChange={e => setQ(e.target.value)} /></div><div className="grid2" style={{ marginTop: 12 }}><div className="stat"><div className="n">{stats.visible}</div><div className="l">видимих на сторінці</div></div><div className="stat"><div className="n">{stats.hidden}</div><div className="l">прихованих</div></div></div></div>
    {loading && !(data.exercises || []).length ? <div className="empty">Завантаження…</div> : <Section title={`Вправи · сторінка ${page}/${pages}`}>{(data.exercises || []).map(ex => <Row key={ex.id} icon="dumbbell" iconTint={ex.active !== false ? 'var(--acc)' : 'var(--grey)'} title={ex.name || ex.legacy_key} subtitle={`${ex.primary_muscle_key || '—'} · ${ex.equipment_key || '—'} · ${ex.legacy_key || ''}`} value={ex.active !== false ? 'ON' : 'OFF'} accessory="chevron" onClick={() => setSelected(ex)} />)}{!(data.exercises || []).length && !loading && <Row title="Нічого не знайдено" />}</Section>}
    <div className="grid2"><Button disabled={offset <= 0 || loading} onClick={() => load(Math.max(0, offset - limit))}>← Попередні</Button><Button disabled={offset + limit >= Number(data.total || 0) || loading} onClick={() => load(offset + limit)}>Наступні →</Button></div>
  </>
}
