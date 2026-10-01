import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { CATALOGUE, gifSrc, imgSrc } from '../lib/exercises.js'
import { getLang, t, useLang } from '../lib/i18n.js'
import { ukExerciseName } from '../lib/uk-exercise-name.js'
import { ruExerciseName } from '../lib/ru-exercise-name.js'
import { popularExerciseName } from '../lib/exercise-popular-name.js'
import { ukrainianizeInstructions } from '../lib/uk-instructions.js'
import { loadExerciseOverrides } from '../lib/exercise-overrides.js'
import { useUI } from '../store/useUI.js'
import { Thumb } from './Media.jsx'
import { Button, Row, Section, Segmented, Switch } from './ui.jsx'
import PlanManagerPro from './PlanManagerPro.jsx'

const list = v => Array.isArray(v) ? v : v ? [v] : []
const uniq = arr => [...new Set(arr.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)))
const generatedName = (ex,lang) => lang==='uk' ? ukExerciseName(ex.n||'') : lang==='ru' ? ruExerciseName(ex.n||'') : (ex.n||ex.id)
const adminEdited=o=>o?.metadata?.adminOverride===true||o?.metadata?.adminOverride==='true'
const genderOf = ex => {
  const n=String(ex?.n||'').toLowerCase()
  if(n.includes('(female)')||n.includes(' female ')) return 'female'
  if(n.includes('(male)')||n.includes(' male ')) return 'male'
  return 'unisex'
}
const cleanLines = v => Array.isArray(v) ? v.join('\n') : String(v||'')
const stepArray = v => Array.isArray(v) ? v : String(v||'').split('\n').map(x=>x.trim()).filter(Boolean)
const mediaValue=(draft,body,kind)=>{
  const sex=body==='female'?'Female':'Male'
  return draft?.[`${kind}${sex}`]||draft?.[kind]||''
}
const previewExercise=(selected,draft,body)=>({
  ...selected,
  img:mediaValue(draft,body,'image')||selected.img,
  gif:mediaValue(draft,body,'gif')||selected.gif,
})
const externalMedia=value=>/^(?:https?:|data:|blob:)/i.test(String(value||''))
const cleanMediaPath=value=>String(value||'').replace(/^\/+/, '').replace(/^(?:(?:img|images|gif|gifs|video|videos)\/)+/i,'')
const previewMediaUrl=(ex,key,builder)=>{
  const raw=ex?.[key]
  if(!raw)return''
  if(externalMedia(raw))return String(raw)
  const cleaned=cleanMediaPath(raw)
  return cleaned?builder({...ex,[key]:cleaned}):''
}
const qualityOf=(ex,o,locale)=>{
  if(adminEdited(o)&&o?.translations?.[locale]?.name)return 'manual'
  if(locale==='uk'||locale==='ru')return popularExerciseName(ex.n||'',locale)?'curated':'auto'
  return 'source'
}
const qualityLabel=q=>q==='manual'?t('Manual override'):q==='curated'?t('Gym name'):q==='auto'?t('Automatic name'):t('Original English')
const editLocaleDefault=()=>['uk','ru','en'].includes(getLang())?getLang():'en'

export default function AdminExerciseStudio({workspaces=[],users=[]}) {
  useLang()
  const toast=useUI(s=>s.toast)
  const [tab,setTab]=useState('library')
  const [locale,setLocale]=useState(editLocaleDefault)
  const [q,setQ]=useState('')
  const [body,setBody]=useState('all')
  const [quality,setQuality]=useState('all')
  const [part,setPart]=useState('')
  const [equipment,setEquipment]=useState('')
  const [muscle,setMuscle]=useState('')
  const [shown,setShown]=useState(100)
  const [overrides,setOverrides]=useState(new Map())
  const [selected,setSelected]=useState(null)
  const [editLang,setEditLang]=useState(editLocaleDefault)
  const [previewBody,setPreviewBody]=useState('male')
  const [draft,setDraft]=useState(null)
  const [busy,setBusy]=useState(false)

  const loadOverrides=async()=>{
    try{
      const d=await api('/api/exercise-admin')
      setOverrides(new Map((d.overrides||[]).map(x=>[x.legacy_key,x])))
    }catch(e){toast(e.message||t('Could not load exercise changes'))}
  }
  useEffect(()=>{loadOverrides()},[])

  const bodyParts=useMemo(()=>uniq(CATALOGUE.map(x=>x.bp)),[])
  const equipments=useMemo(()=>uniq(CATALOGUE.map(x=>x.eq)),[])
  const muscles=useMemo(()=>uniq(CATALOGUE.flatMap(x=>[x.tg,...list(x.sm),...list(x.primaries),...list(x.secondaries)])),[])
  const coverage=useMemo(()=>{
    const out={manual:0,curated:0,auto:0,source:0,hidden:0}
    for(const ex of CATALOGUE){
      const o=overrides.get(ex.id)
      out[qualityOf(ex,o,locale)]++
      if(o?.active===false)out.hidden++
    }
    return out
  },[overrides,locale])

  const rows=useMemo(()=>{
    const needle=q.trim().toLowerCase()
    return CATALOGUE.filter(ex=>{
      const o=overrides.get(ex.id)
      const g=o?.metadata?.gender||genderOf(ex)
      if(body!=='all'&&g!=='unisex'&&g!==body)return false
      if(quality!=='all'&&qualityOf(ex,o,locale)!==quality)return false
      if(part&&ex.bp!==part)return false
      if(equipment&&ex.eq!==equipment)return false
      const exMuscles=[ex.tg,...list(ex.sm),...list(ex.primaries),...list(ex.secondaries)]
      if(muscle&&!exMuscles.includes(muscle))return false
      if(!needle)return true
      const names=[
        ex.n,ukExerciseName(ex.n||''),ruExerciseName(ex.n||''),
        adminEdited(o)?o?.translations?.uk?.name:null,
        adminEdited(o)?o?.translations?.ru?.name:null,
        adminEdited(o)?o?.translations?.en?.name:null,
        ex.bp,ex.eq,ex.tg,...exMuscles
      ].filter(Boolean).join(' ').toLowerCase()
      return names.includes(needle)
    })
  },[q,body,quality,locale,part,equipment,muscle,overrides])

  const openExercise=async ex=>{
    setSelected(ex)
    setEditLang(locale)
    setPreviewBody(genderOf(ex)==='female'?'female':'male')
    const o=overrides.get(ex.id)
    const manual=adminEdited(o)
    let ruSteps=[]
    try{
      const pack=(await import('../instr/ru.js')).default||{}
      ruSteps=stepArray(pack[ex.id])
    }catch{}
    const ukSteps=ruSteps.length ? (ukrainianizeInstructions({[ex.id]:ruSteps})?.[ex.id]||[]) : []
    const baseTr={
      uk:{name:manual&&o?.translations?.uk?.name?o.translations.uk.name:ukExerciseName(ex.n||''),description:o?.translations?.uk?.description||'',instructions:cleanLines(o?.translations?.uk?.instructions?.length?o.translations.uk.instructions:(ukSteps.length?ukSteps:ex.st))},
      ru:{name:manual&&o?.translations?.ru?.name?o.translations.ru.name:ruExerciseName(ex.n||''),description:o?.translations?.ru?.description||'',instructions:cleanLines(o?.translations?.ru?.instructions?.length?o.translations.ru.instructions:(ruSteps.length?ruSteps:ex.st))},
      en:{name:manual&&o?.translations?.en?.name?o.translations.en.name:(ex.n||''),description:o?.translations?.en?.description||ex.desc||'',instructions:cleanLines(o?.translations?.en?.instructions?.length?o.translations.en.instructions:ex.st)}
    }
    setDraft({
      active:o?.active!==false,
      trackingMode:o?.tracking_mode||'reps_weight',
      equipment:o?.equipment_key??ex.eq??'',
      primaryMuscle:o?.primary_muscle_key??ex.tg??'',
      bodyPart:o?.metadata?.bodyPart??ex.bp??'',
      gender:o?.metadata?.gender||genderOf(ex),
      image:manual?(o?.metadata?.image||''):'',
      gif:manual?(o?.metadata?.gif||''):'',
      imageMale:manual?(o?.metadata?.imageMale||''):'',
      gifMale:manual?(o?.metadata?.gifMale||''):'',
      imageFemale:manual?(o?.metadata?.imageFemale||''):'',
      gifFemale:manual?(o?.metadata?.gifFemale||''):'',
      secondaryMuscles:list(o?.metadata?.secondaryMuscles?.length?o.metadata.secondaryMuscles:ex.sm),
      translations:baseTr
    })
  }

  const setTr=(lang,key,value)=>setDraft(d=>({...d,translations:{...d.translations,[lang]:{...d.translations[lang],[key]:value}}}))
  const save=async()=>{
    if(!selected||!draft)return
    setBusy(true)
    try{
      const translations=Object.fromEntries(['uk','ru','en'].map(lang=>[lang,{
        name:draft.translations[lang]?.name||generatedName(selected,lang),
        description:draft.translations[lang]?.description||null,
        instructions:String(draft.translations[lang]?.instructions||'').split('\n').map(x=>x.trim()).filter(Boolean)
      }]))
      await api(`/api/exercise-admin/${encodeURIComponent(selected.id)}`,{
        method:'PUT',
        body:JSON.stringify({
          ...draft,
          translations,
          sourceName:selected.n||selected.id,
          sourceDescription:selected.desc||null,
          sourceInstructions:selected.st||[]
        })
      })
      await loadOverrides()
      await loadExerciseOverrides().catch(()=>{})
      toast(t('Exercise saved'))
      setSelected(null);setDraft(null)
    }catch(e){toast(e.message||t('Could not save exercise'))}
    finally{setBusy(false)}
  }

  if(tab==='plans'){
    return <>
      <div className="card" style={{padding:8}}><Segmented value={tab} onChange={setTab} options={[{value:'library',label:t('Exercises')},{value:'plans',label:t('Plans')}]}/></div>
      <PlanManagerPro mode="admin" workspaces={workspaces} clients={users.filter(x=>!x.is_platform_admin)}/>
    </>
  }

  if(selected&&draft){
    const tr=draft.translations[editLang]||{}
    const shownEx=previewExercise(selected,draft,previewBody)
    const currentGif=mediaValue(draft,previewBody,'gif')
    const currentImg=mediaValue(draft,previewBody,'image')
    const selectedQuality=qualityOf(selected,overrides.get(selected.id),editLang)
    const gifPreview=previewMediaUrl(shownEx,'gif',gifSrc)
    const imgPreview=previewMediaUrl(shownEx,'img',imgSrc)
    return <>
      <Button size="sm" onClick={()=>{setSelected(null);setDraft(null)}}>← {t('Exercises')}</Button>
      <div className="card" style={{marginTop:12}}>
        <div className="row" style={{gap:12,alignItems:'center'}}>
          <Thumb ex={shownEx}/>
          <div style={{minWidth:0}}>
            <div className="lbl2">{t('Exercise editor')} · {selected.id}</div>
            <div className="big" style={{fontSize:24}}>{tr.name||generatedName(selected,editLang)}</div>
            <div className="ss">{selected.n} · {draft.bodyPart||selected.bp||'—'} · {draft.equipment||selected.eq||'—'}</div>
            <div style={{marginTop:6}}><span className={'tag '+(selectedQuality==='manual'?'acc':'')}>{qualityLabel(selectedQuality)}</span></div>
          </div>
        </div>
        <div style={{marginTop:12}}><Segmented value={editLang} onChange={setEditLang} options={[{value:'uk',label:'UA'},{value:'ru',label:'RU'},{value:'en',label:'EN'}]}/></div>
      </div>

      <Section title={t('Original ExerciseDB data')}>
        <Row title={t('Name')} value={selected.n||'—'}/>
        <Row title={t('Body part')} value={selected.bp||'—'}/>
        <Row title={t('Equipment')} value={selected.eq||'—'}/>
        <Row title={t('Target muscle')} value={selected.tg||'—'}/>
        <Row title={t('Description')} subtitle={selected.desc||t('No separate description in the catalogue — technique is stored step by step below.')}/>
        <Row title={`${t('Instructions')} · ${selected.st?.length||0} ${t('steps')}`} subtitle={(selected.st||[]).length?(selected.st||[]).map((x,i)=>`${i+1}. ${x}`).join('\n'):t('No instructions in the source catalogue')}/>
      </Section>

      <div className="card">
        <label className="row between">{t('Available in catalogue')} <Switch checked={draft.active} onChange={v=>setDraft(d=>({...d,active:v}))}/></label>
        <div className="small muted" style={{marginTop:12}}>{t('Name')} {editLang.toUpperCase()}</div>
        <input className="field" value={tr.name||''} onChange={e=>setTr(editLang,'name',e.target.value)} placeholder={generatedName(selected,editLang)}/>
        <div className="small muted" style={{marginTop:10}}>{t('Description')} {editLang.toUpperCase()}</div>
        <textarea className="field" rows="4" value={tr.description||''} onChange={e=>setTr(editLang,'description',e.target.value)} placeholder={t('Short technique description (optional)')}/>
        <div className="small muted" style={{marginTop:10}}>{t('Instructions')} {editLang.toUpperCase()} · {t('one step per line')}</div>
        <textarea className="field" rows="9" value={tr.instructions||''} onChange={e=>setTr(editLang,'instructions',e.target.value)} placeholder={cleanLines(selected.st)}/>
        <div className="small dim" style={{marginTop:7}}>{t('UA/RU use the existing localized VARANGYM steps; EN uses the ExerciseDB source. Admin edits take priority.')}</div>
      </div>

      <div className="card">
        <div className="lbl2">{t('Classification')}</div>
        <div style={{display:'grid',gap:9,marginTop:10}}>
          <input className="field" value={draft.bodyPart} onChange={e=>setDraft(d=>({...d,bodyPart:e.target.value}))} placeholder={t('Body part')}/>
          <input className="field" value={draft.equipment} onChange={e=>setDraft(d=>({...d,equipment:e.target.value}))} placeholder={t('Equipment')}/>
          <input className="field" value={draft.primaryMuscle} onChange={e=>setDraft(d=>({...d,primaryMuscle:e.target.value}))} placeholder={t('Primary muscle')}/>
          <select className="field" value={draft.gender} onChange={e=>setDraft(d=>({...d,gender:e.target.value}))}>
            <option value="unisex">{t('Unisex')}</option><option value="male">{t('Male variant')}</option><option value="female">{t('Female variant')}</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="row between"><div><div className="lbl2">{t('Media')}</div><div className="ss">{t('Separate GIF/images can be set for male and female profiles. The general URL is the fallback.')}</div></div><Segmented value={previewBody} onChange={setPreviewBody} options={[{value:'male',label:'♂'},{value:'female',label:'♀'}]}/></div>
        <div style={{margin:'12px 0',borderRadius:14,overflow:'hidden',background:'var(--surface-2)',minHeight:160,display:'grid',placeItems:'center'}}>
          {gifPreview?<img key={`${previewBody}:${gifPreview}`} src={gifPreview} alt="GIF preview" style={{display:'block',width:'100%',maxHeight:320,objectFit:'contain'}} onError={e=>{e.currentTarget.style.display='none'}}/>:imgPreview?<img key={`${previewBody}:${imgPreview}`} src={imgPreview} alt="Preview" style={{display:'block',width:'100%',maxHeight:320,objectFit:'contain'}} onError={e=>{e.currentTarget.style.display='none'}}/>:<span className="small dim">{t('No media')}</span>}
        </div>
        <div className="small dim" style={{marginBottom:10}}>{t('Preview')} · {previewBody==='female'?t('Female'):t('Male')} · {currentGif||currentImg?t('admin override'):t('catalogue source media')}</div>
        <div style={{display:'grid',gap:9}}>
          <input className="field" value={draft.gifMale} onChange={e=>setDraft(d=>({...d,gifMale:e.target.value}))} placeholder={`GIF · ${t('Male')}`}/>
          <input className="field" value={draft.gifFemale} onChange={e=>setDraft(d=>({...d,gifFemale:e.target.value}))} placeholder={`GIF · ${t('Female')}`}/>
          <input className="field" value={draft.gif} onChange={e=>setDraft(d=>({...d,gif:e.target.value}))} placeholder={`GIF · ${t('General')}`}/>
          <input className="field" value={draft.imageMale} onChange={e=>setDraft(d=>({...d,imageMale:e.target.value}))} placeholder={`${t('Image')} · ${t('Male')}`}/>
          <input className="field" value={draft.imageFemale} onChange={e=>setDraft(d=>({...d,imageFemale:e.target.value}))} placeholder={`${t('Image')} · ${t('Female')}`}/>
          <input className="field" value={draft.image} onChange={e=>setDraft(d=>({...d,image:e.target.value}))} placeholder={`${t('Image')} · ${t('General')}`}/>
        </div>
      </div>

      <Button variant="primary" disabled={busy} onClick={save}>{busy?t('Saving…'):t('Save exercise')}</Button>
    </>
  }

  return <>
    <div className="card" style={{padding:8}}><Segmented value={tab} onChange={setTab} options={[{value:'library',label:t('Exercises')},{value:'plans',label:t('Plans')}]}/></div>
    <div className="card">
      <div className="lbl2">{t('Full library')} · {CATALOGUE.length} {t('exercises')}</div>
      <div className="ss">{t('All exercises from the main VARANGYM catalogue. UA/RU can use curated gym aliases; admin overrides always take priority.')}</div>
      <div className="grid2" style={{marginTop:12}}>
        <div className="stat"><div className="n">{coverage.manual}</div><div className="l">{t('manual names')}</div></div>
        <div className="stat"><div className="n">{coverage.curated}</div><div className="l">{t('gym names')}</div></div>
        <div className="stat"><div className="n">{locale==='en'?coverage.source:coverage.auto}</div><div className="l">{locale==='en'?t('English originals'):t('automatic names')}</div></div>
        <div className="stat"><div className="n">{coverage.hidden}</div><div className="l">{t('hidden')}</div></div>
      </div>
      <input className="field" style={{marginTop:12}} placeholder={t('Search name, muscle, equipment…')} value={q} onChange={e=>{setQ(e.target.value);setShown(100)}}/>
      <div style={{marginTop:9}}><Segmented value={locale} onChange={v=>{setLocale(v);setQuality('all');setShown(100)}} options={[{value:'uk',label:'UA'},{value:'ru',label:'RU'},{value:'en',label:'EN'}]}/></div>
      {(locale==='uk'||locale==='ru')&&<div style={{marginTop:9}}><Segmented value={quality} onChange={v=>{setQuality(v);setShown(100)}} options={[{value:'all',label:t('All')},{value:'manual',label:t('Manual')},{value:'curated',label:'Gym'},{value:'auto',label:t('Auto')}]}/></div>}
      <div style={{marginTop:9}}><Segmented value={body} onChange={v=>{setBody(v);setShown(100)}} options={[{value:'all',label:t('All')},{value:'male',label:t('Male')},{value:'female',label:t('Female')}]}/></div>
      <div className="grid2" style={{marginTop:9}}>
        <select className="field" value={part} onChange={e=>{setPart(e.target.value);setShown(100)}}><option value="">{t('All body parts')}</option>{bodyParts.map(x=><option key={x}>{x}</option>)}</select>
        <select className="field" value={equipment} onChange={e=>{setEquipment(e.target.value);setShown(100)}}><option value="">{t('All equipment')}</option>{equipments.map(x=><option key={x}>{x}</option>)}</select>
      </div>
      <select className="field" style={{marginTop:9}} value={muscle} onChange={e=>{setMuscle(e.target.value);setShown(100)}}><option value="">{t('All muscles')}</option>{muscles.map(x=><option key={x}>{x}</option>)}</select>
    </div>
    <Section title={`${t('Exercises')} · ${rows.length} / ${CATALOGUE.length}`}>
      {rows.slice(0,shown).map(ex=>{
        const o=overrides.get(ex.id)
        const title=adminEdited(o)&&o?.translations?.[locale]?.name?o.translations[locale].name:generatedName(ex,locale)
        const g=o?.metadata?.gender||genderOf(ex)
        const ql=qualityOf(ex,o,locale)
        return <Row key={ex.id} title={title} subtitle={`${ex.bp||'—'} · ${ex.eq||'—'} · ${ex.tg||'—'} · ${g} · ${qualityLabel(ql)}${o?.active===false?` · ${t('hidden')}`:''}`} accessory="chevron" onClick={()=>openExercise(ex)}>
          <span style={{marginRight:10}}><Thumb ex={ex}/></span>
        </Row>
      })}
      {!rows.length&&<Row title={t('Nothing found')}/>} 
    </Section>
    {rows.length>shown&&<Button onClick={()=>setShown(v=>v+100)}>{t('Show more')} · {rows.length-shown}</Button>}
  </>
}