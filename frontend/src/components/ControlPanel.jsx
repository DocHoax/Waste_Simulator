export default function ControlPanel({ state, onSendCommand }) {
  return (
    <div className="control-panel">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Controls</p>
          <h2>Drive the simulation</h2>
        </div>
      </div>

      <div className="button-row">
        <button className="primary-button" type="button" onClick={() => onSendCommand({ type: 'START' })}>
          Start
        </button>
        <button className="secondary-button" type="button" onClick={() => onSendCommand({ type: 'STOP' })}>
          Stop
        </button>
        <button className="secondary-button" type="button" onClick={() => onSendCommand({ type: 'RESET' })}>
          Reset
        </button>
      </div>

      <label className="control-field">
        <div className="control-label">
          <span>Manual level</span>
          <strong>{state.currentLevel.toFixed(1)}%</strong>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={state.currentLevel}
          onChange={(event) => onSendCommand({ type: 'SET_LEVEL', level: Number(event.target.value) })}
        />
      </label>

      <label className="control-field">
        <div className="control-label">
          <span>Fill rate</span>
          <strong>{state.fillRate}% / min</strong>
        </div>
        <input
          type="range"
          min="0"
          max="20"
          step="0.5"
          value={state.fillRate}
          onChange={(event) => onSendCommand({ type: 'SET_FILL_RATE', rate: Number(event.target.value) })}
        />
      </label>

      <label className="control-field">
        <div className="control-label">
          <span>Alert threshold</span>
          <strong>{state.alertThreshold}%</strong>
        </div>
        <input
          type="range"
          min="10"
          max="100"
          step="1"
          value={state.alertThreshold}
          onChange={(event) => onSendCommand({ type: 'SET_ALERT_THRESHOLD', threshold: Number(event.target.value) })}
        />
      </label>
    </div>
  );
}
