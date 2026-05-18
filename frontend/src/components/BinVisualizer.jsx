export default function BinVisualizer({ bin }) {
  if (!bin) {
    return (
      <div className="bin-visualizer empty">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Selected bin</p>
            <h2>No bin selected</h2>
          </div>
        </div>
        <div className="empty-state empty-state-large">
          Create a community bin or choose one from the directory to view live fill data.
        </div>
      </div>
    );
  }

  const fillPercent = Math.min(100, Math.max(0, (bin.currentLevel / bin.maxCapacity) * 100));
  const fillColor = bin.status === 'ALERT'
    ? 'var(--alert)'
    : bin.status === 'WARNING'
      ? 'var(--warning)'
      : 'var(--success)';
  const statusClass = `status-${bin.status.toLowerCase()}`;

  return (
    <div className={`bin-visualizer ${statusClass}`}>
      <div className="section-heading">
        <div>
          <p className="section-kicker">Live bin</p>
          <h2>{bin.binName}</h2>
          <p className="visualizer-subtitle">{bin.communityName}</p>
        </div>
        <span className="tiny-metric">{bin.location}</span>
      </div>

      <div className="bin-stage">
        <div className="bin-showcase">
          <div className="bin-lid" aria-hidden="true" />
          <div className="bin-shell">
            <div
              className="bin-fill"
              style={{
                height: `${fillPercent}%`,
                backgroundColor: fillColor
              }}
            />
            <div className="bin-glow" aria-hidden="true" />
            <div className="bin-markers" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="bin-label">
              <strong>{bin.currentLevel.toFixed(1)}%</strong>
              <span>{bin.isRunning ? 'Live simulation' : 'Idle'}</span>
            </div>
          </div>
          <div
            className="level-ring"
            style={{
              '--level': `${fillPercent * 3.6}deg`,
              '--level-color': fillColor
            }}
            aria-label={`Bin fill level ${bin.currentLevel.toFixed(1)} percent`}
          >
            <span>{Math.round(fillPercent)}%</span>
          </div>
        </div>

        <div className="bin-summary">
          <div className="metric-card metric-card-compact">
            <span>Alert threshold</span>
            <strong>{bin.alertThreshold.toFixed(1)}%</strong>
          </div>
          <div className="metric-card metric-card-compact">
            <span>Fill rate</span>
            <strong>{bin.fillRate.toFixed(1)}% / min</strong>
          </div>
          <div className="metric-card metric-card-compact">
            <span>Capacity</span>
            <strong>{bin.maxCapacity.toFixed(1)}%</strong>
          </div>
          <div className="metric-card metric-card-compact">
            <span>Status</span>
            <strong>{bin.status}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
