const filterOptions = [
  { value: 'ALL', label: 'All events' },
  { value: 'STATUS', label: 'Status' },
  { value: 'CONTROL', label: 'Control' },
  { value: 'SETTINGS', label: 'Settings' },
  { value: 'ALERTS', label: 'Alerts' }
];

export default function HistoryPanel({
  events,
  filter,
  sortOrder,
  onFilterChange,
  onSortChange,
  formatTimestamp,
  selectedBin
}) {
  return (
    <div className="history-panel">
      <div className="section-heading">
        <div>
          <p className="section-kicker">History</p>
          <h2>Event log</h2>
          <p className="visualizer-subtitle">
            {selectedBin ? `${selectedBin.communityName} · ${selectedBin.binName}` : 'All bins'}
          </p>
        </div>

        <div className="history-toolbar">
          <select value={filter} onChange={(event) => onFilterChange(event.target.value)}>
            {filterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select value={sortOrder} onChange={(event) => onSortChange(event.target.value)}>
            <option value="DESC">Newest</option>
            <option value="ASC">Oldest</option>
          </select>
        </div>
      </div>

      <div className="history-list">
        {events.length === 0 ? (
          <div className="empty-state">
            No events yet for this bin.
          </div>
        ) : (
          events.map((event) => (
            <article key={event.id} className="history-item">
              <div className="history-item-head">
                <strong>{event.type}</strong>
                <span>{formatTimestamp(event.timestamp)}</span>
              </div>
              <p>{event.message}</p>
              <div className="history-meta">
                <span>{event.binName}</span>
                <span>{event.level.toFixed(1)}%</span>
                <span>{event.type}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
