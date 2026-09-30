import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MOBILE } from './lib/mobile.js'
import './index.css'
import './varangym-polish.css'
import './final-polish.css'

// VARANGYM defaults new browser installs to Ukrainian. Existing local profiles keep the
// language they explicitly selected, and signed-in profiles are subsequently restored from
// PostgreSQL by the normal sync layer.
try {
  if (!localStorage.getItem('gym_state_v1')) {
    localStorage.setItem('gym_state_v1', JSON.stringify({ lang: 'uk' }))
  }
} catch {}

// App.jsx restores per-route scroll itself; the browser's own attempt races it.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

// Import after seeding first-run preferences so the Zustand store sees Ukrainian on its first
// evaluation rather than the upstream English default.
const { default: App } = await import('./App.jsx')

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
)

// Not in the mobile build: the native shell already serves everything from disk.
if (!MOBILE && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}
