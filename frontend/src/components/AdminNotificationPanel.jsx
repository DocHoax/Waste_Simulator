import React, { useState, useEffect } from 'react';

export default function AdminNotificationPanel() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

  // Fetch notifications on mount
  useEffect(() => {
    fetchNotifications();
    // Poll for new notifications in local storage
    const interval = setInterval(fetchNotifications, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = () => {
    try {
      const rawNotifications = JSON.parse(localStorage.getItem('waste_notifications') || '[]');
      const mapped = rawNotifications.map(n => ({
        id: n.id,
        bin_id: n.binId,
        community_name: n.communityName,
        bin_name: n.binName,
        message: n.message,
        level: n.level,
        is_read: n.isRead,
        created_at: n.createdAt,
        acknowledged_at: n.acknowledgedAt
      }));
      setNotifications(mapped);
      setUnreadCount(mapped.filter(n => !n.is_read).length);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  };

  const handleAcknowledge = (notificationId) => {
    try {
      const rawNotifications = JSON.parse(localStorage.getItem('waste_notifications') || '[]');
      const targetIdx = rawNotifications.findIndex(n => n.id === notificationId);
      if (targetIdx !== -1) {
        rawNotifications[targetIdx] = {
          ...rawNotifications[targetIdx],
          isRead: true,
          acknowledgedAt: new Date().toISOString()
        };
        localStorage.setItem('waste_notifications', JSON.stringify(rawNotifications));
        fetchNotifications();
        setExpandedId(null);
      }
    } catch (err) {
      console.error('Failed to acknowledge notification:', err);
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="admin-notification-panel">
      <div className="notification-header">
        <h3>Bin Alerts</h3>
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount}</span>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="notification-empty">
          <p>All bins operating normally</p>
        </div>
      ) : (
        <div className="notification-list">
          {notifications.map(notif => (
            <div
              key={notif.id}
              className={`notification-item ${!notif.is_read ? 'unread' : 'read'}`}
            >
              <div
                className="notification-summary"
                onClick={() => setExpandedId(expandedId === notif.id ? null : notif.id)}
              >
                <div className="notification-icon" style={{ background: 'var(--alert)' }}>
                  ⚠
                </div>
                <div className="notification-info">
                  <div className="notification-title">
                    {notif.community_name} — {notif.bin_name}
                  </div>
                  <div className="notification-time">
                    {formatTime(notif.created_at)}
                  </div>
                </div>
              </div>

              {expandedId === notif.id && (
                <div className="notification-details">
                  <p>{notif.message}</p>
                  {!notif.is_read && (
                    <button
                        type="button"
                      className="primary-button"
                      onClick={() => handleAcknowledge(notif.id)}
                      style={{ width: '100%' }}
                    >
                      Acknowledge
                    </button>
                  )}
                  {notif.is_read && (
                    <p style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        ✓ Acknowledged{notif.acknowledged_at ? ` at ${new Date(notif.acknowledged_at).toLocaleString()}` : ''}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
