import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { dateLocale, useLang } from '../lib/i18n.js'
import { productText as p } from '../lib/product-copy.js'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

const FAMILY=['solo','trainer','organization']
const COPY={
  solo:{name:'Solo',audience:'soloAudience',pitch:'soloPitch',features:['soloF1','soloF2','soloF3','soloF4']},
  trainer:{name:'Coach',audience:'coachAudience',pitch:'coachPitch',features:['coachF1','coachF2','coachF3','coachF4']},
  organization:{name:'Business',audience:'businessAudience',pitch:'businessPitch',features:['businessF1','businessF2','businessF3','businessF4']},
}
const LABELS={solo_monthly:'monthlyName',solo_lifetime:'lifetimeName',coach_5:'starterName',coach_10:'proName',coach_20:'scaleName',business_5_50:'studioName',business_10_100:'clubName'}
const RECOMMENDED=new Set(['solo_monthly','coach_10','business_5_50'])

const money=(cents,currency='USD')=>new Intl.NumberFormat(dateLocale(),{style:'currency',currency,maximumFractionDigits:2}).format(Number(cents||0)/100)
const price=plan=>plan.billing_kind==='lifetime'?`${money(plan.price_cents,plan.currency)} · ${p('oneTime')}`:`${money(plan.price_cents,plan.currency)} / ${p('monthly')}`
const capacity=plan=>{
  if(plan.audience==='trainer')return `${plan.client_limit||0} ${p('clients')}`
  if(plan.audience==='organization')return `${plan.trainer_limit||0} ${p('trainers')} · ${plan.client_limit||0} ${p('clients')}`
  return `1 ${p('profile')}`
}
const initialPlan=(rows,currentCodes)=>rows.find(x=>currentCodes.has(x.code))||rows.find(x=>RECOMMENDED.has(x.code))||rows[0]||null

export default function PlanPicker({close,plans:providedPlans=null,paymentsConfigured:providedConfigured=null,currentCodes:newCurrentCodes=null,onChoose=null,onTrial=null,publicMode=false,busy=''}){
  useLang()
  const railRef=useRef(null)
  const [plans,setPlans]=useState(providedPlans||[])
  const [paymentsConfigured,setPaymentsConfigured]=useState(providedConfigured??false)
  const [family,setFamily]=useState('solo')
  const [selected,setSelected]=useState({})
  useEffect(()=>{
    if(providedPlans){setPlans(providedPlans);setPaymentsConfigured(!!providedConfigured);return}
    api('/api/billing/plans').then(d=>{setPlans(d.plans||[]);setPaymentsConfigured(!!d.paymentsConfigured)}).catch(()=>{})
  },[providedPlans,providedConfigured])
  const currentCodes=useMemo(()=>newCurrentCodes instanceof Set?newCurrentCodes:new Set(newCurrentCodes||[]),[newCurrentCodes])
  const grouped=useMemo(()=>Object.fromEntries(FAMILY.map(a=>[a,plans.filter(x=>x.audience===a)])),[plans])
  const activeFor=a=>{
    const rows=grouped[a]||[]
    return rows.find(x=>x.code===selected[a])||initialPlan(rows,currentCodes)
  }
  const chooseFamily=a=>{
    setFamily(a)
    const i=FAMILY.indexOf(a),el=railRef.current
    if(el&&i>=0)el.scrollTo({left:el.clientWidth*i,behavior:'smooth'})
  }
  const onFamilyScroll=e=>{
    const el=e.currentTarget
    if(!el.clientWidth)return
    const i=Math.max(0,Math.min(FAMILY.length-1,Math.round(el.scrollLeft/el.clientWidth)))
    const next=FAMILY[i]
    if(next!==family)setFamily(next)
  }
  const act=(a,plan)=>{
    if(!plan)return
    if(publicMode){onTrial?.(a,plan);return}
    if(currentCodes.has(plan.code)||!paymentsConfigured)return
    onChoose?.(plan)
  }

  return <div className="vg-plan-picker">
    <div className="vg-picker-head">
      <div><div className="vg-plan-kicker">VARANGYM</div><h2>{p('pickPlanTitle')}</h2><p>{p('pickPlanSub')}</p></div>
      {close&&<button className="iconbtn" onClick={close} aria-label={p('close')}><Icon name="x"/></button>}
    </div>
    <div className="vg-plan-tabs" role="tablist">
      {FAMILY.map(a=><button key={a} className={family===a?'active':''} onClick={()=>chooseFamily(a)} role="tab" aria-selected={family===a}>{COPY[a].name}</button>)}
    </div>
    <div className="vg-plan-family-rail" ref={railRef} onScroll={onFamilyScroll}>
      {FAMILY.map(a=>{
        const rows=grouped[a]||[],copy=COPY[a],active=activeFor(a)
        return <section className="vg-family-card" key={a} aria-label={copy.name}>
          <div className="vg-family-title"><div><span>{p(copy.audience)}</span><strong>VARANGYM {copy.name}</strong></div>{active&&RECOMMENDED.has(active.code)&&<em>{p('popular')}</em>}</div>
          <p className="vg-family-pitch">{p(copy.pitch)}</p>
          <div className="vg-family-features">{copy.features.map(k=><div key={k}><Icon name="check"/><span>{p(k)}</span></div>)}</div>
          <div className="vg-variant-rail" role="listbox" aria-label={p('allPlans')}>
            {rows.map(plan=>{
              const picked=active?.code===plan.code,current=currentCodes.has(plan.code)
              return <button key={plan.code} className={`vg-variant ${picked?'selected':''}`} onClick={()=>setSelected(s=>({...s,[a]:plan.code}))} role="option" aria-selected={picked}>
                <span>{p(LABELS[plan.code]||'selectPlan')}{current?` · ${p('connected')}`:''}</span>
                <b>{price(plan)}</b>
                <small>{capacity(plan)}</small>
              </button>
            })}
          </div>
          {active&&<div className="vg-picker-summary">
            <div><span>{p('price')}</span><strong>{price(active)}</strong></div>
            <div><span>{p('capacity')}</span><strong>{capacity(active)}</strong></div>
          </div>}
          <Button variant="primary" disabled={!active||!!busy||(!publicMode&&(!paymentsConfigured||currentCodes.has(active?.code)))} onClick={()=>act(a,active)}>
            {!active?'—':busy===active.code?'…':currentCodes.has(active.code)?p('connected'):publicMode?p('startTrial'):paymentsConfigured?p('selectPlan'):p('paymentSoon')}
          </Button>
        </section>
      })}
    </div>
  </div>
}
