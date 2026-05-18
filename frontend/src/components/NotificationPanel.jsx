export default function NotificationPanel({ notifications, unreadCount, onAcknowledge, isAdminMode, adminName }) {
  return (
    <div className="notification-panel">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Admin alerts</p>
          <h2>Notifications</h2>
          <p className="visualizer-subtitle">
            {isAdminMode ? `Acknowledging as ${adminName || 'Local Admin'}` : 'View-only mode · admin acknowledgment required'}
          </p>
        </div>
        <span className="tiny-metric">{unreadCount} pending</span>
      </div>

      <div className="notification-list">
        {notifications.length === 0 ? (
          <div className="empty-state">
            Notifications will appear here when a bin reaches capacity.
          </div>
        ) : (
          notifications.map((notification) => (
            <article key={notification.id} className={`notification-card ${notification.isRead ? 'is-read' : 'is-unread'}`}>
              <div>
                <div className="notification-head">
                  <strong>{notification.binName}</strong>
                  <span>{notification.isRead ? 'Acknowledged' : 'Pending'}</span>
                </div>
                <p>{notification.communityName}</p>
                <p>{notification.message}</p>
                <div className="notification-meta">
                  <span>Level {notification.level.toFixed(1)}%</span>
                  <span>{new Date(notification.createdAt).toLocaleString()}</span>
                </div>
                {notification.isRead ? (
                  <p className="notification-status-note">
                    Acknowledged{notification.acknowledgedBy ? ` by ${notification.acknowledgedBy}` : ''}
                    {notification.acknowledgedAt ? ` · ${new Date(notification.acknowledgedAt).toLocaleString()}` : ''}
                  </p>
                ) : (
                  <p className="notification-status-note">Awaiting admin acknowledgment.</p>
                )}
              </div>

              {!notification.isRead ? (
                <div className="notification-actions">
                  {isAdminMode ? (
                    <button type="button" className="secondary-button" onClick={() => onAcknowledge(notification.id)}>
                      Acknowledge
                    </button>
                  ) : (
                    <span className="notification-status-note">Admin only</span>
                  )}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
