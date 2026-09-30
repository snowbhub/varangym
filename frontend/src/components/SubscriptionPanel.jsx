import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { businessMemberships, loadPlatformIdentity, trainerMemberships } from '../lib/platform-role.js'
import { useUI } from '../store/useUI.js'
import { Button, Row, Section } from './ui.jsx'

const money=(cents,currency='USD')=>new Intl.NumberFormat('uk-UA',{style:'currency',currency,maximumFractionDigits:2}).format(Number(cents||0)/100)
const date=v=>{if(!v)return'—';try{return new Date(v).toLocaleDateString('uk-UA')}catch{return'—'}}
const audienceForMode=mode=>mode==='business'?'organization':mode==='trainer'?'trainer':mode==='admin'?'all':'solo'
const audienceOfSub=s=>s?.plan_code?.startsWith('business_')?'organization':s?.plan_code?.startsWith('coach_')?'trainer':'solo'

export default function SubscriptionPanel({mode=null}){
  const toast=useUI(s=>s.toast)
  const [identity,setIdentity]=useState(null)
  const [status,setStatus]=useState(null)
  const [billing,setBilling]=useState(null)
  const [plans,setPlans]=useState([])
  const [busy,setBusy]=useState('')

  const load=()=>Promise.allSettled([loadPlatformIdentity(),api('/api/trial/status'),api('/api/billing/plans'),api('/api/billing/me')]).then(([me,st,pl,bi])=>{
    if(me.status==='fulfilled')setIdentity(me.value)
    if(st.status==='fulfilled')setStatus(st.value)
    if(pl.status==='fulfilled')setPlans(pl.value.plans||[])
    if(bi.status==='fulfilled')setBilling(bi.value)
  })
  useEffect(()=>{load().catch(()=>{})},[])

  const trainers=useMemo(()=>trainerMemberships(identity),[identity])
  const businesses=useMemo(()=>businessMemberships(identity),[identity])
  const subs=status?.subscriptions||[]
  const wantedAudience=audienceForMode(mode)
  const relevant=subs.filter(x=>wantedAudience==='all'||audienceOfSub(x)===wantedAudience)
  const current=relevant.find(x=>['active','trialing'].includes(x.status))||relevant[0]||subs.find(x=>['active','trialing'].includes(x.status))||subs[0]||null
  const currentWorkspaceId=current?.subject_type==='workspace'?current.subject_id:null
  const audience=wantedAudience==='all'?(current?audienceOfSub(current):'solo'):wantedAudience
  const eligiblePlans=plans.filter(p=>audience==='all'||p.audience===audience)
  const billingSub=current?.subject_type==='workspace'
    ? (billing?.workspaceSubscriptions||[]).find(x=>x.workspace_id===current.subject_id&&x.plan_code===current.plan_code)||(billing?.workspaceSubscriptions||[]).find(x=>x.workspace_id===current.subject_id)
    : (billing?.userSubscriptions||[]).find(x=>x.plan_code===current?.plan_code)||billing?.userSubscriptions?.[0]

  const checkout=async plan=>{
    setBusy(plan.code)
    try{
      const body={planCode:plan.code}
      if(plan.audience!=='solo'){
        const workspaceId=(current?.subject_type==='workspace'&&audienceOfSub(current)===plan.audience?currentWorkspaceId:null)||(plan.audience==='organization'?businesses[0]?.workspace_id:trainers[0]?.workspace_id)
        if(!workspaceId)throw new Error('Для цього тарифу потрібен workspace')
        body.workspaceId=workspaceId
      }
      const d=await api('/api/billing/checkout',{method:'POST',body:JSON.stringify(body)})
      if(d.url)location.href=d.url
    }catch(e){toast(e.message||'Не вдалося відкрити оплату')}
    finally{setBusy('')}
  }
  const changeCancel=async resume=>{
    if(!billingSub?.id)return toast('Підписку ще не синхронізовано')
    setBusy(resume?'resume':'cancel')
    try{
      await api(`/api/subscription/${resume?'resume':'cancel'}`,{method:'POST',body:JSON.stringify({subscriptionId:billingSub.id})})
      toast(resume?'Скасування підписки відмінено':'Підписку буде завершено згідно з її умовами')
      await load()
    }catch(e){toast(e.message||'Не вдалося змінити підписку')}
    finally{setBusy('')}
  }

  return <Section title={mode==='admin'?'Підписки й тарифи':'Підписка'}>
    {current?<>
      <Row icon="key" iconTint="var(--acc)" title={current.plan_metadata?.label||current.plan_code||'VARANGYM'} subtitle={`${current.status}${current.status==='trialing'?` · trial до ${date(current.trial_ends_at)}`:current.current_period_end?` · до ${date(current.current_period_end)}`:''}`} value={billingSub?.cancel_at_period_end?'скасується':'активна'}/>
      {current.status==='trialing'&&<Row icon="info" iconTint="var(--orange)" title="30-денний пробний період" subtitle="До завершення trial можна перейти на платний тариф. Без оформленої оплати автоматичне списання не запускається."/>}
      {billingSub?.status==='active'&&<Row icon="info" title="Керування підпискою" subtitle={billingSub.cancel_at_period_end?`Доступ лишиться до ${date(billingSub.current_period_end)}.`:'Скасування не видаляє дані акаунта.'}><Button size="sm" disabled={!!busy} onClick={()=>changeCancel(!!billingSub.cancel_at_period_end)}>{busy?'…':billingSub.cancel_at_period_end?'Продовжити':'Скасувати'}</Button></Row>}
      {billingSub?.status==='trialing'&&<Row icon="info" title="Завершити trial" subtitle="Дані залишаться; платну підписку можна оформити пізніше."><Button size="sm" disabled={!!busy} onClick={()=>changeCancel(false)}>{busy?'…':'Завершити'}</Button></Row>}
    </>:<Row icon="key" title="Активної підписки для цього режиму немає" subtitle="Нижче можна вибрати відповідний тариф."/>}
    {eligiblePlans.map(p=><Row key={p.code} icon="creditCard" iconTint={p.code===current?.plan_code?'var(--acc)':'var(--grey)'} title={p.metadata?.label||p.code} subtitle={`${p.billing_kind==='recurring'?'щомісячно':'назавжди'} · ${money(p.price_cents,p.currency)}${p.trainer_limit!=null?` · ${p.trainer_limit} трен.`:''}${p.client_limit!=null?` · ${p.client_limit} клієнт.`:''}`}>
      {p.code!==current?.plan_code&&<Button size="sm" disabled={!!busy} onClick={()=>checkout(p)}>{busy===p.code?'…':'Обрати'}</Button>}
    </Row>)}
  </Section>
}
