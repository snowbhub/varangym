import { imgSrc, gifSrc } from './exercises.js'

export const OFFLINE_MEDIA_CACHE = 'varangym-exercise-media-v1'

function urlsFor(ex) {
  if (!ex) return []
  const urls = []
  if (ex.img) urls.push(imgSrc(ex))
  if (ex.gif) urls.push(gifSrc(ex))
  return [...new Set(urls)]
}

export function offlineMediaSupported() {
  return typeof window !== 'undefined' && 'caches' in window && typeof fetch === 'function'
}

export async function exerciseOfflineStatus(ex) {
  if (!offlineMediaSupported()) return { supported: false, cached: false, total: 0, cachedCount: 0 }
  const urls = urlsFor(ex)
  if (!urls.length) return { supported: true, cached: true, total: 0, cachedCount: 0 }
  const cache = await caches.open(OFFLINE_MEDIA_CACHE)
  let cachedCount = 0
  for (const url of urls) if (await cache.match(url, { ignoreSearch: true })) cachedCount++
  return { supported: true, cached: cachedCount === urls.length, total: urls.length, cachedCount }
}

export async function downloadExerciseOffline(ex, onProgress) {
  if (!offlineMediaSupported()) throw new Error('Offline media is not supported in this browser')
  const urls = urlsFor(ex)
  const cache = await caches.open(OFFLINE_MEDIA_CACHE)
  let done = 0
  for (const url of urls) {
    const existing = await cache.match(url, { ignoreSearch: true })
    if (!existing) {
      const res = await fetch(url, { cache: 'no-cache' })
      if (!res.ok) throw new Error(`Could not download media (${res.status})`)
      await cache.put(url, res.clone())
    }
    done++
    onProgress?.(done, urls.length)
  }
  return { cached: true, total: urls.length }
}

export async function removeExerciseOffline(ex) {
  if (!offlineMediaSupported()) return false
  const cache = await caches.open(OFFLINE_MEDIA_CACHE)
  const results = await Promise.all(urlsFor(ex).map(url => cache.delete(url, { ignoreSearch: true })))
  return results.some(Boolean)
}

export async function offlineMediaUsage() {
  if (!offlineMediaSupported()) return { count: 0, bytes: null }
  const cache = await caches.open(OFFLINE_MEDIA_CACHE)
  const keys = await cache.keys()
  let bytes = 0
  let measurable = true
  for (const req of keys) {
    const res = await cache.match(req)
    const n = Number(res?.headers?.get('content-length'))
    if (Number.isFinite(n) && n >= 0) bytes += n
    else measurable = false
  }
  return { count: keys.length, bytes: measurable ? bytes : null }
}
