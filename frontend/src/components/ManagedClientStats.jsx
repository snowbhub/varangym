import ClientStatsMirror from './ClientStatsMirror.jsx'
import ClientEffortReadOnly from './ClientEffortReadOnly.jsx'
import ClientHistoryReadOnly from './ClientHistoryReadOnly.jsx'

export default function ManagedClientStats({state,client}) {
  return <>
    <div className="hdr" style={{marginBottom:12}}>
      <div>
        <h1>Статистика</h1>
        <div className="sub">{client?.display_name||client?.name||'Клієнт'} · Progress & history · read-only</div>
      </div>
    </div>
    <style>{`.managed-client-stats > .card:first-child{display:none!important}`}</style>
    <div className="managed-client-stats"><ClientStatsMirror state={state} client={client}/></div>
    <ClientEffortReadOnly state={state}/>
    <ClientHistoryReadOnly state={state}/>
  </>
}
