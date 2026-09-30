let rows=[]
let byLegacy=new Map()
export function setExerciseOverrides(next=[]){rows=Array.isArray(next)?next:[];byLegacy=new Map(rows.filter(x=>x?.legacy_key).map(x=>[String(x.legacy_key),x]));return rows.length}
export function exerciseOverride(id){return byLegacy.get(String(id||''))||null}
export function localizedExerciseOverride(ex,lang){const o=exerciseOverride(ex?.id);if(!o)return null;const tr=o.translations?.[lang]||o.translations?.[String(lang||'').split('-')[0]]||null;return tr?.name||null}
export function effectiveExercise(ex,lang,body){
  if(!ex)return ex
  const o=exerciseOverride(ex.id);if(!o)return ex
  const tr=o.translations?.[lang]||o.translations?.[String(lang||'').split('-')[0]]||null
  const md=o.metadata||{}
  const female=body==='female'
  const img=female?(md.imageFemale??md.image):(md.imageMale??md.image)
  const gif=female?(md.gifFemale??md.gif):(md.gifMale??md.gif)
  return {...ex,n:tr?.name||ex.n,desc:tr?.description??ex.desc,st:Array.isArray(tr?.instructions)&&tr.instructions.length?tr.instructions:ex.st,img:img===undefined?ex.img:img,gif:gif===undefined?ex.gif:gif,eq:o.equipment_key??ex.eq,tg:o.primary_muscle_key??ex.tg,_vgActive:o.active!==false,_vgOverride:o}
}
export function overrideActive(ex){const o=exerciseOverride(ex?.id);return o?o.active!==false:true}
