let rows=[]
let byLegacy=new Map()
export function setExerciseOverrides(next=[]){rows=Array.isArray(next)?next:[];byLegacy=new Map(rows.filter(x=>x?.legacy_key).map(x=>[String(x.legacy_key),x]));return rows.length}
export function exerciseOverride(id){return byLegacy.get(String(id||''))||null}
export function localizedExerciseOverride(ex,lang){const o=exerciseOverride(ex?.id);if(!o)return null;const tr=o.translations?.[lang]||o.translations?.[String(lang||'').split('-')[0]]||null;return tr?.name||null}
export function effectiveExercise(ex,lang){if(!ex)return ex;const o=exerciseOverride(ex.id);if(!o)return ex;const tr=o.translations?.[lang]||o.translations?.[String(lang||'').split('-')[0]]||null;const md=o.metadata||{};return {...ex,n:tr?.name||ex.n,img:md.image===undefined?ex.img:md.image,gif:md.gif===undefined?ex.gif:md.gif,eq:o.equipment_key??ex.eq,tg:o.primary_muscle_key??ex.tg,_vgActive:o.active!==false,_vgOverride:o}}
export function overrideActive(ex){const o=exerciseOverride(ex?.id);return o?o.active!==false:true}
