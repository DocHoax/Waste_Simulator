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

function getStoredBins(user) {
  const binsJson = localStorage.getItem('waste_bins');
  if (binsJson) {
    return JSON.parse(binsJson);
  }
  
  // Seed initial bins
  const seedBins = [
    {
      id: 1,
      userId: user?.id || 'user-admin-id',
      communityName: 'Downtown Area',
      binName: 'BIN-001',
      location: 'Main St & 4th Ave',
      currentLevel: 45.5,
      maxCapacity: 100,
      alertThreshold: 80,
      fillRate: 8.5,
      isRunning: true,
      status: 'NORMAL',
      emptyCount: 2,
      alertCount: 1,
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 2,
      userId: user?.id || 'user-admin-id',
      communityName: 'Greenwood Park',
      binName: 'BIN-002',
      location: 'Central Pavilion',
      currentLevel: 82.0,
      maxCapacity: 100,
      alertThreshold: 75,
      fillRate: 4.0,
      isRunning: false,
      status: 'WARNING',
      emptyCount: 1,
      alertCount: 2,
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 3,
      userId: 'user-other-id',
      communityName: 'North Suburb',
      binName: 'BIN-003',
      location: 'Community Center',
      currentLevel: 15.0,
      maxCapacity: 100,
      alertThreshold: 80,
      fillRate: 5.0,
      isRunning: true,
      status: 'NORMAL',
      emptyCount: 0,
      alertCount: 0,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
  localStorage.setItem('waste_bins', JSON.stringify(seedBins));
  return seedBins;
}

function logEvent(bin, type, message, level, userId) {
  const events = JSON.parse(localStorage.getItem('waste_events') || '[]');
  const newEvent = {
    id: Date.now() + Math.random(),
    binId: bin.id,
    communityName: bin.communityName,
    binName: bin.binName,
    type,
    level,
    message,
    timestamp: new Date().toISOString(),
    userId
  };
  events.unshift(newEvent);
  localStorage.setItem('waste_events', JSON.stringify(events.slice(0, 1000)));
  return events.slice(0, 1000);
}

function logNotification(bin, message) {
  const notifications = JSON.parse(localStorage.getItem('waste_notifications') || '[]');
  const newNotification = {
    id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    binId: bin.id,
    communityName: bin.communityName,
    binName: bin.binName,
    message,
    level: bin.currentLevel,
    isRead: false,
    createdAt: new Date().toISOString()
  };
  notifications.unshift(newNotification);
  localStorage.setItem('waste_notifications', JSON.stringify(notifications.slice(0, 200)));
  return {
    notifications: notifications.slice(0, 200),
    newNotification
  };
}

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const [simulatorState, setSimulatorState] = useState(createFallbackState());
  const [connectionStatus, setConnectionStatus] = useState('CONNECTED');
  const [alerts, setAlerts] = useState([]);
  const [activeEventFilter, setActiveEventFilter] = useState('ALL');
  const [eventSortOrder, setEventSortOrder] = useState('DESC');
  const [adminMode, setAdminMode] = useState(() => window.localStorage.getItem('waste-admin-mode') === 'true');
  const [adminName, setAdminName] = useState(() => window.localStorage.getItem('waste-admin-name') || user?.username || 'Local Admin');
  const alertCounterRef = useRef(1);

  // Helper to load current filtered state from localStorage
  const loadLocalState = () => {
    if (!user) return;
    
    // Get master records
    const allBins = getStoredBins(user);
    const allEvents = JSON.parse(localStorage.getItem('waste_events') || '[]');
    const allNotifications = JSON.parse(localStorage.getItem('waste_notifications') || '[]');
    
    // Filter based on role
    const isSuper = user.role === 'super_admin';
    const userBins = isSuper ? allBins : allBins.filter(b => b.userId === user.id);
    const userEvents = isSuper ? allEvents : allEvents.filter(e => {
      const bin = allBins.find(b => b.id === e.binId);
      return bin && bin.userId === user.id;
    });
    const userNotifications = isSuper ? allNotifications : allNotifications.filter(n => {
      const bin = allBins.find(b => b.id === n.binId);
      return bin && bin.userId === user.id;
    });
    
    // Determine selected bin ID
    let selectedBinId = localStorage.getItem('waste_selected_bin_id');
    if (selectedBinId) {
      selectedBinId = Number(selectedBinId);
    }
    
    // Fallback if selected bin is missing or not authorized
    if (!selectedBinId || !userBins.some(b => b.id === selectedBinId)) {
      selectedBinId = userBins[0]?.id || null;
    }
    
    const selectedBin = userBins.find(b => b.id === selectedBinId) || null;
    
    const normalized = normalizeState({
      bins: userBins,
      selectedBinId,
      selectedBin,
      notifications: userNotifications,
      events: userEvents,
      unreadNotificationCount: userNotifications.filter(n => !n.isRead).length,
      totalBins: userBins.length,
      activeCommunities: new Set(userBins.map(b => b.communityName)).size,
      runningBinsCount: userBins.filter(b => b.isRunning).length,
      clientCount: 1
    });
    
    setSimulatorState(normalized);
  };

  // Sync settings when admin options change
  useEffect(() => {
    window.localStorage.setItem('waste-admin-mode', String(adminMode));
    window.localStorage.setItem('waste-admin-name', adminName.trim() || 'Local Admin');
  }, [adminMode, adminName]);

  // Initial load
  useEffect(() => {
    loadLocalState();
  }, [user]);

  // Simulation timer client-side
  useEffect(() => {
    if (!user) return;
    
    const timer = setInterval(() => {
      const allBins = getStoredBins(user);
      let stateChanged = false;
      
      const updatedBins = allBins.map(bin => {
        if (!bin.isRunning) return bin;
        
        // Tick increment: fillRate is % per minute. Tick is every 3 seconds (3/60 = 0.05 minutes)
        const increment = bin.fillRate * (3000 / 60000);
        const previousLevel = bin.currentLevel;
        const nextLevel = Math.min(bin.maxCapacity, bin.currentLevel + increment);
        
        if (nextLevel === previousLevel) return bin;
        
        stateChanged = true;
        
        // Determine status
        let status = 'NORMAL';
        if (nextLevel >= bin.maxCapacity) {
          status = 'ALERT';
        } else if (nextLevel >= bin.alertThreshold) {
          status = 'WARNING';
        }
        
        const updatedBin = {
          ...bin,
          currentLevel: Math.round(nextLevel * 10) / 10,
          status,
          updatedAt: new Date().toISOString()
        };
        
        // Alert triggers if it just reached max capacity
        if (nextLevel >= bin.maxCapacity && previousLevel < bin.maxCapacity) {
          updatedBin.alertCount += 1;
          
          // Log notification
          const msg = `Bin ${bin.binName} is FULL`;
          const notifResult = logNotification(updatedBin, `Bin ${bin.binName} in ${bin.communityName} has reached capacity and needs emptying.`);
          
          // Log event
          logEvent(updatedBin, 'BIN_FULL', `Alert: Bin ${bin.binName} reached 100% capacity`, bin.maxCapacity, bin.userId);
          
          // Trigger local toast alert (only if this bin belongs to user or user is super admin)
          const isSuper = user.role === 'super_admin';
          if (isSuper || bin.userId === user.id) {
            const alertId = alertCounterRef.current++;
            setAlerts((currentAlerts) => [
              {
                id: alertId,
                title: `${bin.binName} needs attention`,
                message: `Bin ${bin.binName} in ${bin.communityName} has reached capacity and needs emptying.`,
                communityName: bin.communityName,
                binName: bin.binName,
                level: bin.maxCapacity,
                timestamp: new Date().toISOString()
              },
              ...currentAlerts
            ].slice(0, 5));
          }
        } else if (status !== bin.status) {
          // Log status transition event
          if (status === 'WARNING') {
            logEvent(updatedBin, 'BIN_WARNING', `Warning: Bin ${bin.binName} level is high (${updatedBin.currentLevel}%)`, updatedBin.currentLevel, bin.userId);
          } else if (status === 'NORMAL' && bin.status === 'WARNING') {
            logEvent(updatedBin, 'BIN_NORMAL', `Info: Bin ${bin.binName} returned to normal`, updatedBin.currentLevel, bin.userId);
          }
        }
        
        return updatedBin;
      });
      
      if (stateChanged) {
        localStorage.setItem('waste_bins', JSON.stringify(updatedBins));
        loadLocalState();
      }
    }, 3000);
    
    return () => clearInterval(timer);
  }, [user]);

  const selectedBin = simulatorState.selectedBin;

  const sendCommand = async (message) => {
    if (!selectedBin || !user) return;
    
    const allBins = getStoredBins(user);
    const targetIdx = allBins.findIndex(b => b.id === selectedBin.id);
    if (targetIdx === -1) return;
    
    let currentBin = { ...allBins[targetIdx] };
    
    if (message.type === 'START') {
      currentBin.isRunning = true;
      currentBin.updatedAt = new Date().toISOString();
      allBins[targetIdx] = currentBin;
      localStorage.setItem('waste_bins', JSON.stringify(allBins));
      
      logEvent(currentBin, 'SIMULATION_STARTED', `Simulation started for Bin ${currentBin.binName} (Fill rate: ${currentBin.fillRate}%/min)`, currentBin.currentLevel, user.id);
    } 
    else if (message.type === 'STOP') {
      currentBin.isRunning = false;
      currentBin.updatedAt = new Date().toISOString();
      allBins[targetIdx] = currentBin;
      localStorage.setItem('waste_bins', JSON.stringify(allBins));
      
      logEvent(currentBin, 'SIMULATION_STOPPED', `Simulation stopped for Bin ${currentBin.binName}`, currentBin.currentLevel, user.id);
    } 
    else if (message.type === 'RESET') {
      currentBin.isRunning = false;
      currentBin.currentLevel = 0;
      currentBin.status = 'NORMAL';
      currentBin.emptyCount += 1;
      currentBin.updatedAt = new Date().toISOString();
      allBins[targetIdx] = currentBin;
      localStorage.setItem('waste_bins', JSON.stringify(allBins));
      
      logEvent(currentBin, 'BIN_EMPTIED', `Bin ${currentBin.binName} was emptied and reset to 0%`, 0, user.id);
    } 
    else if (message.type === 'DELETE') {
      if (user.role !== 'super_admin') return;
      
      const nextBins = allBins.filter(b => b.id !== selectedBin.id);
      localStorage.setItem('waste_bins', JSON.stringify(nextBins));
      
      // Log event
      logEvent(selectedBin, 'BIN_DELETED', `Bin ${selectedBin.binName} was deleted`, selectedBin.currentLevel, user.id);
      
      const fallbackSelectedBin = nextBins[0] || null;
      if (fallbackSelectedBin) {
        localStorage.setItem('waste_selected_bin_id', String(fallbackSelectedBin.id));
      } else {
        localStorage.removeItem('waste_selected_bin_id');
      }
    } 
    else if (message.type === 'SET_LEVEL') {
      const level = Math.min(currentBin.maxCapacity, Math.max(0, message.level));
      currentBin.currentLevel = Math.round(level * 10) / 10;
      
      let status = 'NORMAL';
      if (currentBin.currentLevel >= currentBin.maxCapacity) {
        status = 'ALERT';
      } else if (currentBin.currentLevel >= currentBin.alertThreshold) {
        status = 'WARNING';
      }
      
      currentBin.status = status;
      currentBin.updatedAt = new Date().toISOString();
      allBins[targetIdx] = currentBin;
      localStorage.setItem('waste_bins', JSON.stringify(allBins));
      
      logEvent(currentBin, 'MANUAL_SET', `Level set manually to ${currentBin.currentLevel}%`, currentBin.currentLevel, user.id);
    }
    else if (message.type === 'SET_FILL_RATE') {
      const rate = Math.min(100, Math.max(0, message.rate));
      currentBin.fillRate = Math.round(rate * 10) / 10;
      currentBin.updatedAt = new Date().toISOString();
      allBins[targetIdx] = currentBin;
      localStorage.setItem('waste_bins', JSON.stringify(allBins));
      
      logEvent(currentBin, 'SETTINGS_CHANGED', `Fill rate updated to ${currentBin.fillRate}%/min`, currentBin.currentLevel, user.id);
    }
    else if (message.type === 'SET_ALERT_THRESHOLD') {
      const threshold = Math.min(100, Math.max(1, message.threshold));
      currentBin.alertThreshold = Math.round(threshold * 10) / 10;
      
      let status = 'NORMAL';
      if (currentBin.currentLevel >= currentBin.maxCapacity) {
        status = 'ALERT';
      } else if (currentBin.currentLevel >= currentBin.alertThreshold) {
        status = 'WARNING';
      }
      
      currentBin.status = status;
      currentBin.updatedAt = new Date().toISOString();
      allBins[targetIdx] = currentBin;
      localStorage.setItem('waste_bins', JSON.stringify(allBins));
      
      logEvent(currentBin, 'SETTINGS_CHANGED', `Alert threshold updated to ${currentBin.alertThreshold}%`, currentBin.currentLevel, user.id);
    }
    
    loadLocalState();
  };

  const handleCreateBin = async (binPayload) => {
    if (!user) return null;
    
    const allBins = getStoredBins(user);
    
    // Generate new unique ID
    const maxId = allBins.reduce((max, b) => b.id > max ? b.id : max, 0);
    const newBin = {
      id: maxId + 1,
      userId: user.id,
      communityName: binPayload.communityName || user.communityName || 'Community',
      binName: binPayload.binName,
      location: binPayload.location,
      currentLevel: binPayload.currentLevel || 0,
      maxCapacity: binPayload.maxCapacity || 100,
      alertThreshold: binPayload.alertThreshold || 80,
      fillRate: binPayload.fillRate || 5,
      isRunning: binPayload.isRunning || false,
      status: 'NORMAL',
      emptyCount: 0,
      alertCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    allBins.unshift(newBin);
    localStorage.setItem('waste_bins', JSON.stringify(allBins));
    localStorage.setItem('waste_selected_bin_id', String(newBin.id));
    
    logEvent(newBin, 'BIN_CREATED', `New Bin ${newBin.binName} registered for community ${newBin.communityName}`, newBin.currentLevel, user.id);
    
    loadLocalState();
    return newBin;
  };

  const handleSelectBin = async (binId) => {
    localStorage.setItem('waste_selected_bin_id', String(binId));
    loadLocalState();
  };

  const handleAcknowledgeNotification = async (notificationId) => {
    if (!adminMode) {
      throw new Error('Switch on admin mode to acknowledge alerts.');
    }
    
    const allNotifications = JSON.parse(localStorage.getItem('waste_notifications') || '[]');
    const targetIdx = allNotifications.findIndex(n => n.id === notificationId);
    if (targetIdx === -1) return;
    
    const targetNotif = allNotifications[targetIdx];
    allNotifications[targetIdx] = {
      ...targetNotif,
      isRead: true,
      acknowledgedAt: new Date().toISOString()
    };
    
    localStorage.setItem('waste_notifications', JSON.stringify(allNotifications));
    
    // Log event about acknowledgment
    const allBins = getStoredBins(user);
    const bin = allBins.find(b => b.id === targetNotif.binId) || { id: targetNotif.binId, binName: targetNotif.binName, communityName: targetNotif.communityName, currentLevel: targetNotif.level, userId: user.id };
    logEvent(bin, 'NOTIFICATION_ACKNOWLEDGED', `Alert acknowledged by ${adminName}`, targetNotif.level, user.id);
    
    loadLocalState();
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
