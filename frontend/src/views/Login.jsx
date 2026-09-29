import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api, webauthnOK, passkeyLogin, passkeyRegister, BIO } from '../lib/api.js'
import { hasData } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { DEMO, REPO } from '../lib/demo.js'
import { guestAllowed } from '../lib/guest.js'
import { useState, useRef, useEffect } from 'react'
import BrandMark from '../components/BrandMark.jsx'
import { Button, Segmented } from '../components/ui.jsx'
import { askAddDeviceData } from '../sheets.jsx'

function queryParam(name) {
  try { return new URLSearchParams(window.location.search).get(name) || '' } catch { return '' }
}
const inviteFromLocation = () => queryParam('invite')
const checkoutFromLocation = () => queryParam('checkout')

function RegisterSheet({ close, inviteMode = false }) {
  const { setUser, pushState, pullState } = useStore()
  const linkCode = inviteFromLocation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState(linkCode)
  const [accountType, setAccountType] = useState('solo')
  const [workspaceName, setWorkspaceName] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 250) }, [])
  const usingInvite = !!linkCode || inviteMode

  const go = async () => {
    const n = name.trim()
    const mail = email.trim().toLowerCase()
    if (!n) { useUI.getState().toast(t('Enter a name')); return }
    if (!usingInvite && !/^\S+@\S+\.\S+$/.test(mail)) { useUI.getState().toast('Введи коректний email'); return }
    if (usingInvite && !code.trim()) { useUI.getState().toast('Введи код запрошення'); return }
    if (!usingInvite && accountType !== 'solo' && !workspaceName.trim()) { useUI.getState().toast(accountType === 'business' ? 'Введи назву організації' : 'Введи назву тренерського профілю'); return }
    setBusy(true)
    try {
      let registrationCode = code.trim()
      let selfServiceTrial = false
      if (!usingInvite) {
        const trial = await api('/api/trial/invite', {
          method: 'POST',
          body: JSON.stringify({ accountType, email: mail, name: n, workspaceName: workspaceName.trim() || null })
        })
        registrationCode = trial.code
        selfServiceTrial = true
      }
      const u = await passkeyRegister(n, registrationCode, 'uk', mail || null)
      setUser(u)
      if (selfServiceTrial) await api('/api/trial/activate', { method: 'POST', body: '{}' })
      close()
      if (hasData(useStore.getState().S)) {
        await pushState()
        useUI.getState().toast(selfServiceTrial ? 'Профіль створено · 30 днів безкоштовно' : t('Profile created — data from this device moved into it'))
      } else {
        await pullState()
        useUI.getState().toast(selfServiceTrial ? '30-денний пробний період активовано' : t('Welcome, {0}', u.name))
      }
      if (window.location.search) history.replaceState(null, '', window.location.pathname + window.location.hash)
    } catch (e) {
      if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') useUI.getState().toast(e.message || t('Registration failed'))
    } finally { setBusy(false) }
  }

  return <>
    <h3>{usingInvite ? 'Реєстрація за кодом' : 'Створити VARANGYM'}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      {usingInvite
        ? `Код визначає роль і привʼязку до тренера або організації. Після цього підтверди профіль через ${BIO}.`
        : `Обери тип акаунта. Перші 30 днів — безкоштовний пробний період, без автоматичного списання без оформленої оплати.`}
    </div>
    {!usingInvite && <div style={{ marginBottom: 12 }}>
      <Segmented options={[
        { value: 'solo', label: 'Solo' },
        { value: 'trainer', label: 'Тренер' },
        { value: 'business', label: 'Бізнес' },
      ]} value={accountType} onChange={setAccountType} />
    </div>}
    <input ref={ref} className="input" placeholder={t('Your name')} maxLength={80} value={name} onChange={e => setName(e.target.value)} />
    <div style={{ height: 10 }} />
    <input className="input" type="email" autoComplete="email" placeholder="Email" maxLength={320} value={email} onChange={e => setEmail(e.target.value)} />
    {!usingInvite && accountType !== 'solo' && <>
      <div style={{ height: 10 }} />
      <input className="input" placeholder={accountType === 'business' ? 'Назва організації / залу' : 'Назва тренерського профілю'} maxLength={100} value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} />
    </>}
    {usingInvite && !linkCode && <>
      <div style={{ height: 10 }} />
      <input className="input" placeholder="Код запрошення" maxLength={40} value={code}
        onChange={e => setCode(e.target.value.toUpperCase())} style={{ letterSpacing: '.14em', fontWeight: 600, textAlign: 'center' }} />
    </>}
    {linkCode && <div className="dim small" style={{ marginTop: 8 }}>Код з посилання прийнято — заверши створення профілю.</div>}
    {!usingInvite && <div className="card" style={{ marginTop: 12, padding: 12, textAlign: 'left' }}>
      <b>{accountType === 'business' ? 'Business 5 / 50' : accountType === 'trainer' ? 'Coach 5' : 'Solo Monthly'}</b>
      <div className="dim small" style={{ marginTop: 4 }}>Trial: 30 днів. Платний тариф можна змінити пізніше у Налаштуваннях → Підписка.</div>
    </div>}
    <div style={{ height: 12 }} />
    <Button variant="primary" disabled={busy} onClick={go}>{busy ? 'Створюю…' : usingInvite ? 'Створити профіль' : 'Почати 30 днів безкоштовно'}</Button>
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
    <div style={{ fontWeight: 800, fontSize: 20 }}>Або Solo одразу без trial</div>
    <div className="muted small" style={{ marginTop: 5 }}>Для тих, хто хоче відразу оформити Solo Monthly або Lifetime.</div>
    <input className="input" type="email" autoComplete="email" placeholder={t('Your email')} value={email} onChange={e => setEmail(e.target.value)} style={{ marginTop: 14 }} />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
      {plans.map(p => <Button key={p.code} size="sm" variant={p.billing_kind === 'recurring' ? 'primary' : 'tinted'} disabled={!configured || !!busy} onClick={() => pay(p.code)}>
        {busy === p.code ? t('Opening…') : price(p)}
      </Button>)}
    </div>
    {!configured && <div className="dim small" style={{ marginTop: 9 }}>Платіжний провайдер ще не підключений.</div>}
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
    const timer = setTimeout(() => useUI.getState().openSheet(close => <RegisterSheet close={close} inviteMode />), 120)
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
        <Button icon="sparkles" onClick={() => useUI.getState().openSheet(close => <RegisterSheet close={close} />)}>Створити акаунт · 30 днів безкоштовно</Button>
        <div style={{ height: 10 }} />
        <Button variant="ghost" icon="key" onClick={() => useUI.getState().openSheet(close => <RegisterSheet close={close} inviteMode />)}>Маю код запрошення</Button>
        {canGuest && <div style={{ height: 10 }} />}
      </> : <div className="card small muted" style={{ textAlign: 'left' }}>{canGuest
        ? t("This browser doesn't support passkeys — you can still use VARANGYM locally on this device.")
        : t("This browser doesn't support passkeys, and this instance requires an account. Try a browser or device with passkey support.")}</div>}
      {canGuest && <Button variant="ghost" className="dim" onClick={() => setGuest(true)}>{t('Continue without account')}</Button>}
      <SoloPlans />
      <div className="dim small" style={{ marginTop: 26, lineHeight: 1.5 }}>{t('Passkeys use {0} — no passwords.', BIO)}<br />30-денний trial не списує гроші без оформленої платної підписки.</div>
    </div>
  )
}
