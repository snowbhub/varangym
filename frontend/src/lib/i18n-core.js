// Runtime-agnostic core of the i18n module: state, constants and readers (t, dateLocale,
// instrFor, exerciseNameFor, getLang). Plain Node-loadable — the browser-only pieces
// (import.meta.glob lazy loads, the React subscription hook) live in i18n.js and re-export from here.

export const LANGS = {
  en: 'English', uk: 'Українська', de: 'Deutsch', 'de-CH': 'Deutsch (Schweiz)', es: 'Español', fr: 'Français',
  it: 'Italiano', pt: 'Português (Portugal)', 'pt-BR': 'Português (Brasil)', pl: 'Polski',
  tr: 'Türkçe', ru: 'Русский', zh: '中文',
  ko: '한국어', hi: 'हिन्दी', th: 'ไทย', hu: 'Magyar'
}
export const INSTR_LANGS = ['en', 'uk', 'es', 'fr', 'it', 'tr', 'ru', 'zh', 'hi', 'pl', 'ko', 'pt-BR', 'hu']
export const EXERCISE_NAME_LANGS = ['uk', 'pt-BR', 'hu']
export const DATE_LOCALES = {
  en: 'en-GB', uk: 'uk-UA', de: 'de-DE', 'de-CH': 'de-CH', es: 'es-ES', fr: 'fr-FR', it: 'it-IT',
  pt: 'pt-PT', 'pt-BR': 'pt-BR',
  pl: 'pl-PL', tr: 'tr-TR', ru: 'ru-RU', zh: 'zh-CN', ko: 'ko-KR', hi: 'hi-IN', th: 'th-TH', hu: 'hu-HU'
}

// Locales derived from another language by a pure text transform rather than carried as their
// own pack. Swiss Standard German has no ß — every one is written ss — so de-CH is de with a
// single substitution.
export const DERIVED_LOCALES = {
  'de-CH': { base: 'de', transform: s => s.replace(/ß/g, 'ss') }
}

export const baseLang = l => DERIVED_LOCALES[l]?.base || l

export function derivePack(l, pack) {
  const transform = DERIVED_LOCALES[l]?.transform
  if (!transform || !pack) return pack
  const walk = v =>
    typeof v === 'string' ? transform(v)
      : Array.isArray(v) ? v.map(walk)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, inner]) => [k, walk(inner)]))
          : v
  return walk(pack)
}

let lang = 'en'
let dict = {}
let instr = null
let exerciseNames = null
let version = 0

export const getLang = () => lang
export const dateLocale = () => DATE_LOCALES[lang] || 'en-GB'
export const getVersion = () => version

// VARANGYM is a commercial rebrand of the open-source base. UI strings inherited from upstream
// may still contain the old product name; normalize those at the final translation boundary so
// no stale branding leaks into toasts/settings while the source remains easy to rebase.
const brandText = value => String(value ?? '')
  .replaceAll('openGym', 'VARANGYM')
  .replaceAll('OpenGym', 'VARANGYM')
  .replaceAll('opengym', 'varangym')

// Translate a source string; {0},{1}… are replaced with args (also on the English fallback).
export function t(s, ...args) {
  let v = dict[s] || s
  for (let i = 0; i < args.length; i++) v = v.replaceAll('{' + i + '}', args[i])
  return brandText(v)
}

export const instrFor = ex => (instr && instr[ex.id]) || ex.st || []

export const exerciseNameFor = ex => {
  const translated = exerciseNames && ex && exerciseNames[ex.id]
  if (!translated) return ex?.n || ''
  return translated.toLocaleLowerCase(lang) === ex.n.toLocaleLowerCase('en')
    ? translated
    : `${translated} (${ex.n})`
}

export const exerciseNameSearchText = ex => {
  const translated = exerciseNames && ex && exerciseNames[ex.id]
  return translated ? `${translated} ${ex.n}` : (ex?.n || '')
}

export function _setLangState(newLang, newDict, newInstr, newExerciseNames) {
  lang = LANGS[newLang] ? newLang : 'en'
  dict = lang === 'en' ? {} : (newDict || {})
  instr = lang === 'en' || !INSTR_LANGS.includes(baseLang(lang)) ? null : (newInstr || null)
  exerciseNames = lang === 'en' || !EXERCISE_NAME_LANGS.includes(baseLang(lang))
    ? null
    : (newExerciseNames || null)
  version++
  return version
}
