import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { businessMemberships, loadPlatformIdentity, trainerMemberships } from '../lib/platform-role.js'
import { useUI } from '../store/useUI.js'
import Button from './ui.jsx'
import Icon from './Icon.jsx'

const money=(cents,currency='USD')=>new Intl.NumberFormat('uk-UA',{style:'currency',currency,maximumFractionDigits:2}).format(Number(cents||0)/100)
const date=v=>{if(!v)return'—';try{return new Date(v).toLocaleDateString('uk-UA')}catch{return'—'}}
const audienceOfSub=s=>s?.plan_code?.startsWith('business_')?'organization':s?.plan_code?.startsWith('coach_')?'trainer':'solo'
const active=s=>['active','trialing'].includes(String(s?.status||''))

const COPY={
  solo:{title:'Solo',audience:'Для особистих тренувань',features:['Повний план тренувань','Статистика прогресу та історія','Вага, мʼязовий баланс і рекорди','Повна бібліотека вправ та офлайн-медіа']},
  trainer:{title:'Coach',audience:'Для персональних тренерів',features:['Клієнти та їхня детальна статистика','Окремі програми для кожного клієнта','Коди привʼязки та контроль доступу','Coach dashboard, аналітика й шаблони']},
  organization:{title:'Business',audience:'Для студій, залів і команд',features:['Тренери й клієнти однієї організації','Business dashboard та командна аналітика','Керування доступами, планами й кодами','Фінансові показники та масштабування команди']},
}
const RECOMMENDED=new Set(['solo_monthly','coach_10','business_5_50'])

function planTitle(p){return p.metadata?.label||p.code}
function planPrice(p){return p.billing_kind==='lifetime'?money(p.price_cents,p.currency):`${money(p.price_cents,p.currency)} / міс.`}
function planCapacity(p){
  if(p.audience==='trainer')return `до ${p.client_limit||0} клієнтів`
  if(p.audience==='organization')return `${p.trainer_limit||0} тренерів · ${p.client_limit||0} клієнтів`
  return p.billing_kind==='lifetime'?'разова оплата':'щомісячна підписка'
}

function PlanCard({plan,current,paymentsConfigured,busy,onChoose}){
  const copy=COPY[plan.audience]||COPY.solo
  const isCurrent=current?.plan_code===plan.code&&active(current)
  const recommended=RECOMMENDED.has(plan.code)
  const features=[...copy.features]
  if(plan.audience==='trainer')features.unshift(`Ліміт: ${plan.client_limit||0} активних клієнтів`)
  if(plan.audience==='organization')features.unshift(`Ліміт: ${plan.trainer_limit||0} тренерів / ${plan.client_limit||0} клієнтів`)
  if(plan.billing_kind==='lifetime')features.unshift('Одноразова оплата без щомісячних списань')
  return <article className={`vg-plan-card ${plan.audience==='organization'?'business':''} ${recommended?'recommended':''}`}>
    {recommended&&<span className="vg-recommended">ПОПУЛЯРНИЙ</span>}
    <div className="vg-plan-top">
      <div><div className="vg-plan-name">{planTitle(plan)}</div><div className="vg-plan-audience">{copy.audience} · {planCapacity(plan)}</div></div>
      <div className="vg-plan-price"><b>{planPrice(plan)}</b><span>{plan.billing_kind==='lifetime'?'назавжди':'без прихованих доплат'}</span></div>
    </div>
    <div className="vg-plan-features">{features.slice(0,6).map(x=><div className="vg-plan-feature" key={x}><Icon name="check"/><span>{x}</span></div>)}</div>
    <div className="vg-plan-actions">
      <Button variant={isCurrent?'tinted':'primary'} disabled={isCurrent||!!busy||!paymentsConfigured} onClick={()=>onChoose(plan)}>
        {isCurrent?'Поточний план':busy===plan.code?'Відкриваю…':paymentsConfigured?'Обрати план':'Оплата скоро'}
      </Button>
    </div>
  </article>
}

export default function SubscriptionPanel(){
  const toast=useUI(s=>s.toast)
  const [identity,setIdentity]=useState(null)
  const [status,setStatus]=useState(null)
  const [billing,setBilling]=useState(null)
  const [plans,setPlans]=useState([])
  const [paymentsConfigured,setPaymentsConfigured]=useState(false)
  const [busy,setBusy]=useState('')

  const load=()=>Promise.allSettled([loadPlatformIdentity(),api('/api/trial/status'),api('/api/billing/plans'),api('/api/billing/me')]).then(([me,st,pl,bi])=>{
    if(me.status==='fulfilled')setIdentity(me.value)
    if(st.status==='fulfilled')setStatus(st.value)
    if(pl.status==='fulfilled'){setPlans(pl.value.plans||[]);setPaymentsConfigured(!!pl.value.paymentsConfigured)}
    if(bi.status==='fulfilled')setBilling(bi.value)
  })
  useEffect(()=>{load().catch(()=>{})},[])

  const trainers=useMemo(()=>trainerMemberships(identity),[identity])
  const businesses=useMemo(()=>businessMemberships(identity),[identity])
  const subs=status?.subscriptions||[]
  const current=subs.find(active)||subs[0]||null
  const activeCount=subs.filter(active).length
  const billingSubs=[...(billing?.userSubscriptions||[]),...(billing?.workspaceSubscriptions||[])]
  const billingSub=current?.subject_type==='workspace'
    ? billingSubs.find(x=>(x.workspace_id||x.subject_id)===current.subject_id&&x.plan_code===current.plan_code)||billingSubs.find(x=>(x.workspace_id||x.subject_id)===current.subject_id)
    : billingSubs.find(x=>x.plan_code===current?.plan_code)||billing?.userSubscriptions?.[0]

  const checkout=async plan=>{
    setBusy(plan.code)
    try{
      const body={planCode:plan.code}
      if(plan.audience==='trainer'){
        const workspaceId=trainers.find(x=>x.workspace_type==='independent_trainer')?.workspace_id||trainers[0]?.workspace_id
        if(!workspaceId)throw new Error('Coach тариф активується для Coach workspace. Створи Coach профіль через trial або код, після чого цей тариф стане доступним для оплати.')
        body.workspaceId=workspaceId
      }
      if(plan.audience==='organization'){
        const workspaceId=businesses[0]?.workspace_id
        if(!workspaceId)throw new Error('Business тариф активується для організації. Створи Business профіль через trial або код, після чого цей тариф стане доступним для оплати.')
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
      toast(resume?'Скасування підписки відмінено':'Підписку буде завершено наприкінці оплаченого періоду')
      await load()
    }catch(e){toast(e.message||'Не вдалося змінити підписку')}
    finally{setBusy('')}
  }

  const grouped={solo:plans.filter(p=>p.audience==='solo'),trainer:plans.filter(p=>p.audience==='trainer'),organization:plans.filter(p=>p.audience==='organization')}
  const currentLabel=current?.plan_metadata?.label||current?.plan_code||'Без активного тарифу'
  const currentStatus=current?.status==='trialing'?`Trial до ${date(current.trial_ends_at)}`:current?.current_period_end?`Активний до ${date(current.current_period_end)}`:current?.status||'Можна вибрати тариф нижче'

  return <div className="vg-subscription-manager">
    <div className="card vg-subscription-hero">
      <div className="vg-plan-kicker">VARANGYM Membership</div>
      <div className="vg-plan-title">Один екран для всіх тарифів</div>
      <div className="vg-plan-sub">Solo для себе, Coach для роботи з клієнтами або Business для команди. Тариф можна змінювати без пошуку окремих пунктів у налаштуваннях.</div>
      <div className="vg-current-plan">
        <div><strong>{currentLabel}</strong><small>{currentStatus}{activeCount>1?` · ще ${activeCount-1} активн.`:''}</small></div>
        {billingSub?.status==='active'&&<Button size="sm" variant="tinted" disabled={!!busy} onClick={()=>changeCancel(!!billingSub.cancel_at_period_end)}>{billingSub.cancel_at_period_end?'Продовжити':'Скасувати'}</Button>}
      </div>
      {current?.status==='trialing'&&<div className="vg-billing-note">30-денний trial не списує гроші автоматично без оформленої платної підписки. Дані й прогрес зберігаються при переході на платний план.</div>}
      {!paymentsConfigured&&<div className="vg-billing-note">Платіжний провайдер ще не підключений до production. Тарифи вже показані з реальними цінами й лімітами; кнопки оплати активуються після підключення провайдера.</div>}
    </div>

    {(['solo','trainer','organization']).map(a=>{
      const copy=COPY[a],rows=grouped[a]||[]
      if(!rows.length)return null
      return <section className="vg-plan-section" key={a}>
        <div className="vg-plan-section-head"><div><h2>{copy.title}</h2><div className="small muted">{copy.audience}</div></div><p>{a==='solo'?'Для одного профілю':a==='trainer'?'Клієнти та програми':'Команда та масштабування'}</p></div>
        <div className="vg-plan-grid">{rows.map(p=><PlanCard key={p.code} plan={p} current={current} paymentsConfigured={paymentsConfigured} busy={busy} onChoose={checkout}/>)}</div>
      </section>
    })}

    <section className="vg-plan-section">
      <div className="vg-plan-section-head"><div><h2>Порівняння</h2><div className="small muted">Що отримує кожен рівень</div></div></div>
      <div className="vg-plan-compare">
        <div className="vg-compare-row"><span>Особистий план і прогрес</span><span>Solo · Coach · Business</span></div>
        <div className="vg-compare-row"><span>Керування клієнтами</span><span>Coach · Business</span></div>
        <div className="vg-compare-row"><span>Окремі програми клієнтів</span><span>Coach · Business</span></div>
        <div className="vg-compare-row"><span>Тренери та організація</span><span>Business</span></div>
        <div className="vg-compare-row"><span>Фінансовий dashboard</span><span>Business · Admin</span></div>
        <div className="vg-compare-row"><span>Детальна статистика</span><span>Усі плани</span></div>
      </div>
    </section>
  </div>
}
