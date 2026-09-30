import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { businessMemberships, loadPlatformIdentity, trainerMemberships } from '../lib/platform-role.js'
import { useUI } from '../store/useUI.js'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'

const money=(cents,currency='USD')=>new Intl.NumberFormat('uk-UA',{style:'currency',currency,maximumFractionDigits:2}).format(Number(cents||0)/100)
const date=v=>{if(!v)return'—';try{return new Date(v).toLocaleDateString('uk-UA')}catch{return'—'}}
const active=s=>['active','trialing'].includes(String(s?.status||''))
const RANK={organization:3,trainer:2,solo:1}

const COPY={
  solo:{title:'Solo',audience:'Для власних тренувань',pitch:'Усе потрібне для стабільного прогресу без тренера.',features:['План і календар тренувань','Детальна статистика, рекорди та історія','Вага, мʼязовий баланс і прогрес','Повна бібліотека вправ та офлайн-медіа']},
  trainer:{title:'Coach',audience:'Для персональних тренерів',pitch:'Керуйте клієнтами, програмами й прогресом з одного місця.',features:['Клієнти та їхня детальна статистика','Окрема програма для кожного клієнта','Коди привʼязки та контроль доступу','Coach dashboard, аналітика й шаблони']},
  organization:{title:'Business',audience:'Для студій, залів і команд',pitch:'Команда тренерів, клієнти, аналітика й доступи в одному workspace.',features:['Тренери й клієнти однієї організації','Business dashboard та командна аналітика','Керування доступами, планами й кодами','Фінансові показники та масштабування команди']},
}
const RECOMMENDED=new Set(['solo_monthly','coach_10','business_5_50'])
const FRIENDLY={solo_monthly:'Solo Monthly',solo_lifetime:'Solo Lifetime',coach_5:'Coach 5',coach_10:'Coach 10',coach_20:'Coach 20',business_5_50:'Business 5 / 50',business_10_100:'Business 10 / 100'}

function planTitle(p){return p.metadata?.label||FRIENDLY[p.code]||String(p.code||'VARANGYM').replaceAll('_',' ')}
function planPrice(p){return p.billing_kind==='lifetime'?money(p.price_cents,p.currency):`${money(p.price_cents,p.currency)} / міс.`}
function planCapacity(p){if(p.audience==='trainer')return`до ${p.client_limit||0} клієнтів`;if(p.audience==='organization')return`${p.trainer_limit||0} тренерів · ${p.client_limit||0} клієнтів`;return p.billing_kind==='lifetime'?'разова оплата':'щомісячна підписка'}
function planByCode(plans,code){return plans.find(p=>p.code===code)||null}
function audienceOf(plans,sub){return planByCode(plans,sub?.plan_code)?.audience||sub?.plan_metadata?.audience||'solo'}

function PlanCard({plan,currentCodes,paymentsConfigured,busy,onChoose}){
  const copy=COPY[plan.audience]||COPY.solo,isCurrent=currentCodes.has(plan.code),recommended=RECOMMENDED.has(plan.code),features=[...copy.features]
  if(plan.audience==='trainer')features.unshift(`Ліміт тарифу: ${plan.client_limit||0} активних клієнтів`)
  if(plan.audience==='organization')features.unshift(`Ліміт тарифу: ${plan.trainer_limit||0} тренерів / ${plan.client_limit||0} клієнтів`)
  if(plan.billing_kind==='lifetime')features.unshift('Одноразова оплата — без щомісячних списань')
  return <article className={`vg-plan-card ${plan.audience==='organization'?'business':''} ${recommended?'recommended':''}`}>
    {recommended&&<span className="vg-recommended">ПОПУЛЯРНИЙ</span>}
    <div className="vg-plan-top">
      <div><div className="vg-plan-name">{planTitle(plan)}</div><div className="vg-plan-audience">{copy.audience} · {planCapacity(plan)}</div></div>
      <div className="vg-plan-price"><b>{planPrice(plan)}</b><span>{plan.billing_kind==='lifetime'?'один раз':'за місяць'}</span></div>
    </div>
    <div className="vg-plan-features">{features.slice(0,6).map(x=><div className="vg-plan-feature" key={x}><Icon name="check"/><span>{x}</span></div>)}</div>
    <div className="vg-plan-actions"><Button variant={isCurrent?'tinted':'primary'} disabled={isCurrent||!!busy||!paymentsConfigured} onClick={()=>onChoose(plan)}>{isCurrent?'Підключено':busy===plan.code?'Відкриваю оплату…':paymentsConfigured?'Обрати тариф':'Оплата скоро'}</Button></div>
  </article>
}

export default function SubscriptionPanel(){
  const toast=useUI(s=>s.toast)
  const [identity,setIdentity]=useState(null),[status,setStatus]=useState(null),[plans,setPlans]=useState([]),[paymentsConfigured,setPaymentsConfigured]=useState(false),[busy,setBusy]=useState('')
  const load=()=>Promise.allSettled([loadPlatformIdentity(),api('/api/trial/status'),api('/api/billing/plans')]).then(([me,st,pl])=>{if(me.status==='fulfilled')setIdentity(me.value);if(st.status==='fulfilled')setStatus(st.value);if(pl.status==='fulfilled'){setPlans(pl.value.plans||[]);setPaymentsConfigured(!!pl.value.paymentsConfigured)}})
  useEffect(()=>{load().catch(()=>{})},[])
  const trainers=useMemo(()=>trainerMemberships(identity),[identity]),businesses=useMemo(()=>businessMemberships(identity),[identity])
  const subs=status?.subscriptions||[],activeSubs=subs.filter(active)
  const currentCodes=useMemo(()=>new Set(activeSubs.map(x=>x.plan_code).filter(Boolean)),[activeSubs])
  const primary=useMemo(()=>[...activeSubs].sort((a,b)=>RANK[audienceOf(plans,b)]-RANK[audienceOf(plans,a)])[0]||subs[0]||null,[activeSubs,subs,plans])

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
      // Coach/Business workspaces are provisioned only after a successful payment. Opening and
      // abandoning checkout never grants a management role.
      const d=await api('/api/billing/checkout',{method:'POST',body:JSON.stringify(body)})
      if(d.url)location.href=d.url
    }catch(e){toast(e.message||'Не вдалося відкрити оплату')}finally{setBusy('')}
  }

  const grouped={solo:plans.filter(p=>p.audience==='solo'),trainer:plans.filter(p=>p.audience==='trainer'),organization:plans.filter(p=>p.audience==='organization')}
  const primaryPlan=planByCode(plans,primary?.plan_code)
  const currentLabel=primaryPlan?planTitle(primaryPlan):primary?.plan_metadata?.label||primary?.plan_code||'Без активного тарифу'
  const currentStatus=primary?.status==='trialing'?`Trial до ${date(primary.trial_ends_at)}`:primary?.current_period_end?`Оплачено до ${date(primary.current_period_end)}`:primary?.status==='active'?'Активний':'Можна вибрати тариф нижче'

  return <div className="vg-subscription-manager">
    <div className="card vg-subscription-hero">
      <div className="vg-plan-kicker">VARANGYM Membership</div>
      <div className="vg-plan-title">Тариф, який росте разом з вами</div>
      <div className="vg-plan-sub">Почніть із Solo, перейдіть на Coach, коли зʼявляться клієнти, або на Business, коли будуєте команду. Прогрес і дані залишаються у вашому акаунті.</div>
      <div className="vg-current-plan"><div><strong>{currentLabel}</strong><small>{currentStatus}{activeSubs.length>1?` · ${activeSubs.length} активні продукти`:''}</small></div><a className="btn tinted sm" href="#vg-all-plans">Змінити тариф</a></div>
      {primary?.status==='trialing'&&<div className="vg-billing-note">30-денний trial не списує гроші автоматично. До завершення trial можна вибрати будь-який платний тариф нижче.</div>}
      {!paymentsConfigured&&<div className="vg-billing-note">Онлайн-оплата ще не активована в production. Тарифи, ціни та ліміти вже показані; після підключення Stripe кнопки оплати стануть активними без зміни акаунта.</div>}
    </div>

    <section className="vg-plan-section" id="vg-all-plans">
      <div className="vg-plan-section-head"><div><h2>Усі тарифи</h2><div className="small muted">Одна сторінка замість окремих рядків у налаштуваннях</div></div><p>Порівняйте рівні та виберіть потрібний</p></div>
    </section>
    {(['solo','trainer','organization']).map(a=>{const copy=COPY[a],rows=grouped[a]||[];if(!rows.length)return null;return <section className="vg-plan-section" key={a}>
      <div className="vg-plan-section-head"><div><h2>{copy.title}</h2><div className="small muted">{copy.audience}</div></div><p>{copy.pitch}</p></div>
      <div className="vg-plan-grid">{rows.map(p=><PlanCard key={p.code} plan={p} currentCodes={currentCodes} paymentsConfigured={paymentsConfigured} busy={busy} onChoose={checkout}/>)}</div>
    </section>})}

    <section className="vg-plan-section"><div className="vg-plan-section-head"><div><h2>Що змінюється між рівнями</h2><div className="small muted">Без технічних кодів тарифів</div></div></div><div className="vg-plan-compare">
      <div className="vg-compare-row"><span>Особистий план, тренування, прогрес</span><span>Усі</span></div>
      <div className="vg-compare-row"><span>Вага, рекорди, офлайн-вправи</span><span>Усі</span></div>
      <div className="vg-compare-row"><span>Клієнти й окремі програми</span><span>Coach · Business</span></div>
      <div className="vg-compare-row"><span>Read-only статистика клієнтів</span><span>Coach · Business</span></div>
      <div className="vg-compare-row"><span>Тренери та організація</span><span>Business</span></div>
      <div className="vg-compare-row"><span>Командна та фінансова аналітика</span><span>Business</span></div>
    </div></section>
  </div>
}