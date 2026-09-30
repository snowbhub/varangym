import { useNavigate } from 'react-router-dom'
import SubscriptionPanel from '../components/SubscriptionPanel.jsx'
import Icon from '../components/Icon.jsx'

export default function Subscription(){
  const nav=useNavigate()
  return <div className="narrow vg-subscription-page">
    <div className="hdr">
      <button className="iconbtn" onClick={()=>nav('/settings')} aria-label="Назад"><Icon name="chevronLeft"/></button>
      <div style={{flex:1,marginLeft:10}}><h1>Підписка</h1><div className="sub">Тарифи, оплата та доступ VARANGYM</div></div>
    </div>
    <SubscriptionPanel full />
  </div>
}
