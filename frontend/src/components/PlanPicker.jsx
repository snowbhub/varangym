import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { dateLocale, useLang } from '../lib/i18n.js'
import { productText as p } from '../lib/product-copy.js'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

const FAMILY=['solo','trainer','organization']
const COPY={
  solo:{name:'VARANGYM Solo',audience:'soloAudience',pitch:'soloPitch',features:['soloF1','soloF2','soloF3']},
  trainer:{name:'VARANGYM Coach',audience:'coachAudience',pitch:'coachPitch',features:['coachF1','coachF2','coachF3']},
  organization:{name:'VARANGYM Business',audience:'businessAudience',pitch:'businessPitch',features:['businessF1','businessF2','businessF3']},
}
const LABELS={solo_monthly:'Monthly',solo_lifetime:'Lifetime',coach_5:'Starter',coach_10:'Pro',coach_20:'Scale',business_5_50:'Studio',business_10_100:'Club'}
const RECOMMENDED=new Set(['solo_monthly','coach_10','business_5_50'])

const money=(cents,currency='USD')=>new Intl.NumberFormat(dateLocale(),{style:'currency',currency,maximumFractionDigits:2}).format(Number(cents||0)/100)
const price=plan=>plan.billing_kind==='lifetime'?money(plan.price_cents,plan.currency):`${money(plan.price_cents,plan.currency)} / ${p('monthly')}`
const capacity=plan=>plan.audience==='trainer'?`${plan.client_limit||0} clients`:plan.audience==='organization'?`${plan.trainer_limit||0} trainers · ${plan.client_limit||0} clients`:plan.billing_kind==='lifetime'?p('oneTime'):p('monthly')

export default function PlanPicker({close,plans:providedPlans=null,paymentsConfigured:providedConfigured=null,currentCodes:newCurrentCodes=null,onChoose=null,onTrial=null,publicMode=false,busy=''}){
  useLang()
  const [plans,setPlans]=useState(providedPlans||[])
  const [paymentsConfigured,setPaymentsConfigured]=useState(providedConfigured??false)
  const [family,setFamily]=useState('solo')
  const [selected,setSelected]=useState('')
  useEffect(()=>{
    if(providedPlans){setPlans(providedPlans);setPaymentsConfigured(!!providedConfigured);return}
    api('/api/billing/plans').then(d=>{setPlans(d.plans||[]);setPaymentsConfigured(!!d.paymentsConfigured)}).catch(()=>{})
  },[providedPlans,providedConfigured])
  const currentCodes=useMemo(()=>newCurrentCodes instanceof Set?newCurrentCodes:new Set(newCurrentCodes||[]),[newCurrentCodes])
  const rows=useMemo(()=>plans.filter(x=>x.audience===family),[plans,family])
  const active=rows.find(x=>x.code===selected)||rows.find(x=>currentCodes.has(x.code))||rows.find(x=>RECOMMENDED.has(x.code))||rows[0]||null
  useEffect(()=>{if(active&&!selected)setSelected(active.code)},[family,rows.length])
  const copy=COPY[family]
  const doChoose=()=>{
    if(!active)return
    if(publicMode){onTrial?.(family,active);return}
    if(!paymentsConfigured||currentCodes.has(active.code))return
    onChoose?.(active)
  }
  return <div className="vg-plan-picker">
    <div className="vg-picker-head">
      <div><div className="vg-plan-kicker">VARANGYM</div><h2>{p('pickPlanTitle')}</h2><p>{p('pickPlanSub')}</p></div>
      {close&&<button className="iconbtn" onClick={close} aria-label={p('close')}><Icon name="x"/></button>}
    </div>
    <div className="vg-plan-tabs" role="tablist">
      {FAMILY.map(a=><button key={a} className={family===a?'active':''} onClick={()=>{setFamily(a);setSelected('')}}>{COPY[a].name.replace('VARANGYM ','')}</button>)}
    </div>
    <div className="vg-family-card">
      <div className="vg-family-title"><div><span>{p(copy.audience)}</span><strong>{copy.name}</strong></div>{active&&RECOMMENDED.has(active.code)&&<em>{p('popular')}</em>}</div>
      <p className="vg-family-pitch">{p(copy.pitch)}</p>
      <div className="vg-family-features">{copy.features.map(k=><div key={k}><Icon name="check"/><span>{p(k)}</span></div>)}</div>
      <div className="vg-variant-rail" role="listbox" aria-label={p('allPlans')}>
        {rows.map(plan=><button key={plan.code} className={`vg-variant ${active?.code===plan.code?'selected':''}`} onClick={()=>setSelected(plan.code)}>
          <span>{LABELS[plan.code]||plan.metadata?.label||plan.code}</span>
          <b>{price(plan)}</b>
          <small>{capacity(plan)}</small>
        </button>)}
      </div>
      {active&&<div className="vg-picker-summary">
        <div><span>{p('price')}</span><strong>{price(active)}</strong></div>
        <div><span>{p('capacity')}</span><strong>{capacity(active)}</strong></div>
      </div>}
      <Button variant="primary" disabled={!active||!!busy||(!publicMode&&(!paymentsConfigured||currentCodes.has(active?.code)))} onClick={doChoose}>
        {!active?'—':busy===active.code?'…':currentCodes.has(active.code)?p('connected'):publicMode?p('startTrial'):paymentsConfigured?p('selectPlan'):p('paymentSoon')}
      </Button>
      {!publicMode&&!paymentsConfigured&&<div className="vg-picker-note">{p('paymentSoon')}</div>}
    </div>
  </div>
}
