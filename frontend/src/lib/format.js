// Formatting + date helpers (ported from the vanilla app, unit taken from the store where needed).
import { dateLocale, t } from './i18n-core.js'
export const todayISO = () => {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
export const isoOf = d =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')

export const DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function fmtDate(iso, long, withYear = false) {
  const d = new Date(iso + 'T12:00:00')
  const options = long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' }
  if (withYear) options.year = 'numeric'
  return d.toLocaleDateString(dateLocale(), options)
}
export function fmtDur(ms) {
  const m = Math.floor(ms / 60000)
  return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + ' min'
}
export const durPart = ms => (ms >= 60000 ? [fmtDur(ms)] : [])
export const capWords = s => String(s || '').replace(/(^|[\s(\-\/])(\p{Ll})/gu, (m, pre, ch) => pre + ch.toUpperCase())
let decimals = 1
export const setWeightDecimals = n => { decimals = n === 2 ? 2 : 1 }
export const weightDecimals = () => decimals
export const fmtNum = n => {
  const p = decimals === 2 ? 100 : 10
  return (Math.round(n * p) / p).toLocaleString(dateLocale(), { maximumFractionDigits: decimals })
}
export const fmtVol = (v, unit) => fmtNum(v) + ' ' + unit
export const exCount = n => t(n === 1 ? '{0} exercise' : '{0} exercises', n)
export const routineCount = n => t(n === 1 ? '{0} routine' : '{0} routines', n)

export const MONDAY = 1
export const SUNDAY = 0
export const weekStartOf = S => (S?.weekStart === SUNDAY ? SUNDAY : MONDAY)
export const weekOrder = (ws = MONDAY) => Array.from({ length: 7 }, (_, i) => (ws + i) % 7)
export const weekDayOffset = (day, ws = MONDAY) => (day - ws + 7) % 7
export function startOfWeek(iso, ws = MONDAY) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() - weekDayOffset(d.getDay(), ws))
  return d
}
export const weekKey = (iso, ws = MONDAY) => isoOf(startOfWeek(iso, ws))
export const localTZ = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' } }
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

// One green identity only. Existing profiles that stored the legacy `lime` key are migrated in App.jsx.
export const ACCENTS = { varangym: '#48d86f', sky: '#0a84ff', orange: '#ff9f0a', violet: '#bf5af2', pink: '#ff375f', red: '#ff453a', teal: '#40c8e0', gold: '#ffd60a' }
