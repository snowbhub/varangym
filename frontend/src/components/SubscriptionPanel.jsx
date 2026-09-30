import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { businessMemberships, loadPlatformIdentity, trainerMemberships } from '../lib/platform-role.js'
import { useUI } from '../store/useUI.js'
import { Button, Row, Section } from './ui.jsx'

const money=(cents,currency='USD')=>new Intl.NumberFormat('uk-UA',{style:'currency',currency,maximumFractionDigits:2}).format(Number(cents||0)/100)
const date=v=>{if(!v)return'—';try{return new Date(v).toLocaleDateString('uk-UA')}catch{return'—'}}

export default function SubscriptionPanel(){
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
  const current=subs.find(x=>['active','trialing'].includes(x.status))||subs[0]||null
  const currentWorkspaceId=current?.subject_type==='workspace'?current.subject_id:null
  const audience=current?.plan_code?.startsWith('business_')?'organization':current?.plan_code?.startsWith('coach_')?'trainer':'solo'
  const eligiblePlans=plans.filter(p=>p.audience===audience)
  const billingSub=current?.subject_type==='workspace'
    ? (billing?.workspaceSubscriptions||[]).find(x=>x.workspace_id===current.subject_id&&x.plan_code===current.plan_code)||(billing?.workspaceSubscriptions||[]).find(x=>x.workspace_id===current.subject_id)
    : (billing?.userSubscriptions||[]).find(x=>x.plan_code===current?.plan_code)||billing?.userSubscriptions?.[0]

  const checkout=async plan=>{
    setBusy(plan.code)
    try{
      const body={planCode:plan.code}
      if(plan.audience!=='solo'){
        const workspaceId=currentWorkspaceId||(plan.audience==='organization'?businesses[0]?.workspace_id:trainers[0]?.workspace_id)
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

  return <Section title="Підписка">
    {current?<>
      <Row icon="key" iconTint="var(--acc)" title={current.plan_metadata?.label||current.plan_code||'VARANGYM'} subtitle={`${current.status}${current.status==='trialing'?` · trial до ${date(current.trial_ends_at)}`:current.current_period_end?` · до ${date(current.current_period_end)}`:''}`} value={billingSub?.cancel_at_period_end?'скасується':'активна'}/>
      {current.status==='trialing'&&<Row icon="info" iconTint="var(--orange)" title="30-денний пробний період" subtitle="До завершення trial можна перейти на платний тариф. Без оформленої оплати автоматичне списання не запускається."/>}
      {billingSub?.status==='active'&&<Row icon="info" title="Керування підпискою" subtitle={billingSub.cancel_at_period_end?`Доступ лишиться до ${date(billingSub.current_period_end)}.`:'Скасування не видаляє дані акаунта.'}><Button size="sm" disabled={!!busy} onClick={()=>changeCancel(!!billingSub.cancel_at_period_end)}>{busy?'…':billingSub.cancel_at_period_end?'Продовжити':'Скасувати'}</Button></Row>}
      {billingSub?.status==='trialing'&&<Row icon="info" title="Завершити trial" subtitle="Дані залишаться; платну підписку можна оформити пізніше."><Button size="sm" disabled={!!busy} onClick={()=>changeCancel(false)}>{busy?'…':'Завершити'}</Button></Row>}
    </>:<Row icon="key" title="Підписка не знайдена" subtitle="Для щойно створеного акаунта дані можуть зʼявитися після синхронізації."/>}
    {eligiblePlans.map(p=><Row key={p.code} icon="creditCard" iconTint={p.code===current?.plan_code?'var(--acc)':'var(--grey)'} title={p.metadata?.label||p.code} subtitle={`${p.billing_kind==='recurring'?'щомісячно':'назавжди'} · ${money(p.price_cents,p.currency)}`}>
      {p.code!==current?.plan_code&&<Button size="sm" disabled={!!busy} onClick={()=>checkout(p)}>{busy===p.code?'…':'Обрати'}</Button>}
    </Row>)}
  </Section>
}
