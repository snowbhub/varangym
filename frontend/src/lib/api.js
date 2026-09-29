// Backend + WebAuthn helpers (ported from the original workout client).
export const IS_APPLE = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)
export const IS_ANDROID = /Android/.test(navigator.userAgent)
export const BIO = IS_APPLE ? 'Face ID / Touch ID' : IS_ANDROID ? 'fingerprint or face unlock' : 'your fingerprint, face or PIN'
export const VAULT = IS_APPLE ? 'iCloud Keychain' : IS_ANDROID ? 'Google Password Manager' : 'your password manager'
export const webauthnOK = () => typeof window.PublicKeyCredential !== 'undefined'

let remoteBase = ''
let remoteToken = null
export function setRemoteAuth(base, token) { remoteBase = base || ''; remoteToken = token || null }

export function appBase(loc = typeof location !== 'undefined' ? location : null) {
  const path = (loc && loc.pathname) || '/'
  return path.slice(0, path.lastIndexOf('/') + 1) || '/'
}

export async function api(path, opts) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts && opts.headers)
  if (remoteToken) headers.Authorization = 'Bearer ' + remoteToken
  const url = remoteBase ? remoteBase + path : appBase().replace(/\/$/, '') + path
  const r = await fetch(url, Object.assign({}, opts, { headers }))
  const data = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(data.error || ('HTTP ' + r.status)); e.status = r.status; e.data = data; throw e }
  return data
}

export async function pairRedeem(serverBase, code) {
  const r = await fetch(serverBase + '/api/pair/redeem', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code })
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(data.error || ('HTTP ' + r.status)); e.status = r.status; throw e }
  return data
}

const bufToB64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64uToBuf = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)).buffer

function toCreationOptions(o) {
  o.challenge = b64uToBuf(o.challenge)
  o.user.id = b64uToBuf(o.user.id)
  ;(o.excludeCredentials || []).forEach(c => { c.id = b64uToBuf(c.id) })
  return o
}
function toRequestOptions(o) {
  o.challenge = b64uToBuf(o.challenge)
  ;(o.allowCredentials || []).forEach(c => { c.id = b64uToBuf(c.id) })
  return o
}
function credToJSON(cred) {
  const r = cred.response
  const out = {
    id: cred.id, rawId: bufToB64u(cred.rawId), type: cred.type,
    clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
    authenticatorAttachment: cred.authenticatorAttachment || null,
    response: { clientDataJSON: bufToB64u(r.clientDataJSON) }
  }
  if (r.attestationObject) {
    out.response.attestationObject = bufToB64u(r.attestationObject)
    out.response.transports = r.getTransports ? r.getTransports() : ['internal']
  }
  if (r.authenticatorData) {
    out.response.authenticatorData = bufToB64u(r.authenticatorData)
    out.response.signature = bufToB64u(r.signature)
    out.response.userHandle = r.userHandle ? bufToB64u(r.userHandle) : null
  }
  return out
}

// One normalized account shape is used by the workout UI and the VARANGYM role panels.
// Older openGym screens still read `admin`, while the SaaS layer uses
// `is_platform_admin` + memberships. Never throw either piece of information away.
export function platformUser(u, memberships = []) {
  if (!u) return u
  const resolvedMemberships = Array.isArray(u.memberships)
    ? u.memberships
    : (Array.isArray(memberships) ? memberships : [])
  const platformAdmin = !!(u.is_platform_admin || u.admin)
  return {
    ...u,
    name: u.name || u.display_name || 'VARANGYM',
    display_name: u.display_name || u.name || 'VARANGYM',
    admin: platformAdmin,
    is_platform_admin: platformAdmin,
    memberships: resolvedMemberships
  }
}

export async function passkeyRegister(name, code, locale = 'uk', email = null) {
  const { cid, options } = await api('/api/auth/register/options', {
    method: 'POST', body: JSON.stringify({ name, code: code || '', email: email || null })
  })
  const cred = await navigator.credentials.create({ publicKey: toCreationOptions(options) })
  const res = await api('/api/auth/register/verify', {
    method: 'POST', body: JSON.stringify({ cid, credential: credToJSON(cred), locale })
  })
  return platformUser(res.user, res.memberships)
}

export async function passkeyLogin() {
  const { cid, options } = await api('/api/auth/login/options', { method: 'POST', body: '{}' })
  const cred = await navigator.credentials.get({ publicKey: toRequestOptions(options) })
  const res = await api('/api/auth/login/verify', {
    method: 'POST', body: JSON.stringify({ cid, credential: credToJSON(cred) })
  })
  return platformUser(res.user, res.memberships)
}
