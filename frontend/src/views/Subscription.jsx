import { useNavigate } from 'react-router-dom'
import SubscriptionPanel from '../components/SubscriptionPanel.jsx'
import Icon from '../components/Icon.jsx'
import { useLang } from '../lib/i18n.js'
import { productText as p } from '../lib/product-copy.js'

export default function Subscription(){
  useLang()
  const nav=useNavigate()
  return <div className="narrow vg-subscription-page">
    <div className="hdr">
      <button className="iconbtn" onClick={()=>nav('/settings')} aria-label={p('back')}><Icon name="chevronLeft"/></button>
      <div style={{flex:1,marginLeft:10}}><h1>{p('subscriptionTitle')}</h1><div className="sub">{p('subscriptionSub')}</div></div>
    </div>
    <SubscriptionPanel/>
  </div>
}
