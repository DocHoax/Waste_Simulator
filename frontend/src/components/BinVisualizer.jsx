export default function BinVisualizer({ bins = [], selectedBinId, onSelectBin }) {
  if (!bins.length) {
    return (
      <div className="bin-visualizer empty">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Bin display</p>
            <h2>No bins created yet</h2>
          </div>
        </div>
        <div className="empty-state empty-state-large">
          Create a community bin to display it in the center grid.
        </div>
      </div>
    );
  }

  return (
    <div className="bin-visualizer bin-grid-view">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Live bins</p>
          <h2>Community bin overview</h2>
          <p className="visualizer-subtitle">All created bins appear here in the central monitoring grid.</p>
        </div>
        <span className="tiny-metric">{bins.length} bins</span>
      </div>

      <div className="bin-gallery" role="list" aria-label="Created bins">
        {bins.map((bin) => {
          const fillPercent = Math.min(100, Math.max(0, (bin.currentLevel / bin.maxCapacity) * 100));
          const fillColor = bin.status === 'ALERT'
            ? 'var(--alert)'
            : bin.status === 'WARNING'
              ? 'var(--warning)'
              : 'var(--success)';
          const isSelected = selectedBinId === bin.id;

          return (
            <button
              key={bin.id}
              type="button"
              className={`bin-gallery-card ${isSelected ? 'is-selected' : ''}`}
              onClick={() => onSelectBin?.(bin.id)}
            >
              <div className="bin-gallery-head">
                <div>
                  <strong>{bin.binName}</strong>
                  <span>{bin.communityName}</span>
                </div>
                <span className={`directory-status status-${bin.status.toLowerCase()}`}>{bin.status}</span>
              </div>

              <div className="bin-gallery-showcase">
                <div className="bin-gallery-lid" aria-hidden="true" />
                <div className="bin-gallery-shell" aria-hidden="true">
                  <div
                    className="bin-gallery-fill"
                    style={{
                      height: `${fillPercent}%`,
                      backgroundColor: fillColor
                    }}
                  />
                </div>
                <div className="bin-gallery-level">{Math.round(fillPercent)}%</div>
              </div>

              <div className="bin-gallery-meta">
                <span>{bin.location}</span>
                <span>{bin.currentLevel.toFixed(1)} / {bin.maxCapacity.toFixed(1)}%</span>
                <span>{bin.isRunning ? 'Running' : 'Paused'}</span>
              </div>

              <div className="bin-gallery-stats">
                <div>
                  <span>Alert</span>
                  <strong>{bin.alertThreshold.toFixed(0)}%</strong>
                </div>
                <div>
                  <span>Fill rate</span>
                  <strong>{bin.fillRate.toFixed(1)}% / min</strong>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
