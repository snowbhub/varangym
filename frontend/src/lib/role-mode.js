const KEY='varangym-role-mode'
const valid=new Set(['admin','trainer','business'])
export function getRoleMode(){try{const v=sessionStorage.getItem(KEY)||localStorage.getItem(KEY);return valid.has(v)?v:null}catch{return null}}
export function setRoleMode(mode){try{if(valid.has(mode)){sessionStorage.setItem(KEY,mode);localStorage.setItem(KEY,mode)}else{sessionStorage.removeItem(KEY);localStorage.removeItem(KEY)}}catch{}window.dispatchEvent(new CustomEvent('varangym-role-mode',{detail:valid.has(mode)?mode:null}))}
export function roleRoute(mode,view='home'){const m=valid.has(mode)?mode:'admin';if(view==='exercises'&&m!=='admin')return `/${m}/exercises`;return `/${m}?view=${encodeURIComponent(view)}`}
export function viewOf(search=''){try{return new URLSearchParams(search).get('view')||'home'}catch{return'home'}}
