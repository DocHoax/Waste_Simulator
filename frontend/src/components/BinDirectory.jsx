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
          bins.map((bin) => (
            <article key={bin.id} className={`directory-card ${selectedBinId === bin.id ? 'is-selected' : ''}`}>
              <button type="button" className="directory-select" onClick={() => onSelectBin(bin.id)}>
                <div>
                  <strong>{bin.binName}</strong>
                  <span>{bin.communityName}</span>
                </div>
                <span className="directory-status">{bin.status}</span>
              </button>

              <div className="directory-meta">
                <span>{bin.location}</span>
                <span>{bin.currentLevel.toFixed(1)} / {bin.maxCapacity.toFixed(1)}%</span>
                <span>{bin.isRunning ? 'Running' : 'Paused'}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
