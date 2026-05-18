import { useEffect, useMemo, useRef, useState } from 'react';
import BinVisualizer from './components/BinVisualizer';
import ControlPanel from './components/ControlPanel';
import StatusPanel from './components/StatusPanel';
import HistoryPanel from './components/HistoryPanel';
import AlertNotification from './components/AlertNotification';

const createFallbackState = () => ({
  binId: 'BIN-001',
  location: 'Zone 1',
  currentLevel: 42,
  maxCapacity: 100,
  alertThreshold: 80,
  fillRate: 5,
  isRunning: false,
  lastUpdate: new Date().toISOString(),
  status: 'NORMAL',
  events: [],
  emptyCount: 0,
  alertCount: 0,
  clientCount: 0
});

function getWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = import.meta.env.VITE_WS_HOST || `${window.location.hostname}:5000`;
  return import.meta.env.VITE_WS_URL || `${protocol}//${host}`;
}

function getApiBaseUrl() {
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const host = import.meta.env.VITE_API_HOST || `${window.location.hostname}:5000`;
  return import.meta.env.VITE_API_URL || `${protocol}//${host}`;
}

function getStateSignature(state) {
  const events = Array.isArray(state?.events) ? state.events : [];
  const latestEvent = events[0];

  return [
    state?.lastUpdate || '',
    state?.currentLevel ?? '',
    state?.status || '',
    state?.fillRate ?? '',
    state?.alertThreshold ?? '',
    latestEvent?.id ?? 0,
    events.length
  ].join('|');
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export default function App() {
  const [simulatorState, setSimulatorState] = useState(createFallbackState());
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING');
  const [alerts, setAlerts] = useState([]);
  const [activeEventFilter, setActiveEventFilter] = useState('ALL');
  const [eventSortOrder, setEventSortOrder] = useState('DESC');
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const syncTimerRef = useRef(null);
  const lastSnapshotRef = useRef('');
  const alertCounterRef = useRef(1);
  const apiBaseUrl = getApiBaseUrl();

  const eventGroups = useMemo(() => ({
    ALL: () => true,
    CONTROL: (event) => ['SIMULATION_STARTED', 'SIMULATION_STOPPED', 'MANUAL_SET'].includes(event.type),
    SETTINGS: (event) => ['SETTINGS_CHANGED'].includes(event.type),
    STATUS: (event) => ['LEVEL_UPDATE', 'ALERT_TRIGGERED', 'BIN_EMPTIED'].includes(event.type),
    ALERTS: (event) => ['ALERT_TRIGGERED'].includes(event.type)
  }), []);

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
        const response = await fetch(`${apiBaseUrl}/api/state`, {
          cache: 'no-store'
        });

        if (!response.ok) {
          return;
        }

        const nextState = await response.json();
        const nextSignature = getStateSignature(nextState);

        if (nextSignature !== lastSnapshotRef.current) {
          lastSnapshotRef.current = nextSignature;
          setSimulatorState(nextState);
        }
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

          if (message.type === 'STATE_UPDATE') {
            setSimulatorState(message.data);
            lastSnapshotRef.current = getStateSignature(message.data);
          }

          if (message.type === 'EVENT_ADDED') {
            const nextEvent = message.data;
            if (nextEvent.type === 'ALERT_TRIGGERED') {
              const alertId = alertCounterRef.current++;
              setAlerts((currentAlerts) => [
                {
                  id: alertId,
                  title: 'Alert triggered',
                  message: nextEvent.message,
                  level: nextEvent.level,
                  timestamp: nextEvent.timestamp
                },
                ...currentAlerts
              ].slice(0, 5));
            }
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

  const sendCommand = (message) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(message));
  };

  const removeAlert = (alertId) => {
    setAlerts((currentAlerts) => currentAlerts.filter((alert) => alert.id !== alertId));
  };

  const filteredEvents = useMemo(() => {
    const events = [...simulatorState.events];
    const filterPredicate = eventGroups[activeEventFilter] || eventGroups.ALL;
    const visibleEvents = events.filter(filterPredicate);

    return eventSortOrder === 'ASC' ? visibleEvents.reverse() : visibleEvents;
  }, [activeEventFilter, eventGroups, eventSortOrder, simulatorState.events]);

  const overviewCards = useMemo(() => ([
    {
      label: 'Current level',
      value: `${simulatorState.currentLevel.toFixed(1)}%`,
      note: simulatorState.status === 'ALERT' ? 'At or above threshold' : 'Live from the backend'
    },
    {
      label: 'Operating mode',
      value: simulatorState.isRunning ? 'Auto' : 'Paused',
      note: connectionStatus === 'CONNECTED' ? 'Realtime stream active' : 'Polling fallback active'
    },
    {
      label: 'Alerts',
      value: simulatorState.alertCount.toString(),
      note: simulatorState.status === 'ALERT' ? 'Action required' : 'Nominal'
    },
    {
      label: 'Event log',
      value: simulatorState.events.length.toString(),
      note: 'Persisted to SQLite'
    }
  ]), [connectionStatus, simulatorState.alertCount, simulatorState.currentLevel, simulatorState.events.length, simulatorState.isRunning, simulatorState.status]);

  return (
    <div className="app-shell">
      <div className="ambient-frame" aria-hidden="true" />

      <header className="dashboard-header">
        <div className="hero-copy-block">
          <p className="eyebrow">Waste level monitoring</p>
          <h1>Realtime bin operations in one glance.</h1>
          <p className="hero-description">
            Monitor live state, accept external updates, and keep the system history readable.
          </p>
        </div>

        <div className="status-cluster">
          <span className={`connection-pill ${connectionStatus.toLowerCase()}`}>
            {connectionStatus}
          </span>
          <span className={`status-pill status-${simulatorState.status.toLowerCase()}`}>
            {simulatorState.status}
          </span>
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
        <section className="panel hero-panel">
          <BinVisualizer state={simulatorState} />
        </section>

        <div className="sidebar-stack">
          <section className="panel controls-panel">
            <ControlPanel state={simulatorState} onSendCommand={sendCommand} />
          </section>

          <section className="panel status-panel-wrap">
            <StatusPanel state={simulatorState} connectionStatus={connectionStatus} />
          </section>
        </div>

        <section className="panel history-panel-wrap">
          <HistoryPanel
            events={filteredEvents}
            filter={activeEventFilter}
            sortOrder={eventSortOrder}
            onFilterChange={setActiveEventFilter}
            onSortChange={setEventSortOrder}
            formatTimestamp={formatTimestamp}
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
