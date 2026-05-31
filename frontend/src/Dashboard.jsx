import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './context/AuthContext';
import BinVisualizer from './components/BinVisualizer';
import ControlPanel from './components/ControlPanel';
import StatusPanel from './components/StatusPanel';
import HistoryPanel from './components/HistoryPanel';
import AlertNotification from './components/AlertNotification';
import CommunityBinForm from './components/CommunityBinForm';
import BinDirectory from './components/BinDirectory';
import NotificationPanel from './components/NotificationPanel';
import AdminNotificationPanel from './components/AdminNotificationPanel';

const DEFAULT_LOCAL_API_PORT = import.meta.env.VITE_LOCAL_API_PORT || '5051';
const RENDER_API_URL = 'https://waste-simulator-backend.onrender.com';
const RENDER_WS_URL = 'wss://waste-simulator-backend.onrender.com';

function createFallbackState() {
  return {
    bins: [],
    selectedBinId: null,
    selectedBin: null,
    notifications: [],
    unreadNotificationCount: 0,
    events: [],
    totalBins: 0,
    activeCommunities: 0,
    runningBinsCount: 0,
    clientCount: 0
  };
}

function getWebSocketUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  if (import.meta.env.PROD) {
    return RENDER_WS_URL;
  }

  return `ws://localhost:${DEFAULT_LOCAL_API_PORT}`;
}

function getApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  if (import.meta.env.PROD) {
    return RENDER_API_URL;
  }

  return `http://localhost:${DEFAULT_LOCAL_API_PORT}`;
}

function normalizeState(state) {
  const bins = Array.isArray(state?.bins) ? state.bins : [];
  const notifications = Array.isArray(state?.notifications) ? state.notifications : [];
  const events = Array.isArray(state?.events) ? state.events : [];
  const selectedBin = state?.selectedBin || bins.find((bin) => bin.id === state?.selectedBinId) || bins[0] || null;
  const unreadNotificationCount = Number.isFinite(state?.unreadNotificationCount)
    ? state.unreadNotificationCount
    : notifications.filter((notification) => !notification.isRead).length;

  return {
    ...state,
    bins,
    notifications,
    events,
    selectedBin,
    selectedBinId: selectedBin?.id ?? state?.selectedBinId ?? null,
    unreadNotificationCount,
    totalBins: Number.isFinite(state?.totalBins) ? state.totalBins : bins.length,
    activeCommunities: Number.isFinite(state?.activeCommunities)
      ? state.activeCommunities
      : new Set(bins.map((bin) => bin.communityName)).size,
    runningBinsCount: Number.isFinite(state?.runningBinsCount)
      ? state.runningBinsCount
      : bins.filter((bin) => bin.isRunning).length,
    clientCount: Number.isFinite(state?.clientCount) ? state.clientCount : 0
  };
}

function getStateSignature(state) {
  const bins = Array.isArray(state?.bins) ? state.bins : [];
  const notifications = Array.isArray(state?.notifications) ? state.notifications : [];
  const events = Array.isArray(state?.events) ? state.events : [];
  const selectedBin = state?.selectedBin || null;

  return [
    state?.selectedBinId ?? '',
    bins.length,
    state?.unreadNotificationCount ?? 0,
    notifications.length,
    notifications[0]?.isRead ? 1 : 0,
    notifications[0]?.id ?? 0,
    events.length,
    events[0]?.id ?? 0,
    state?.runningBinsCount ?? 0,
    selectedBin?.updatedAt ?? '',
    selectedBin?.currentLevel ?? '',
    selectedBin?.status ?? ''
  ].join('|');
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function eventMatchesFilter(event, filter) {
  switch (filter) {
    case 'CONTROL':
      return ['BIN_CREATED', 'BIN_SELECTED', 'SIMULATION_STARTED', 'SIMULATION_STOPPED', 'MANUAL_SET', 'BIN_EMPTIED'].includes(event.type);
    case 'SETTINGS':
      return ['SETTINGS_CHANGED'].includes(event.type);
    case 'STATUS':
      return ['LEVEL_UPDATE', 'REALTIME_DATA_ACCEPTED', 'BIN_WARNING', 'BIN_NORMAL'].includes(event.type);
    case 'ALERTS':
      return ['BIN_FULL', 'NOTIFICATION_ACKNOWLEDGED'].includes(event.type);
    default:
      return true;
  }
}

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const [simulatorState, setSimulatorState] = useState(createFallbackState());
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING');
  const [alerts, setAlerts] = useState([]);
  const [activeEventFilter, setActiveEventFilter] = useState('ALL');
  const [eventSortOrder, setEventSortOrder] = useState('DESC');
  const [hasInitialSync, setHasInitialSync] = useState(false);
  const [adminMode, setAdminMode] = useState(() => window.localStorage.getItem('waste-admin-mode') === 'true');
  const [adminName, setAdminName] = useState(() => window.localStorage.getItem('waste-admin-name') || user?.username || 'Local Admin');
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const syncTimerRef = useRef(null);
  const lastSnapshotRef = useRef('');
  const alertCounterRef = useRef(1);
  const apiBaseUrl = getApiBaseUrl();

  const applyServerState = (nextState) => {
    const normalized = normalizeState(nextState);
    const nextSignature = getStateSignature(normalized);
    setHasInitialSync(true);

    if (nextSignature !== lastSnapshotRef.current) {
      lastSnapshotRef.current = nextSignature;
      setSimulatorState(normalized);
    }
  };

  useEffect(() => {
    window.localStorage.setItem('waste-admin-mode', String(adminMode));
    window.localStorage.setItem('waste-admin-name', adminName.trim() || 'Local Admin');
  }, [adminMode, adminName]);

  useEffect(() => {
    let closedManually = false;

    const stopPolling = () => {
      if (syncTimerRef.current) {
        window.clearInterval(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };

    const syncStateFromServer = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/bins`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        const newState = {
          ...simulatorState,
          bins: data.bins || [],
          totalBins: (data.bins || []).length,
          activeCommunities: new Set((data.bins || []).map(b => b.communityName)).size,
          runningBinsCount: (data.bins || []).filter(b => b.isRunning).length
        };
        applyServerState(newState);
      } catch (error) {
        console.error('State sync failed', error);
      }
    };

    const startPolling = () => {
      if (!syncTimerRef.current) {
        syncTimerRef.current = window.setInterval(syncStateFromServer, 3000);
      }
    };

    const connect = () => {
      setConnectionStatus('CONNECTING');
      const socket = new WebSocket(getWebSocketUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        setConnectionStatus('CONNECTED');
        stopPolling();
        syncStateFromServer();
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'APP_STATE_UPDATE' || message.type === 'STATE_UPDATE') {
            applyServerState(message.data);
          }

          if (message.type === 'NOTIFICATION_ADDED' || message.type === 'ADMIN_NOTIFICATION') {
            const notification = message.data;
            const alertId = alertCounterRef.current++;
            setAlerts((currentAlerts) => [
              {
                id: alertId,
                title: `${notification.binName} needs attention`,
                message: notification.message,
                communityName: notification.communityName,
                binName: notification.binName,
                level: notification.level,
                timestamp: notification.createdAt
              },
              ...currentAlerts
            ].slice(0, 5));
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message', error);
        }
      };

      socket.onclose = () => {
        setConnectionStatus('DISCONNECTED');
        if (!closedManually) {
          startPolling();
          reconnectTimerRef.current = window.setTimeout(connect, 2000);
        }
      };

      socket.onerror = () => {
        setConnectionStatus('ERROR');
      };
    };

    connect();

    return () => {
      closedManually = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      stopPolling();
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [apiBaseUrl]);

  const selectedBin = simulatorState.selectedBin || simulatorState.bins.find((bin) => bin.id === simulatorState.selectedBinId) || null;

  const mutateState = async (url, options = {}) => {
    const { headers: optionHeaders = {}, ...restOptions } = options;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...optionHeaders
      },
      ...restOptions
    });

    const payload = await response.json();

    if (payload?.state) {
      applyServerState(payload.state);
    }

    if (!response.ok) {
      throw new Error(payload?.message || 'Request failed.');
    }

    return payload;
  };

  const sendCommand = async (message) => {
    if (!selectedBin) {
      return;
    }

    const commandMap = {
      START: `/api/bins/${selectedBin.id}/control/start`,
      STOP: `/api/bins/${selectedBin.id}/control/stop`,
      RESET: `/api/bins/${selectedBin.id}/control/reset`,
      DELETE: `/api/bins/${selectedBin.id}`,
      SET_LEVEL: `/api/bins/${selectedBin.id}/control/set-level`,
      SET_FILL_RATE: `/api/bins/${selectedBin.id}/control/set-fill-rate`,
      SET_ALERT_THRESHOLD: `/api/bins/${selectedBin.id}/control/set-alert-threshold`
    };

    const endpoint = commandMap[message.type];

    if (!endpoint) {
      return;
    }

    const body = {};

    if (message.type === 'SET_LEVEL') {
      body.level = message.level;
    }

    if (message.type === 'SET_FILL_RATE') {
      body.rate = message.rate;
    }

    if (message.type === 'SET_ALERT_THRESHOLD') {
      body.threshold = message.threshold;
    }

    const method = message.type === 'DELETE' ? 'DELETE' : 'POST';

    await mutateState(`${apiBaseUrl}${endpoint}`, {
      method,
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined
    });

    if (message.type === 'DELETE') {
      setSimulatorState((currentState) => {
        const nextBins = (currentState.bins || []).filter((bin) => bin.id !== selectedBin.id);
        const fallbackSelectedBin = nextBins[0] || null;
        const nextState = normalizeState({
          ...currentState,
          bins: nextBins,
          selectedBinId: fallbackSelectedBin?.id ?? null,
          selectedBin: fallbackSelectedBin,
          totalBins: nextBins.length,
          activeCommunities: new Set(nextBins.map((bin) => bin.communityName)).size,
          runningBinsCount: nextBins.filter((bin) => bin.isRunning).length
        });

        lastSnapshotRef.current = getStateSignature(nextState);
        return nextState;
      });
    }
  };

  const handleCreateBin = async (binPayload) => {
    const payload = await mutateState(`${apiBaseUrl}/api/bins`, {
      method: 'POST',
      body: JSON.stringify(binPayload)
    });

    if (payload?.bin) {
      setSimulatorState((currentState) => {
        const existingBins = Array.isArray(currentState.bins) ? currentState.bins : [];
        const nextBins = [payload.bin, ...existingBins.filter((bin) => bin.id !== payload.bin.id)];
        const nextState = normalizeState({
          ...currentState,
          bins: nextBins,
          selectedBinId: currentState.selectedBinId ?? payload.bin.id,
          selectedBin: currentState.selectedBin ?? payload.bin,
          totalBins: nextBins.length,
          activeCommunities: new Set(nextBins.map((bin) => bin.communityName)).size,
          runningBinsCount: nextBins.filter((bin) => bin.isRunning).length
        });

        lastSnapshotRef.current = getStateSignature(nextState);
        return nextState;
      });
    }

    return payload?.bin || null;
  };

  const handleSelectBin = async (binId) => {
    await mutateState(`${apiBaseUrl}/api/bins/${binId}/select`, {
      method: 'POST'
    });
  };

  const handleAcknowledgeNotification = async (notificationId) => {
    if (!adminMode) {
      throw new Error('Switch on admin mode to acknowledge alerts.');
    }

    await mutateState(`${apiBaseUrl}/api/notifications/${notificationId}/acknowledge`, {
      method: 'POST',
      headers: {
        'X-Admin-Mode': 'true',
        'X-Admin-Name': adminName.trim() || 'Local Admin'
      }
    });
  };

  const removeAlert = (alertId) => {
    setAlerts((currentAlerts) => currentAlerts.filter((alert) => alert.id !== alertId));
  };

  const filteredEvents = useMemo(() => {
    const visibleEvents = simulatorState.events.filter((event) => {
      if (selectedBin && event.binId !== selectedBin.id) {
        return false;
      }

      return eventMatchesFilter(event, activeEventFilter);
    });

    return eventSortOrder === 'ASC' ? [...visibleEvents].reverse() : visibleEvents;
  }, [activeEventFilter, eventSortOrder, selectedBin, simulatorState.events]);

  const overviewCards = useMemo(() => {
    const selectedLevel = selectedBin ? `${selectedBin.currentLevel.toFixed(1)} / ${selectedBin.maxCapacity.toFixed(1)}` : 'No bin selected';

    return [
      {
        label: 'Selected bin',
        value: selectedBin ? selectedBin.binName : 'Create one',
        note: selectedBin ? `${selectedBin.communityName} · ${selectedLevel}` : 'Start with a community bin'
      },
      {
        label: 'Communities',
        value: simulatorState.activeCommunities.toString(),
        note: 'Unique locations using the registry'
      },
      {
        label: 'Pending alerts',
        value: simulatorState.unreadNotificationCount.toString(),
        note: adminMode ? `Admin acknowledgments by ${adminName || 'Local Admin'}` : 'Enable admin mode to acknowledge alerts'
      },
      {
        label: 'Live bins',
        value: simulatorState.runningBinsCount.toString(),
        note: connectionStatus === 'CONNECTED' ? 'Realtime updates active' : 'Polling fallback active'
      }
    ];
  }, [connectionStatus, selectedBin, simulatorState.activeCommunities, simulatorState.runningBinsCount, simulatorState.unreadNotificationCount]);

  return (
    <div className="app-shell">
      <div className="ambient-frame" aria-hidden="true" />

      <header className="dashboard-header">
        <div className="hero-copy-block">
          <p className="eyebrow">Community waste registry</p>
          <h1>Public Waste Monitoring System</h1>
          <p className="hero-description">
            Oversee bin activity, maintain service coverage, and receive capacity alerts promptly.
          </p>
        </div>

        <div className="status-cluster">
          <div className="status-pills">
            <span className={`connection-pill ${connectionStatus.toLowerCase()}`}>
              {connectionStatus}
            </span>
            <span className={`status-pill status-${(selectedBin?.status || 'idle').toLowerCase()}`}>
              {selectedBin ? selectedBin.status : 'NO BIN'}
            </span>
          </div>

          <div className="account-cluster">
            <div className="account-summary">
              <div className="account-name">{user?.username}</div>
              <div className="account-community">{user?.community_name || 'System'}</div>
              <div className={`role-badge ${user?.role === 'super_admin' ? 'role-super-admin' : 'role-community-manager'}`}>
                {user?.role === 'super_admin' ? 'Super Admin' : 'Community Manager'}
              </div>
            </div>
            <button onClick={logout} className="secondary-button signout-button">
              Sign out
            </button>
          </div>

          <div className="admin-tools">
            <label className="admin-toggle">
              <input
                type="checkbox"
                checked={adminMode}
                onChange={(event) => setAdminMode(event.target.checked)}
              />
              <span>Admin mode</span>
            </label>
            <input
              type="text"
              className="admin-name-input"
              value={adminName}
              onChange={(event) => setAdminName(event.target.value)}
              placeholder="Local Admin"
              disabled={!adminMode}
            />
          </div>
        </div>
      </header>

      <section className="overview-strip" aria-label="Dashboard overview">
        {overviewCards.map((card) => (
          <article className="overview-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <p>{card.note}</p>
          </article>
        ))}
      </section>

      <main className="dashboard-grid">
        <aside className="left-column">
          <section className="panel form-panel">
            <CommunityBinForm onCreateBin={handleCreateBin} />
          </section>

          <section className="panel directory-panel">
            <BinDirectory
              bins={simulatorState.bins}
              selectedBinId={simulatorState.selectedBinId}
              onSelectBin={handleSelectBin}
            />
          </section>
        </aside>

        <section className="panel hero-panel">
          <BinVisualizer
            bins={simulatorState.bins}
            selectedBinId={simulatorState.selectedBinId}
            onSelectBin={handleSelectBin}
          />
        </section>

        <aside className="right-column">
          <section className="panel controls-panel">
            <ControlPanel state={selectedBin} onSendCommand={sendCommand} canDelete={user?.role === 'super_admin'} />
          </section>

          <section className="panel status-panel-wrap">
            <StatusPanel
              state={simulatorState}
              connectionStatus={connectionStatus}
              selectedBin={selectedBin}
            />
          </section>

          <section className="panel notifications-panel-wrap">
            <NotificationPanel
              notifications={simulatorState.notifications}
              unreadCount={simulatorState.unreadNotificationCount}
              onAcknowledge={handleAcknowledgeNotification}
              isAdminMode={adminMode}
              adminName={adminName}
            />
          </section>

          {user?.role === 'super_admin' && (
            <section className="panel notifications-panel-wrap">
              <AdminNotificationPanel />
            </section>
          )}
        </aside>

        <section className="panel history-panel-wrap">
          <HistoryPanel
            events={filteredEvents}
            filter={activeEventFilter}
            sortOrder={eventSortOrder}
            onFilterChange={setActiveEventFilter}
            onSortChange={setEventSortOrder}
            formatTimestamp={formatTimestamp}
            selectedBin={selectedBin}
          />
        </section>
      </main>

      <div className="alerts-stack" aria-live="polite">
        {alerts.map((alert) => (
          <AlertNotification key={alert.id} alert={alert} onDismiss={removeAlert} />
        ))}
      </div>
    </div>
  );
}
