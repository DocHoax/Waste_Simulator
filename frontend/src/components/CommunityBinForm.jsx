import { useState } from 'react';

const initialFormState = {
  communityName: '',
  binName: '',
  location: '',
  currentLevel: 0,
  maxCapacity: 100,
  alertThreshold: 80,
  fillRate: 5,
  isRunning: false
};

export default function CommunityBinForm({ onCreateBin }) {
  const [formState, setFormState] = useState(initialFormState);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (field, value) => {
    setFormState((currentState) => ({
      ...currentState,
      [field]: value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const result = await onCreateBin({
        ...formState,
        currentLevel: Number(formState.currentLevel),
        maxCapacity: Number(formState.maxCapacity),
        alertThreshold: Number(formState.alertThreshold),
        fillRate: Number(formState.fillRate),
        isRunning: Boolean(formState.isRunning)
      });

      if (result) {
        setFormState(initialFormState);
      }
    } catch (submitError) {
      setError(submitError.message || 'Unable to create bin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="registry-form" onSubmit={handleSubmit}>
      <div className="section-heading">
        <div>
          <p className="section-kicker">Create bin</p>
          <h2>Register a community bin</h2>
        </div>
      </div>

      <div className="form-grid">
        <label className="control-field">
          <div className="control-label">
            <span>Community name</span>
            <strong>Required</strong>
          </div>
          <input
            type="text"
            value={formState.communityName}
            onChange={(event) => updateField('communityName', event.target.value)}
            placeholder="River District"
            required
          />
        </label>

        <label className="control-field">
          <div className="control-label">
            <span>Bin name</span>
            <strong>Required</strong>
          </div>
          <input
            type="text"
            value={formState.binName}
            onChange={(event) => updateField('binName', event.target.value)}
            placeholder="BIN-014"
            required
          />
        </label>

        <label className="control-field form-span-2">
          <div className="control-label">
            <span>Location</span>
            <strong>Required</strong>
          </div>
          <input
            type="text"
            value={formState.location}
            onChange={(event) => updateField('location', event.target.value)}
            placeholder="Market road corner"
            required
          />
        </label>

        <label className="control-field">
          <div className="control-label">
            <span>Initial level</span>
            <strong>{Number(formState.currentLevel).toFixed(1)}%</strong>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={formState.currentLevel}
            onChange={(event) => updateField('currentLevel', event.target.value)}
          />
        </label>

        <label className="control-field">
          <div className="control-label">
            <span>Capacity</span>
            <strong>{Number(formState.maxCapacity).toFixed(1)}%</strong>
          </div>
          <input
            type="range"
            min="20"
            max="150"
            step="1"
            value={formState.maxCapacity}
            onChange={(event) => updateField('maxCapacity', event.target.value)}
          />
        </label>

        <label className="control-field">
          <div className="control-label">
            <span>Alert threshold</span>
            <strong>{Number(formState.alertThreshold).toFixed(1)}%</strong>
          </div>
          <input
            type="range"
            min="10"
            max={Number(formState.maxCapacity)}
            step="1"
            value={formState.alertThreshold}
            onChange={(event) => updateField('alertThreshold', event.target.value)}
          />
        </label>

        <label className="control-field">
          <div className="control-label">
            <span>Fill rate</span>
            <strong>{Number(formState.fillRate).toFixed(1)}% / min</strong>
          </div>
          <input
            type="range"
            min="0"
            max="25"
            step="0.5"
            value={formState.fillRate}
            onChange={(event) => updateField('fillRate', event.target.value)}
          />
        </label>
      </div>

      <label className="switch-row">
        <input
          type="checkbox"
          checked={formState.isRunning}
          onChange={(event) => updateField('isRunning', event.target.checked)}
        />
        <span>Start simulation immediately</span>
      </label>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="registry-actions">
        <button className="primary-button registry-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create bin'}
        </button>
      </div>
    </form>
  );
}
