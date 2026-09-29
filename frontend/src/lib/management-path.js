export const MANAGEMENT_SECTIONS = ['home','people','dashboard','stats','exercises']

export function managementModeFromPath(path='') {
  const m=String(path).match(/^\/(admin|trainer|business)(?:\/([^/?#]+))?/)
  if(!m)return null
  return { mode:m[1], section:MANAGEMENT_SECTIONS.includes(m[2])?m[2]:'dashboard' }
}

export function managementRoute(mode,section='dashboard') {
  const safeMode=['admin','trainer','business'].includes(mode)?mode:'trainer'
  const safeSection=MANAGEMENT_SECTIONS.includes(section)?section:'dashboard'
  return `/${safeMode}/${safeSection}`
}

export function managementLabels(mode) {
  if(mode==='admin')return {home:'Головна',people:'Користувачі',dashboard:'Дашборд',stats:'Статистика',exercises:'Вправи'}
  if(mode==='business')return {home:'Головна',people:'Команда',dashboard:'Дашборд',stats:'Статистика',exercises:'Вправи'}
  return {home:'Головна',people:'Клієнти',dashboard:'Дашборд',stats:'Статистика',exercises:'Вправи'}
}
