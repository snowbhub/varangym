import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api, webauthnOK, passkeyLogin, passkeyRegister, BIO } from '../lib/api.js'
import { hasData } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { DEMO, REPO } from '../lib/demo.js'
import { guestAllowed } from '../lib/guest.js'
import { useState, useRef, useEffect } from 'react'
import BrandMark from '../components/BrandMark.jsx'
import { Button } from '../components/ui.jsx'
import { askAddDeviceData } from '../sheets.jsx'

function queryParam(name) {
  try { return new URLSearchParams(window.location.search).get(name) || '' } catch { return '' }
}
const inviteFromLocation = () => queryParam('invite')
const checkoutFromLocation = () => queryParam('checkout')

function RegisterSheet({ close }) {
  const { setUser, pushState, pullState, loadConfig } = useStore()
  const config = useStore(s => s.config)
  const linkCode = inviteFromLocation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState(linkCode)
  const inviteOnly = !!config?.invite_only
  const ref = useRef(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 250) }, [])
  useEffect(() => { loadConfig() }, [loadConfig])
  const go = async () => {
    const n = name.trim()
    if (!n) { useUI.getState().toast(t('Enter a name')); return }
    if (inviteOnly && !code.trim()) { useUI.getState().toast(t('An invite code is required')); return }
    try {
      const u = await passkeyRegister(n, code.trim(), 'uk', email.trim() || null)
      setUser(u); close()
      if (hasData(useStore.getState().S)) { await pushState(); useUI.getState().toast(t('Profile created — data from this device moved into it')) }
      else { await pullState(); useUI.getState().toast(t('Welcome, {0}', u.name)) }
      if (window.location.search) history.replaceState(null, '', window.location.pathname + window.location.hash)
    } catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') useUI.getState().toast(e.message || t('Registration failed')) }
  }
  return <>
    <h3>{t('Create your profile')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('Pick a name, then confirm with {0}. The passkey is saved in your device — no password needed.', BIO)}</div>
    <input ref={ref} className="input" placeholder={t('Your name')} maxLength={40} value={name} onChange={e => setName(e.target.value)} />
    <div style={{ height: 10 }} />
    <input className="input" type="email" autoComplete="email" placeholder={t('Email (required for paid Solo, optional for trainer invites)')} maxLength={320} value={email} onChange={e => setEmail(e.target.value)} />
    {inviteOnly && !linkCode && <>
      <div style={{ height: 10 }} />
      <input className="input" placeholder={t('Invite code')} maxLength={40} value={code}
        onChange={e => setCode(e.target.value.toUpperCase())} style={{ letterSpacing: '.14em', fontWeight: 600, textAlign: 'center' }} />
      <div className="dim small" style={{ marginTop: 6 }}>{t('This app is invite-only — enter the code you were given.')}</div>
    </>}
    {linkCode && <div className="dim small" style={{ marginTop: 8 }}>{t('Invitation accepted — finish creating your profile.')}</div>}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={go}>{t('Create passkey')}</Button>
  </>
}

function SoloPlans() {
  const [plans, setPlans] = useState([])
  const [email, setEmail] = useState('')
  const [configured, setConfigured] = useState(false)
  const [busy, setBusy] = useState('')
  const toast = useUI(s => s.toast)

  useEffect(() => {
    api('/api/billing/plans').then(d => {
      setPlans((d.plans || []).filter(p => p.audience === 'solo'))
      setConfigured(!!d.paymentsConfigured)
    }).catch(() => {})
  }, [])

  if (!plans.length) return null
  const pay = async code => {
    const mail = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(mail)) return toast(t('Enter a valid email'))
    setBusy(code)
    try {
      const d = await api('/api/billing/checkout/solo', { method: 'POST', body: JSON.stringify({ planCode: code, email: mail }) })
      if (d.url) window.location.href = d.url
    } catch (e) { toast(e.message || t('Could not start checkout')) }
    setBusy('')
  }
  const price = p => `$${(Number(p.price_cents || 0) / 100).toFixed(Number(p.price_cents) % 100 ? 2 : 0)}${p.billing_kind === 'recurring' ? t('/month') : ''}`

  return <div className="card" style={{ marginTop: 22, textAlign: 'left' }}>
    <div style={{ fontWeight: 800, fontSize: 20 }}>{t('VARANGYM Solo')}</div>
    <div className="muted small" style={{ marginTop: 5 }}>{t('Train independently with cloud sync, progress history and offline exercise media.')}</div>
    <input className="input" type="email" autoComplete="email" placeholder={t('Your email')} value={email} onChange={e => setEmail(e.target.value)} style={{ marginTop: 14 }} />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
      {plans.map(p => <Button key={p.code} size="sm" variant={p.billing_kind === 'recurring' ? 'primary' : 'tinted'} disabled={!configured || !!busy} onClick={() => pay(p.code)}>
        {busy === p.code ? t('Opening…') : price(p)}
      </Button>)}
    </div>
    {!configured && <div className="dim small" style={{ marginTop: 9 }}>{t('Payment checkout is prepared but not connected on this staging server yet.')}</div>}
  </div>
}

export default function Login() {
  const { setUser, adoptProfile, setGuest } = useStore()
  const config = useStore(s => s.config)
  const canGuest = guestAllowed(config)
  const inviteOpened = useRef(false)
  const checkoutHandled = useRef(false)

  useEffect(() => {
    if (DEMO || checkoutHandled.current || !checkoutFromLocation()) return
    checkoutHandled.current = true
    const id = checkoutFromLocation()
    let stopped = false
    let tries = 0
    const check = async () => {
      if (stopped) return
      tries++
      try {
        const d = await api(`/api/billing/checkout/status?id=${encodeURIComponent(id)}`)
        if (d.registration?.url) { window.location.replace(d.registration.url); return }
        if (d.status === 'failed' || d.status === 'canceled') { useUI.getState().toast(t('Payment was not completed')); return }
      } catch {}
      if (tries < 12) setTimeout(check, 1000)
      else useUI.getState().toast(t('Payment is still processing — refresh in a moment.'))
    }
    check()
    return () => { stopped = true }
  }, [])

  useEffect(() => {
    if (DEMO || inviteOpened.current || !webauthnOK() || !inviteFromLocation()) return
    inviteOpened.current = true
    const timer = setTimeout(() => useUI.getState().openSheet(close => <RegisterSheet close={close} />), 120)
    return () => clearTimeout(timer)
  }, [])

  const signIn = async () => {
    try { const u = await passkeyLogin(); setUser(u); await adoptProfile(askAddDeviceData); useUI.getState().toast(t('Welcome back, {0}', u.name)) }
    catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') useUI.getState().toast(e.message || t('Sign-in failed')) }
  }
  const head = <>
    <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--acc)' }}><BrandMark size={88} /></div>
    <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: '.16em', margin: '8px 0 4px' }}>VARANGYM</h1>
    <div className="dim" style={{ textTransform: 'uppercase', letterSpacing: '.18em', fontSize: 11, marginBottom: 8 }}>plan · train · progress</div>
  </>
  const wrap = { display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '78vh', textAlign: 'center' }

  if (DEMO) return (
    <div className="narrow" style={wrap}>
      {head}
      <div className="muted" style={{ marginBottom: 30 }}>{t('Live demo — everything stays in this browser.')}</div>
      <Button variant="primary" icon="sparkles" onClick={() => setGuest(true)}>{t('Start the demo')}</Button>
      <div className="card small muted" style={{ textAlign: 'left', marginTop: 16 }}>
        {t('This demo runs entirely in your browser on example data — nothing is sent anywhere. A VARANGYM account adds passkey sign-in, cloud sync and coach/business features.')}
      </div>
      <div className="dim small" style={{ marginTop: 22, lineHeight: 1.6 }}>
        <a href={REPO} target="_blank" rel="noopener">{t('VARANGYM source & licenses →')}</a>
      </div>
    </div>
  )

  return (
    <div className="narrow" style={wrap}>
      {head}
      <div className="muted" style={{ marginBottom: 34 }}>{t('Your plan. Your training. Your progress.')}</div>
      {webauthnOK() ? <>
        <Button variant="primary" icon="person" onClick={signIn}>{t('Sign in with passkey')}</Button>
        <div style={{ height: 10 }} />
        <Button icon="sparkles" onClick={() => useUI.getState().openSheet(close => <RegisterSheet close={close} />)}>{t('I have an invite')}</Button>
        {canGuest && <div style={{ height: 10 }} />}
      </> : <div className="card small muted" style={{ textAlign: 'left' }}>{canGuest
        ? t("This browser doesn't support passkeys — you can still use VARANGYM locally on this device.")
        : t("This browser doesn't support passkeys, and this instance requires an account. Try a browser or device with passkey support.")}</div>}
      {canGuest && <Button variant="ghost" className="dim" onClick={() => setGuest(true)}>{t('Continue without account')}</Button>}
      <SoloPlans />
      <div className="dim small" style={{ marginTop: 26, lineHeight: 1.5 }}>{t('Passkeys use {0} — no passwords.', BIO)}<br />{t('Each profile keeps its own plan, workouts & body weight.')}</div>
    </div>
  )
}
