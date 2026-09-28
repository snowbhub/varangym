// Browser-only shell of the i18n module. The runtime-agnostic state and readers live
// in i18n-core.js (plain Node-loadable); this file adds lazy-loaded language packs and
// the React subscription hook.

import { useSyncExternalStore } from 'react'
import {
  LANGS, INSTR_LANGS, EXERCISE_NAME_LANGS, DATE_LOCALES, DERIVED_LOCALES,
  getLang, dateLocale, t, instrFor, exerciseNameFor, exerciseNameSearchText, getVersion,
  baseLang, derivePack, _setLangState
} from './i18n-core.js'
import { ukrainianizeInstructions } from './uk-instructions.js'

export {
  LANGS, INSTR_LANGS, EXERCISE_NAME_LANGS, DATE_LOCALES, DERIVED_LOCALES,
  getLang, dateLocale, t, instrFor, exerciseNameFor, exerciseNameSearchText
}

const localePacks = import.meta.glob('../locales/*.js')
const ukExtraPacks = import.meta.glob('../locales/uk-extra-*.js')
const instrPacks = import.meta.glob('../instr/*.js')
const exerciseNamePacks = import.meta.glob('../exercise-names/*.js')

const subs = new Set()
const notify = () => { subs.forEach(f => f()) }

async function loadLocale(base) {
  if (base === 'en') return {}
  let main = {}
  try { main = (await localePacks['../locales/' + base + '.js']()).default || {} } catch { main = {} }
  if (base !== 'uk') return main

  const extras = {}
  for (const path of Object.keys(ukExtraPacks).sort()) {
    try { Object.assign(extras, (await ukExtraPacks[path]()).default || {}) } catch {}
  }
  return { ...extras, ...main }
}

async function loadInstructions(base) {
  if (base === 'en' || !INSTR_LANGS.includes(base)) return null
  try {
    // The upstream catalogue has a complete Russian instruction dataset but no Ukrainian one.
    // Reuse its exercise-id coverage and translate the coaching vocabulary to Ukrainian so every
    // exercise has instructions instead of silently falling back to English.
    if (base === 'uk') {
      const ru = (await instrPacks['../instr/ru.js']()).default
      return ukrainianizeInstructions(ru)
    }
    return (await instrPacks['../instr/' + base + '.js']()).default
  } catch {
    return null
  }
}

export async function setLang(l) {
  if (!LANGS[l]) l = 'en'
  if (l === getLang() && getVersion() > 0) return
  const base = baseLang(l)
  let dict = {}, instr = null, exerciseNames = null
  dict = await loadLocale(base)
  instr = await loadInstructions(base)
  try {
    // Ukrainian exercise titles are generated from the complete canonical catalogue in
    // i18n-core.js, so it does not need a giant generated exercise-names file.
    exerciseNames = base === 'uk' || base === 'en' || !EXERCISE_NAME_LANGS.includes(base)
      ? null
      : (await exerciseNamePacks['../exercise-names/' + base + '.js']()).default
  } catch { exerciseNames = null }
  _setLangState(l, derivePack(l, dict), derivePack(l, instr), derivePack(l, exerciseNames))
  notify()
}

export function useLang() {
  return useSyncExternalStore(fn => { subs.add(fn); return () => subs.delete(fn) }, getVersion)
}
