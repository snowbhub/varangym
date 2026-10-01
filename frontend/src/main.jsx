import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MOBILE } from './lib/mobile.js'
import './index.css'
import './varangym-polish.css'
import './final-mobile-polish.css'
import './product-v8.css'

// First run uses the VARANGYM identity green. Retire the old lime accent without touching any
// other saved preference; signed-in language/state still restores through the normal sync layer.
try {
  const raw = localStorage.getItem('gym_state_v1')
  if (!raw) {
    localStorage.setItem('gym_state_v1', JSON.stringify({ lang: 'uk', accent: 'varangym' }))
  } else {
    const state = JSON.parse(raw)
    if (!state.accent || state.accent === 'lime') {
      state.accent = 'varangym'
      localStorage.setItem('gym_state_v1', JSON.stringify(state))
    }
  }
} catch {}

if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
const { default: App } = await import('./App.jsx')
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
if (!MOBILE && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}
