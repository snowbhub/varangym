import ClientStatsMirror from './ClientStatsMirror.jsx'

export default function ManagedClientStats({state,client}) {
  return <>
    <div className="hdr" style={{marginBottom:12}}>
      <div>
        <h1>Статистика</h1>
        <div className="sub">{client?.display_name||client?.name||'Клієнт'} · Progress & history</div>
      </div>
    </div>
    <style>{`.managed-client-stats > .card:first-child{display:none!important}`}</style>
    <div className="managed-client-stats"><ClientStatsMirror state={state} client={client}/></div>
  </>
}
