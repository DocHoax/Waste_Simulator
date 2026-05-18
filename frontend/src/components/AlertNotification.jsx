import { useEffect } from 'react';

export default function AlertNotification({ alert, onDismiss }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(alert.id), 5000);
    return () => window.clearTimeout(timer);
  }, [alert.id, onDismiss]);

  return (
    <article className="alert-notification">
      <div>
        <p className="section-kicker">System alert</p>
        <h3>{alert.title}</h3>
        <p className="alert-context">{alert.communityName} · {alert.binName}</p>
        <p>{alert.message}</p>
      </div>
      <button type="button" className="dismiss-button" onClick={() => onDismiss(alert.id)}>
        Dismiss
      </button>
    </article>
  );
}
