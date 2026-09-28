// VARANGYM update check — compares the installed version (__APP_VERSION__) against
// the latest public GitHub release and optionally downloads + installs the Android APK.
//
// The release API is public. Android downloads are verified against the accompanying
// .sha256 asset before handing the APK to the system installer.

import { MOBILE } from './mobile.js'

const RELEASES_URL = 'https://api.github.com/repos/snowbhub/varangym/releases?per_page=1'
export const RELEASES_PAGE = 'https://github.com/snowbhub/varangym/releases'

function compareSemver(a, b) {
  const clean = value => String(value || '').replace(/^v/i, '').split('-')[0].split('.').map(Number)
  const pa = clean(a)
  const pb = clean(b)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff > 0) return 1
    if (diff < 0) return -1
  }
  return 0
}

let cached = null
export function resetUpdateCheck() { cached = null }
export async function checkForUpdate() {
  if (!cached) cached = fetchLatest().catch(e => { cached = null; throw e })
  return cached
}

async function fetchLatest() {
  const res = await fetch(RELEASES_URL, { headers: { accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const releases = await res.json()
  if (!releases.length) return { hasUpdate: false, latestVersion: __APP_VERSION__, apkUrl: null, hashUrl: null, releasesUrl: RELEASES_PAGE }

  const latest = releases[0]
  const latestVersion = String(latest.tag_name || '').replace(/^v/i, '')
  const hasUpdate = compareSemver(latestVersion, __APP_VERSION__) > 0
  const assets = Array.isArray(latest.assets) ? latest.assets : []
  const apk = assets.find(a => /\.apk$/i.test(a.name || ''))
  const hash = assets.find(a => /\.apk\.sha256$/i.test(a.name || '') || /sha256/i.test(a.name || ''))

  return {
    hasUpdate,
    latestVersion,
    apkUrl: apk?.browser_download_url || null,
    hashUrl: hash?.browser_download_url || null,
    releasesUrl: latest.html_url || RELEASES_PAGE
  }
}

export async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function downloadAndInstall(url, expectedHash = null, onProgress = null) {
  if (!MOBILE) {
    window.open(RELEASES_PAGE, '_blank', 'noopener')
    return
  }

  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)

  const total = parseInt(res.headers.get('content-length') || '0', 10)
  const reader = res.body.getReader()
  const chunks = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (onProgress) onProgress(received, total)
  }

  const blob = new Blob(chunks)
  if (blob.size < 100_000) throw new Error('Downloaded file is too small to be a valid APK (' + blob.size + ' bytes)')

  if (expectedHash) {
    const actualHash = await sha256(await blob.arrayBuffer())
    if (actualHash !== expectedHash.toLowerCase().trim()) throw new Error('SHA-256 mismatch — download may be corrupted or tampered with')
  }

  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

  const fileName = 'varangym-update.apk'
  await Filesystem.writeFile({ path: fileName, directory: Directory.Cache, data: base64 })

  const { registerPlugin } = await import('@capacitor/core')
  const Install = registerPlugin('Install')
  await Install.installApk({ fileName })
}
