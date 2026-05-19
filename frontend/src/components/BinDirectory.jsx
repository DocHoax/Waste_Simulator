export default function BinDirectory({ bins, selectedBinId, onSelectBin }) {
  return (
    <div className="bin-directory">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Directory</p>
          <h2>Community bins</h2>
        </div>
        <span className="tiny-metric">{bins.length} bins</span>
      </div>

      <div className="directory-list">
        {bins.length === 0 ? (
          <div className="empty-state">
            No bins yet. Create the first community bin to populate the registry.
          </div>
        ) : (
          bins.map((bin) => {
            const fillPercent = Math.min(100, Math.max(0, (bin.currentLevel / bin.maxCapacity) * 100));
            const statusClass = `status-${bin.status.toLowerCase()}`;

            return (
            <article key={bin.id} className={`directory-card ${statusClass} ${selectedBinId === bin.id ? 'is-selected' : ''}`}>
              <button type="button" className="directory-select" onClick={() => onSelectBin(bin.id)}>
                <div>
                  <strong>{bin.binName}</strong>
                  <span>{bin.communityName}</span>
                </div>
                <span className={`directory-status ${statusClass}`}>{bin.status}</span>
              </button>

              <div className="directory-progress" aria-hidden="true">
                <span style={{ width: `${fillPercent}%` }} />
              </div>

              <div className="directory-meta">
                <span>{bin.location}</span>
                <span>{bin.currentLevel.toFixed(1)} / {bin.maxCapacity.toFixed(1)}%</span>
                <span>{bin.isRunning ? 'Running' : 'Paused'}</span>
              </div>
            </article>
            );
          })
        )}
      </div>
    </div>
  );
}
