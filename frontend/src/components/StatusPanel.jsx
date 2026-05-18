function StatBlock({ label, value }) {
  return (
    <div className="stat-block">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function StatusPanel({ state, connectionStatus }) {
  return (
    <div className="status-panel">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Device status</p>
          <h2>Telemetry at a glance</h2>
        </div>
      </div>

      <div className="stat-grid">
        <StatBlock label="Connection" value={connectionStatus} />
        <StatBlock label="Current level" value={`${state.currentLevel.toFixed(1)}%`} />
        <StatBlock label="Status" value={state.status} />
        <StatBlock label="Empty count" value={state.emptyCount} />
        <StatBlock label="Alert count" value={state.alertCount} />
        <StatBlock label="Clients" value={state.clientCount} />
      </div>

      <div className="status-footnote">
        <div>
          <span>Last update</span>
          <strong>{new Date(state.lastUpdate).toLocaleString()}</strong>
        </div>
        <div>
          <span>Operating mode</span>
          <strong>{state.isRunning ? 'Auto-simulating' : 'Paused'}</strong>
        </div>
      </div>
    </div>
  );
}
