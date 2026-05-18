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
  const alertCounterRef = useRef(1);

  const eventGroups = useMemo(() => ({
    ALL: () => true,
    CONTROL: (event) => ['SIMULATION_STARTED', 'SIMULATION_STOPPED', 'MANUAL_SET'].includes(event.type),
    SETTINGS: (event) => ['SETTINGS_CHANGED'].includes(event.type),
    STATUS: (event) => ['LEVEL_UPDATE', 'ALERT_TRIGGERED', 'BIN_EMPTIED'].includes(event.type),
    ALERTS: (event) => ['ALERT_TRIGGERED'].includes(event.type)
  }), []);

  useEffect(() => {
    let closedManually = false;

    const connect = () => {
      setConnectionStatus('CONNECTING');
      const socket = new WebSocket(getWebSocketUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        setConnectionStatus('CONNECTED');
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'STATE_UPDATE') {
            setSimulatorState(message.data);
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
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

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

  return (
    <div className="app-shell">
      <div className="ambient-frame" aria-hidden="true" />

      <header className="topbar">
        <div>
          <p className="eyebrow">Waste Level Monitoring Simulator</p>
          <h1>Watch one bin behave like a live system.</h1>
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

      <main className="layout-grid">
        <section className="panel hero-panel">
          <BinVisualizer state={simulatorState} />
        </section>

        <section className="panel controls-panel">
          <ControlPanel state={simulatorState} onSendCommand={sendCommand} />
        </section>

        <section className="panel status-panel-wrap">
          <StatusPanel state={simulatorState} connectionStatus={connectionStatus} />
        </section>

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
