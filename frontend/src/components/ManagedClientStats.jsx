import { t, useLang } from '../lib/i18n.js'
import ClientStatsMirror from './ClientStatsMirror.jsx'
import ClientEffortReadOnly from './ClientEffortReadOnly.jsx'
import ClientHistoryReadOnly from './ClientHistoryReadOnly.jsx'

export default function ManagedClientStats({state,client}) {
  useLang()
  return <>
    <div className="hdr" style={{marginBottom:12}}>
      <div>
        <h1>{t('Statistics')}</h1>
        <div className="sub">{client?.display_name||client?.name||t('Client')} · {t('Progress & history')} · read-only</div>
      </div>
    </div>
    <style>{`.managed-client-stats > .card:first-child{display:none!important}`}</style>
    <div className="managed-client-stats"><ClientStatsMirror state={state} client={client}/></div>
    <ClientEffortReadOnly state={state}/>
    <ClientHistoryReadOnly state={state}/>
  </>
}