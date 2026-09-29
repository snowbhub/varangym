import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { businessMemberships, loadPlatformIdentity, platformAccess, trainerMemberships } from '../lib/platform-role.js'
import { useUI } from '../store/useUI.js'
import { Button, Row, Section } from './ui.jsx'

const money = (cents, currency='USD') => new Intl.NumberFormat('uk-UA',{style:'currency',currency:String(currency||'USD').toUpperCase(),maximumFractionDigits:2}).format(Number(cents||0)/100)
const date = v => v ? new Date(v).toLocaleDateString('uk-UA') : '—'

function currentSubscription(billing, subjectType, subjectId) {
  const list = subjectType === 'user' ? (billing?.userSubscriptions || []) : (billing?.workspaceSubscriptions || []).filter(x => x.workspace_id === subjectId)
  return [...list].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))[0] || null
}

export default function AccountAccessSettings() {
  const nav = useNavigate()
  const toast = useUI(s=>s.toast)
  const [identity,setIdentity]=useState(null)
  const [billing,setBilling]=useState(null)
  const [plans,setPlans]=useState([])
  const [configured,setConfigured]=useState(false)
  const [busy,setBusy]=useState('')

  useEffect(()=>{
    let live=true
    Promise.allSettled([loadPlatformIdentity(),api('/api/billing/me'),api('/api/billing/plans')]).then(([me,b,p])=>{
      if(!live)return
      if(me.status==='fulfilled')setIdentity(me.value)
      if(b.status==='fulfilled')setBilling(b.value)
      if(p.status==='fulfilled'){setPlans(p.value.plans||[]);setConfigured(!!p.value.paymentsConfigured)}
    })
    return()=>{live=false}
  },[])

  const access=useMemo(()=>platformAccess(identity),[identity])
  const trainerSpaces=useMemo(()=>trainerMemberships(identity),[identity])
  const businessSpaces=useMemo(()=>businessMemberships(identity),[identity])
  if(!identity)return null

  const modes=[]
  if(access.platformAdmin)modes.push({mode:'admin',title:'Адмін-режим',subtitle:'Платформа, користувачі, фінанси, вправи та всі workspaces.'})
  if(access.business)modes.push({mode:'business',title:'Бізнес-режим',subtitle:'Команда, тренери, клієнти, аналітика та оплата.'})
  if(access.trainer)modes.push({mode:'trainer',title:'Режим тренера',subtitle:'Клієнти, плани, прогрес, коди та вправи.'})

  const direct=billing?.userBilling
  const directSub=currentSubscription(billing,'user',identity.user?.id)
  const managed=[...businessSpaces,...trainerSpaces].filter((x,i,a)=>a.findIndex(y=>y.workspace_id===x.workspace_id)===i)
  const subjects=[]
  if(direct?.plan_code||directSub)subjects.push({type:'user',id:identity.user?.id,name:'Особистий акаунт',plan:direct?.plan_code||directSub?.plan_code,sub:directSub})
  for(const m of managed){
    const settings=billing?.workspaceBilling?.find(x=>x.workspace_id===m.workspace_id)
    const sub=currentSubscription(billing,'workspace',m.workspace_id)
    if(settings?.plan_code||sub)subjects.push({type:'workspace',id:m.workspace_id,name:m.workspace_name||'Workspace',plan:settings?.plan_code||sub?.plan_code,sub})
  }

  const checkout=async(plan,subject)=>{
    if(!configured)return toast('Платіжний провайдер ще не підключений.')
    setBusy(`${subject.type}:${subject.id}:${plan.code}`)
    try{
      const payload={planCode:plan.code}
      if(plan.audience!=='solo')payload.workspaceId=subject.id
      const d=await api('/api/billing/checkout',{method:'POST',body:JSON.stringify(payload)})
      if(d.url)location.href=d.url
    }catch(e){toast(e.message||'Не вдалося відкрити оплату')}
    finally{setBusy('')}
  }

  return <div className="narrow" style={{paddingTop:0}}>
    {!!modes.length && <Section title="Режим керування" footer="Звичайний режим тренувань нікуди не зникає. Тут ти переходиш у окремий робочий режим з тим самим акаунтом.">
      {modes.map(x=><Row key={x.mode} icon="wrench" iconTint="var(--acc)" title={x.title} subtitle={x.subtitle} accessory="chevron" onClick={()=>nav(`/${x.mode}/dashboard`)} />)}
    </Section>}

    <Section title="Підписка VARANGYM" footer="Trial діє 30 днів. Після завершення потрібен активний тариф або lifetime-доступ.">
      {subjects.length ? subjects.map(s=>{
        const trial=s.sub?.status==='trialing' && s.sub?.trial_ends_at
        const remain=trial?Math.max(0,Math.ceil((new Date(s.sub.trial_ends_at)-Date.now())/86400000)):null
        return <div key={`${s.type}:${s.id}`}>
          <Row icon="creditCard" iconTint={trial?'var(--orange)':'var(--acc)'} title={s.name} subtitle={`${s.plan||'Без тарифу'} · ${s.sub?.status||'configured'}`} value={trial?`${remain} дн.`:date(s.sub?.current_period_end)} />
          <div className="card" style={{margin:'8px 0 14px',padding:12}}>
            <div className="small muted" style={{marginBottom:8}}>Доступні тарифи</div>
            <div style={{display:'grid',gap:7}}>
              {plans.filter(p=>s.type==='user'?p.audience==='solo':(businessSpaces.some(m=>m.workspace_id===s.id)?p.audience==='organization':p.audience==='trainer')).map(p=><Button key={p.code} size="sm" variant={p.code===s.plan?'tinted':'ghost'} disabled={!!busy} onClick={()=>checkout(p,s)}>{p.metadata?.label||p.code} · {money(p.price_cents,p.currency)}{p.billing_kind==='recurring'?'/міс':''}</Button>)}
            </div>
          </div>
        </div>
      }) : <Row icon="creditCard" title="Підписка ще не налаштована" subtitle="Нові акаунти отримують 30-денний trial." />}
    </Section>
  </div>
}
