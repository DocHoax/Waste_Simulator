function StatBlock({ label, value }) {
  return (
    <div className="stat-block">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function StatusPanel({ state, selectedBin, connectionStatus }) {
  return (
    <div className="status-panel">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Device status</p>
          <h2>Telemetry at a glance</h2>
          <p className="visualizer-subtitle">{selectedBin ? `${selectedBin.communityName} · ${selectedBin.binName}` : 'No bin selected'}</p>
        </div>
      </div>

      <div className="stat-grid">
        <StatBlock label="Connection" value={connectionStatus} />
        <StatBlock label="Bins" value={state.totalBins} />
        <StatBlock label="Communities" value={state.activeCommunities} />
        <StatBlock label="Pending alerts" value={state.unreadNotificationCount} />
        <StatBlock label="Running bins" value={state.runningBinsCount} />
        <StatBlock label="Clients" value={state.clientCount} />
      </div>

      <div className="status-footnote">
        <div>
          <span>Selected bin</span>
          <strong>{selectedBin ? selectedBin.status : 'None'}</strong>
        </div>
        <div>
          <span>Bin level</span>
          <strong>{selectedBin ? `${selectedBin.currentLevel.toFixed(1)} / ${selectedBin.maxCapacity.toFixed(1)}` : '—'}</strong>
        </div>
        <div>
          <span>Last update</span>
          <strong>{selectedBin ? new Date(selectedBin.updatedAt).toLocaleString() : '—'}</strong>
        </div>
        <div>
          <span>Operating mode</span>
          <strong>{selectedBin?.isRunning ? 'Auto-simulating' : 'Paused'}</strong>
        </div>
      </div>
    </div>
  );
}
