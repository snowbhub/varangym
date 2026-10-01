import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { dateLocale, useLang } from '../lib/i18n.js'
import { productText as p } from '../lib/product-copy.js'
import { businessMemberships, loadPlatformIdentity, trainerMemberships } from '../lib/platform-role.js'
import { useUI } from '../store/useUI.js'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import PlanPicker from './PlanPicker.jsx'

const active=s=>['active','trialing'].includes(String(s?.status||''))
const RANK={organization:3,trainer:2,solo:1}
const FRIENDLY={solo_monthly:'VARANGYM Solo Monthly',solo_lifetime:'VARANGYM Solo Lifetime',coach_5:'VARANGYM Coach Starter',coach_10:'VARANGYM Coach Pro',coach_20:'VARANGYM Coach Scale',business_5_50:'VARANGYM Business Studio',business_10_100:'VARANGYM Business Club'}
const money=(cents,currency='USD')=>new Intl.NumberFormat(dateLocale(),{style:'currency',currency,maximumFractionDigits:2}).format(Number(cents||0)/100)
const date=v=>{if(!v)return'—';try{return new Date(v).toLocaleDateString(dateLocale())}catch{return'—'}}
const planByCode=(plans,code)=>plans.find(x=>x.code===code)||null
const audienceOf=(plans,sub)=>planByCode(plans,sub?.plan_code)?.audience||sub?.plan_metadata?.audience||'solo'
const familyCopy=a=>a==='trainer'?['VARANGYM Coach',['coachF1','coachF2','coachF3','coachF4']]:a==='organization'?['VARANGYM Business',['businessF1','businessF2','businessF3','businessF4']]:['VARANGYM Solo',['soloF1','soloF2','soloF3','soloF4']]
const capacity=plan=>{
  if(!plan)return'—'
  if(plan.audience==='trainer')return `${plan.client_limit||0} ${p('clients')}`
  if(plan.audience==='organization')return `${plan.trainer_limit||0} ${p('trainers')} · ${plan.client_limit||0} ${p('clients')}`
  return `1 ${p('profile')}`
}

export default function SubscriptionPanel(){
  useLang()
  const toast=useUI(s=>s.toast)
  const [identity,setIdentity]=useState(null),[status,setStatus]=useState(null),[plans,setPlans]=useState([]),[paymentsConfigured,setPaymentsConfigured]=useState(false),[busy,setBusy]=useState(''),[usage,setUsage]=useState(null)
  const load=()=>Promise.allSettled([loadPlatformIdentity(),api('/api/trial/status'),api('/api/billing/plans')]).then(([me,st,pl])=>{
    if(me.status==='fulfilled')setIdentity(me.value)
    if(st.status==='fulfilled')setStatus(st.value)
    if(pl.status==='fulfilled'){setPlans(pl.value.plans||[]);setPaymentsConfigured(!!pl.value.paymentsConfigured)}
  })
  useEffect(()=>{load().catch(()=>{})},[])
  const trainers=useMemo(()=>trainerMemberships(identity),[identity]),businesses=useMemo(()=>businessMemberships(identity),[identity])
  const subs=status?.subscriptions||[],activeSubs=subs.filter(active)
  const currentCodes=useMemo(()=>new Set(activeSubs.map(x=>x.plan_code).filter(Boolean)),[activeSubs])
  const primary=useMemo(()=>[...activeSubs].sort((a,b)=>RANK[audienceOf(plans,b)]-RANK[audienceOf(plans,a)])[0]||subs[0]||null,[activeSubs,subs,plans])
  const primaryPlan=planByCode(plans,primary?.plan_code)
  const audience=audienceOf(plans,primary),[familyName,featureKeys]=familyCopy(audience)
  const currentName=primaryPlan?(FRIENDLY[primaryPlan.code]||primaryPlan.metadata?.label||familyName):(primary?.plan_metadata?.label||p('noPlan'))
  const priceLabel=primaryPlan?(primaryPlan.billing_kind==='lifetime'?money(primaryPlan.price_cents,primaryPlan.currency):`${money(primaryPlan.price_cents,primaryPlan.currency)} / ${p('monthly')}`):'—'
  const billingType=primaryPlan?.billing_kind==='lifetime'?p('lifetimeBilling'):primaryPlan?p('monthlyBilling'):'—'
  const statusLabel=primary?.status==='trialing'?p('trial'):primary?.status==='active'?p('active'):p('inactive')
  const nextDate=primary?.status==='trialing'?primary?.trial_ends_at:primary?.current_period_end

  useEffect(()=>{
    setUsage(null)
    if(!identity||!primaryPlan)return
    const membership=audience==='organization'?businesses[0]:audience==='trainer'?(trainers.find(x=>x.workspace_type==='independent_trainer')||trainers[0]):null
    if(!membership?.workspace_id){if(audience==='solo')setUsage({solo:1});return}
    let dead=false
    api(`/api/insights/workspace?workspaceId=${encodeURIComponent(membership.workspace_id)}`).then(d=>{
      if(dead)return
      setUsage({clients:(d.clients||[]).length,trainers:(d.trainers||[]).length})
    }).catch(()=>{})
    return()=>{dead=true}
  },[identity,primaryPlan?.code,audience])

  const usageLabel=()=>{
    if(!primaryPlan)return'—'
    if(audience==='trainer')return usage?`${p('usedOf',usage.clients||0,primaryPlan.client_limit||0)} ${p('clients')}`:`— / ${primaryPlan.client_limit||0} ${p('clients')}`
    if(audience==='organization')return usage?`${p('usedOf',usage.trainers||0,primaryPlan.trainer_limit||0)} ${p('trainers')} · ${p('usedOf',usage.clients||0,primaryPlan.client_limit||0)} ${p('clients')}`:`${primaryPlan.trainer_limit||0} ${p('trainers')} · ${primaryPlan.client_limit||0} ${p('clients')}`
    return `1 / 1 ${p('profile')}`
  }

  const checkout=async plan=>{
    setBusy(plan.code)
    try{
      const body={planCode:plan.code}
      if(plan.audience==='trainer'){
        const workspaceId=trainers.find(x=>x.workspace_type==='independent_trainer')?.workspace_id||trainers.find(x=>x.workspace_type==='organization')?.workspace_id
        if(workspaceId)body.workspaceId=workspaceId
      }
      if(plan.audience==='organization'){
        const workspaceId=businesses[0]?.workspace_id
        if(workspaceId)body.workspaceId=workspaceId
      }
      const d=await api('/api/billing/checkout',{method:'POST',body:JSON.stringify(body)})
      if(d.url)location.href=d.url
    }catch(e){toast(e.message||p('paymentSoon'))}finally{setBusy('')}
  }
  const openPlans=()=>useUI.getState().openSheet(close=><PlanPicker close={close} plans={plans} paymentsConfigured={paymentsConfigured} currentCodes={currentCodes} busy={busy} onChoose={async plan=>{close();await checkout(plan)}}/>)

  return <div className="vg-subscription-manager">
    <section className="card vg-current-subscription">
      <div className="vg-plan-kicker">VARANGYM MEMBERSHIP</div>
      <div className="vg-current-head"><div><span>{p('currentPlan')}</span><h2>{currentName}</h2></div><span className={`vg-sub-status ${primary?.status||'none'}`}>{statusLabel}</span></div>
      <div className="vg-current-grid">
        <div><span>{p('price')}</span><strong>{priceLabel}</strong></div>
        <div><span>{p('billingType')}</span><strong>{billingType}</strong></div>
        <div><span>{primary?.status==='trialing'?p('trialEnds'):p('renews')}</span><strong>{nextDate?date(nextDate):'—'}</strong></div>
        <div><span>{p('billingStatus')}</span><strong>{primary?.cancel_at_period_end?p('cancelsAtEnd'):statusLabel}</strong></div>
        <div><span>{p('capacity')}</span><strong>{capacity(primaryPlan)}</strong></div>
        <div><span>{p('usage')}</span><strong>{usageLabel()}</strong></div>
      </div>
      <div className="vg-current-benefits"><h3>{p('benefits')}</h3>{featureKeys.map(k=><div key={k}><Icon name="check"/><span>{p(k)}</span></div>)}</div>
      {primary?.status==='trialing'&&<div className="vg-billing-note">{p('trialNote')}</div>}
      {!paymentsConfigured&&<div className="vg-billing-note">{p('paymentSoon')}</div>}
      <Button variant="primary" onClick={openPlans}>{p('changePlan')}</Button>
    </section>
  </div>
}
