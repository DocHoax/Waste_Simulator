import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const LOCAL_API_URL = 'http://localhost:5051';
const LOCAL_WS_URL = 'wss://localhost:5051';
const RENDER_API_URL = 'https://waste-simulator-backend.onrender.com';
const RENDER_WS_URL = 'wss://waste-simulator-backend.onrender.com';

function getApiUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  return import.meta.env.PROD ? RENDER_API_URL : LOCAL_API_URL;
}

function getWebSocketUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  return import.meta.env.PROD ? RENDER_WS_URL : LOCAL_WS_URL;
}

export default function AdminNotificationPanel() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const { token } = useAuth();

  // Fetch notifications on mount
  useEffect(() => {
    fetchNotifications();
    // Poll for new notifications
    const interval = setInterval(fetchNotifications, 5000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket for real-time updates
  useEffect(() => {
    const ws = new WebSocket(getWebSocketUrl());

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'ADMIN_NOTIFICATION') {
          // New notification arrived - refresh list
          fetchNotifications();
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };

    ws.onerror = (err) => console.error('WebSocket error:', err);
    return () => ws.close();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/notifications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  const handleAcknowledge = async (notificationId) => {
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/notifications/${notificationId}/acknowledge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        await fetchNotifications();
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
