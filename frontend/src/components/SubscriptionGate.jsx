import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useStore } from '../store/useStore.js'
import BrandMark from './BrandMark.jsx'
import { Button } from './ui.jsx'

const date = v => v ? new Date(v).toLocaleDateString('uk-UA') : '—'

export default function SubscriptionGate({ children }) {
  const user = useStore(s => s.user)
  const loc = useLocation()
  const nav = useNavigate()
  const [access, setAccess] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    if (!user) { setAccess(null); setFailed(false); return () => { live = false } }
    setFailed(false)
    api('/api/access/me')
      .then(d => { if (live) setAccess(d) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [user?.id, loc.pathname])

  // Billing/settings must always remain reachable so an expired account can recover itself.
  if (!user || loc.pathname === '/settings' || loc.pathname.startsWith('/settings/')) return children

  // A temporary diagnostics/API outage must not turn the whole product into a black screen or
  // accidentally lock paid users. Keep the app usable; the next navigation retries the check.
  if (failed) return children
  if (access == null) return <div className="narrow"><div className="empty">Перевіряю доступ…</div></div>
  if (access.active) return children

  const expired = access.direct || access.workspaces?.find(x => x.reason === 'expired') || null
  return <div className="narrow" style={{ minHeight: '76vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
    <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--acc)' }}><BrandMark size={74} /></div>
    <h1 style={{ margin: '12px 0 6px' }}>Потрібна активна підписка</h1>
    <div className="muted" style={{ lineHeight: 1.55 }}>
      {expired?.trial_ends_at
        ? `30-денний trial завершився ${date(expired.trial_ends_at)}.`
        : 'Безкоштовний період або попередня підписка завершилися.'}
      <br />Тренування й дані не видаляються — після активації тарифу все буде доступно як раніше.
    </div>
    <div className="card" style={{ marginTop: 20, textAlign: 'left' }}>
      <div className="lbl2">Поточний статус</div>
      <div className="big" style={{ fontSize: 23 }}>{expired?.plan_code || 'VARANGYM'}</div>
      <div className="ss">{expired?.status || 'subscription required'}{expired?.trial_ends_at ? ` · trial до ${date(expired.trial_ends_at)}` : ''}</div>
    </div>
    <Button variant="primary" onClick={() => nav('/settings')}>Керувати підпискою</Button>
  </div>
}
