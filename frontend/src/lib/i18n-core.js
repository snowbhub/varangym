import { ukExerciseName } from './uk-exercise-name.js'
import { ruExerciseName } from './ru-exercise-name.js'
import { popularExerciseName } from './exercise-popular-name.js'
import { naturalExerciseName } from './exercise-natural-name.js'
import { localizedExerciseOverride } from './exercise-overrides-core.js'

export const LANGS = {
  en: 'English', uk: 'Українська', de: 'Deutsch', 'de-CH': 'Deutsch (Schweiz)', es: 'Español', fr: 'Français', it: 'Italiano', pt: 'Português (Portugal)', 'pt-BR': 'Português (Brasil)', pl: 'Polski', tr: 'Türkçe', ru: 'Русский', zh: '中文', ko: '한국어', hi: 'हिन्दी', th: 'ไทย', hu: 'Magyar'
}
export const INSTR_LANGS = ['en', 'uk', 'es', 'fr', 'it', 'tr', 'ru', 'zh', 'hi', 'pl', 'ko', 'pt-BR', 'hu']
export const EXERCISE_NAME_LANGS = ['uk', 'pt-BR', 'hu']
export const DATE_LOCALES = {
  en: 'en-GB', uk: 'uk-UA', de: 'de-DE', 'de-CH': 'de-CH', es: 'es-ES', fr: 'fr-FR', it: 'it-IT', pt: 'pt-PT', 'pt-BR': 'pt-BR', pl: 'pl-PL', tr: 'tr-TR', ru: 'ru-RU', zh: 'zh-CN', ko: 'ko-KR', hi: 'hi-IN', th: 'th-TH', hu: 'hu-HU'
}

export const DERIVED_LOCALES = {
  'de-CH': { base: 'de', transform: s => s.replace(/ß/g, 'ss') }
}

export const baseLang = l => DERIVED_LOCALES[l]?.base || l

export function derivePack(l, pack) {
  const transform = DERIVED_LOCALES[l]?.transform
  if (!transform || !pack) return pack
  const walk = v => typeof v === 'string' ? transform(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, inner]) => [k, walk(inner)])) : v
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

const brandText = value => String(value ?? '').replaceAll('openGym', 'VARANGYM').replaceAll('OpenGym', 'VARANGYM').replaceAll('opengym', 'varangym')

const cleanExerciseName = value => String(value ?? '').replaceAll('§', '').replace(/\s+/g, ' ').replace(/\s+([,;:)])/g, '$1').trim()

export function t(s, ...args) {
  let v = dict[s] || s
  for (let i = 0; i < args.length; i++) v = v.replaceAll('{' + i + '}', args[i])
  return brandText(v)
}

export const instrFor = ex => (instr && instr[ex.id]) || ex.st || []

const generatedExerciseName = (ex, currentLang) => {
  const natural = naturalExerciseName(ex?.n || '', currentLang)
  if (natural) return natural
  const popular = popularExerciseName(ex?.n || '', currentLang)
  if (popular) return popular
  if (currentLang === 'uk') return ukExerciseName(ex?.n || '')
  if (currentLang === 'ru') return ruExerciseName(ex?.n || '')
  return null
}

export const exerciseNameFor = ex => {
  if (!ex) return ''
  const curated = localizedExerciseOverride(ex, lang)
  if (curated) return cleanExerciseName(curated)
  const translated = exerciseNames && exerciseNames[ex.id]
  if (lang === 'uk' || lang === 'ru') return cleanExerciseName(translated || generatedExerciseName(ex, lang) || ex.n || '')
  if (!translated) return cleanExerciseName(ex.n || '')
  return cleanExerciseName(translated.toLocaleLowerCase(lang) === ex.n.toLocaleLowerCase('en') ? translated : `${translated} (${ex.n})`)
}

export const exerciseNameSearchText = ex => {
  if (!ex) return ''
  const curated = localizedExerciseOverride(ex, lang)
  const translated = exerciseNames && exerciseNames[ex.id]
  if (curated) return `${cleanExerciseName(curated)} ${ex.n || ''}`.trim()
  if (lang === 'uk' || lang === 'ru') return `${cleanExerciseName(translated || generatedExerciseName(ex, lang) || ex.n || '')} ${ex.n || ''}`.trim()
  return translated ? `${cleanExerciseName(translated)} ${ex.n}` : (ex.n || '')
}

export function _setLangState(newLang, newDict, newInstr, newExerciseNames) {
  lang = LANGS[newLang] ? newLang : 'en'
  dict = lang === 'en' ? {} : (newDict || {})
  instr = lang === 'en' || !INSTR_LANGS.includes(baseLang(lang)) ? null : (newInstr || null)
  exerciseNames = lang === 'en' || !EXERCISE_NAME_LANGS.includes(baseLang(lang)) ? null : (newExerciseNames || null)
  version++
  return version
}
