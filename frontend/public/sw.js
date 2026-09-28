/* VARANGYM service worker.
   - app shell: versioned runtime cache, refreshed with every deploy
   - exercise media: persistent cache that survives app updates and can be filled explicitly
     per exercise from the Library
   - API/auth/data: never cached */
const CACHE = 'varangym-runtime-__BUILD__'
const MEDIA_CACHE = 'varangym-exercise-media-v1'

async function precache() {
  const c = await caches.open(CACHE)
  const res = await fetch('index.html', { cache: 'no-cache' })
  if (!res.ok) return
  const html = await res.text()
  await c.put('index.html', new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }))
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1])
    .filter(u => /\.(?:js|css|png|svg|webmanifest|json)(?:\?|$)/.test(u) && !/^(?:https?:)?\/\//.test(u))
  await Promise.all([...new Set(refs)].map(u => c.add(u).catch(() => {})))
}

self.addEventListener('install', e => {
  e.waitUntil(precache().catch(() => {}).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys
      .filter(k => k !== CACHE && k !== MEDIA_CACHE)
      .map(k => caches.delete(k)))
  ).then(() => self.clients.claim()))
})

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let data = {}
    try { data = e.data ? e.data.json() : {} } catch { data = { body: (() => { try { return e.data.text() } catch { return '' } })() } }
    const tag = data.tag || 'varangym'
    try { for (const n of await self.registration.getNotifications({ tag })) n.close() } catch {}
    await self.registration.showNotification(data.title || 'VARANGYM', {
      body: data.body || '',
      icon: 'icon-512.png',
      badge: 'icon-180.png',
      tag,
      renotify: true
    })
  })())
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(clients => {
    const c = clients.find(c => 'focus' in c)
    return c ? c.focus() : self.clients.openWindow('./')
  }))
})

self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil((async () => {
    const old = e.oldSubscription || (await self.registration.pushManager.getSubscription())
    const key = e.newSubscription?.options?.applicationServerKey || old?.options?.applicationServerKey
    if (!key) return
    const sub = e.newSubscription || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    await fetch('api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) }).catch(() => {})
  })())
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/')) return

  const isMedia = url.pathname.includes('/img/') || url.pathname.includes('/gif/')
  if (isMedia) {
    e.respondWith((async () => {
      const media = await caches.open(MEDIA_CACHE)
      const hit = await media.match(e.request, { ignoreSearch: true })
      if (hit) return hit
      try {
        const res = await fetch(e.request)
        if (res.ok) await media.put(e.request, res.clone())
        return res
      } catch {
        // A previous build may have viewed this file before persistent media caching existed.
        const runtimeHit = await caches.match(e.request, { ignoreSearch: true })
        if (runtimeHit) return runtimeHit
        throw new Error('offline media unavailable')
      }
    })())
    return
  }

  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}) }
    return res
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit =>
    hit || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined)
  )))
})
