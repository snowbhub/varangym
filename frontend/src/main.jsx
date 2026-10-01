import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MOBILE } from './lib/mobile.js'
import './index.css'
import './varangym-polish.css'

// New installs start with the VARANGYM brand accent. Language is still selectable before login;
// Ukrainian remains the first-run default for this deployment, while signed-in profiles restore
// their own saved language normally.
try {
  if (!localStorage.getItem('gym_state_v1')) {
    localStorage.setItem('gym_state_v1', JSON.stringify({ lang: 'uk', accent: 'varangym' }))
  }
} catch {}

if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
const { default: App } = await import('./App.jsx')
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
if (!MOBILE && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}
