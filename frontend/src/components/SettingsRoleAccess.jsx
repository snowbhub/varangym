import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { businessMemberships, loadPlatformIdentity, platformAccess, trainerMemberships } from '../lib/platform-role.js'
import { roleRoute, setRoleMode } from '../lib/role-mode.js'
import { useUI } from '../store/useUI.js'
import Icon from './Icon.jsx'
import { Button, Row, Section } from './ui.jsx'

const money=(cents,currency='USD')=>new Intl.NumberFormat('uk-UA',{style:'currency',currency,maximumFractionDigits:2}).format(Number(cents||0)/100)
const date=v=>{if(!v)return'—';try{return new Date(v).toLocaleDateString('uk-UA')}catch{return'—'}}

export default function SettingsRoleAccess(){
  const nav=useNavigate()
  const toast=useUI(s=>s.toast)
  const [identity,setIdentity]=useState(null)
  const [status,setStatus]=useState(null)
  const [plans,setPlans]=useState([])
  const [busy,setBusy]=useState('')

  useEffect(()=>{
    let live=true
    Promise.allSettled([loadPlatformIdentity(),api('/api/trial/status'),api('/api/billing/plans')]).then(([me,st,pl])=>{
      if(!live)return
      if(me.status==='fulfilled')setIdentity(me.value)
      if(st.status==='fulfilled')setStatus(st.value)
      if(pl.status==='fulfilled')setPlans(pl.value.plans||[])
    })
    return()=>{live=false}
  },[])

  const access=useMemo(()=>platformAccess(identity),[identity])
  const trainers=useMemo(()=>trainerMemberships(identity),[identity])
  const businesses=useMemo(()=>businessMemberships(identity),[identity])
  const subs=status?.subscriptions||[]
  const current=subs.find(x=>['active','trialing'].includes(x.status))||subs[0]||null
  const currentWorkspaceId=current?.subject_type==='workspace'?current.subject_id:null
  const audience=current?.plan_code?.startsWith('business_')?'organization':current?.plan_code?.startsWith('coach_')?'trainer':'solo'
  const eligiblePlans=plans.filter(p=>p.audience===audience)

  const enter=mode=>{setRoleMode(mode);nav(roleRoute(mode,'home'))}
  const checkout=async plan=>{
    setBusy(plan.code)
    try{
      const body={planCode:plan.code}
      if(plan.audience!=='solo'){
        const workspaceId=currentWorkspaceId || (plan.audience==='organization'?businesses[0]?.workspace_id:trainers[0]?.workspace_id)
        if(!workspaceId)throw new Error('Для цього тарифу потрібен workspace')
        body.workspaceId=workspaceId
      }
      const d=await api('/api/billing/checkout',{method:'POST',body:JSON.stringify(body)})
      if(d.url)location.href=d.url
    }catch(e){toast(e.message||'Не вдалося відкрити оплату')}
    finally{setBusy('')}
  }

  return <div className="narrow" style={{paddingTop:0}}>
    {access.canManage&&<Section title="Режими керування" footer="Звичайний VARANGYM залишається основним режимом. Тут відкривається окремий робочий інтерфейс для твоєї ролі.">
      {access.platformAdmin&&<Row icon="wrench" iconTint="var(--acc)" title="Адмін-режим" subtitle="Уся платформа, фінанси, користувачі, вправи та workspaces" accessory="chevron" onClick={()=>enter('admin')}/>} 
      {access.business&&<Row icon="personCircle" iconTint="var(--indigo)" title="Бізнес-режим" subtitle="Тренери, клієнти, план, аналітика та підписка організації" accessory="chevron" onClick={()=>enter('business')}/>} 
      {access.trainer&&<Row icon="chartLine" iconTint="var(--blue)" title="Режим тренера" subtitle="Клієнти, програми, прогрес і коди привʼязки" accessory="chevron" onClick={()=>enter('trainer')}/>} 
    </Section>}

    <Section title="Підписка">
      {current?<>
        <Row icon="creditCard" iconTint="var(--acc)" title={current.plan_metadata?.label||current.plan_code||'VARANGYM'} subtitle={`${current.status}${current.status==='trialing'?` · пробний період до ${date(current.trial_ends_at)}`:current.current_period_end?` · до ${date(current.current_period_end)}`:''}`} value={current.cancel_at_period_end?'скасується':'активна'}/>
        {current.status==='trialing'&&<Row icon="info" iconTint="var(--orange)" title="30-денний пробний період" subtitle="До завершення trial можна обрати платний тариф. Автоматичне списання без оформленої оплати не запускається."/>}
      </>:<Row icon="creditCard" title="Підписка не знайдена" subtitle="Якщо акаунт щойно створений, онови сторінку."/>}
      {eligiblePlans.map(p=><Row key={p.code} icon="creditCard" iconTint={p.code===current?.plan_code?'var(--acc)':'var(--grey)'} title={p.metadata?.label||p.code} subtitle={`${p.billing_kind==='recurring'?'щомісячно':'назавжди'} · ${money(p.price_cents,p.currency)}`}>
        {p.code!==current?.plan_code&&<Button size="sm" disabled={!!busy} onClick={()=>checkout(p)}>{busy===p.code?'…':'Обрати'}</Button>}
      </Row>)}
    </Section>
  </div>
}
