export default function BinVisualizer({ state }) {
  const fillColor = state.status === 'ALERT'
    ? 'var(--alert)'
    : state.status === 'WARNING'
      ? 'var(--warning)'
      : 'var(--success)';

  return (
    <div className="bin-visualizer">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Live bin</p>
          <h2>{state.binId}</h2>
        </div>
        <span className="tiny-metric">{state.location}</span>
      </div>

      <div className="bin-stage">
        <div className="bin-shell">
          <div
            className="bin-fill"
            style={{
              height: `${state.currentLevel}%`,
              backgroundColor: fillColor
            }}
          />
          <div className="bin-markers" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="bin-label">
            <strong>{state.currentLevel.toFixed(1)}%</strong>
            <span>{state.isRunning ? 'Running' : 'Idle'}</span>
          </div>
        </div>

        <div className="bin-summary">
          <div className="metric-card metric-card-compact">
            <span>Alert threshold</span>
            <strong>{state.alertThreshold}%</strong>
          </div>
          <div className="metric-card metric-card-compact">
            <span>Fill rate</span>
            <strong>{state.fillRate}% / min</strong>
          </div>
          <div className="metric-card metric-card-compact">
            <span>Capacity</span>
            <strong>{state.maxCapacity}%</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
