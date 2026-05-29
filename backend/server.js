const express = require('express');
const http = require('http');
const cors = require('cors');
const WebSocket = require('ws');
const {
  hydrateStateFromDatabase,
  markNotificationAcknowledged,
  persistEvent,
  persistNewBin,
  persistNotification,
  persistSelectedBinId,
  persistBin,
  roundToOneDecimal
} = require('./db');

const PORT = Number(process.env.PORT || 5000);
const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 5000);
const MAX_EVENTS = 1000;
const MAX_NOTIFICATIONS = 200;

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nowIso() {
  return new Date().toISOString();
}

function getStatusForLevel(level, alertThreshold, maxCapacity) {
  if (level >= maxCapacity) {
    return 'ALERT';
  }

  if (level >= alertThreshold) {
    return 'WARNING';
  }

  return 'NORMAL';
}

function createInitialBins() {
  return [];
}

const hydration = hydrateStateFromDatabase(createInitialBins());
const appState = {
  bins: hydration.state.bins,
  selectedBinId: hydration.state.selectedBinId,
  notifications: hydration.state.notifications,
  unreadNotificationCount: hydration.state.unreadNotificationCount,
  events: hydration.state.events
};

let nextEventId = hydration.nextEventId;
const simulationIntervals = new Map();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const webSocketServer = new WebSocket.Server({ server });

function getSelectedBin() {
  return appState.bins.find((bin) => bin.id === appState.selectedBinId) || appState.bins[0] || null;
}

function getBinById(binId) {
  const numericBinId = Number(binId);
  return appState.bins.find((bin) => bin.id === numericBinId) || null;
}

function updateUnreadCount() {
  appState.unreadNotificationCount = appState.notifications.filter((notification) => !notification.isRead).length;
}

function trimArray(list, maximumLength) {
  while (list.length > maximumLength) {
    list.pop();
  }
}

function serializeState() {
  const selectedBin = getSelectedBin();

  return {
    bins: appState.bins,
    selectedBinId: appState.selectedBinId,
    selectedBin,
    notifications: appState.notifications,
    unreadNotificationCount: appState.unreadNotificationCount,
    events: appState.events,
    totalBins: appState.bins.length,
    activeCommunities: new Set(appState.bins.map((bin) => bin.communityName)).size,
    runningBinsCount: appState.bins.filter((bin) => bin.isRunning).length,
    clientCount: webSocketServer.clients.size
  };
}

function broadcastMessage(message) {
  const payload = JSON.stringify(message);

  for (const client of webSocketServer.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function broadcastState(reason) {
  const state = serializeState();
  broadcastMessage({
    type: 'APP_STATE_UPDATE',
    reason,
    data: state
  });
  broadcastMessage({
    type: 'STATE_UPDATE',
    reason,
    data: state
  });
}

function broadcastNotification(notification) {
  broadcastMessage({
    type: 'NOTIFICATION_ADDED',
    data: notification
  });
}

function storeEvent(event) {
  appState.events.unshift(event);
  trimArray(appState.events, MAX_EVENTS);
  persistEvent(event);
  broadcastMessage({
    type: 'EVENT_ADDED',
    data: event
  });
}

function createEvent(bin, type, message, extra = {}) {
  const event = {
    id: nextEventId++,
    binId: bin.id,
    communityName: bin.communityName,
    binName: bin.binName,
    type,
    level: roundToOneDecimal(bin.currentLevel),
    message,
    timestamp: nowIso(),
    ...extra
  };

  storeEvent(event);
  return event;
}

function storeNotification(bin, message, level) {
  const notification = {
    id: null,
    binId: bin.id,
    communityName: bin.communityName,
    binName: bin.binName,
    message,
    level: roundToOneDecimal(level),
    isRead: false,
    createdAt: nowIso(),
    readAt: null
  };

  const insertedId = persistNotification(notification);
  notification.id = insertedId;
  appState.notifications.unshift(notification);
  trimArray(appState.notifications, MAX_NOTIFICATIONS);
  updateUnreadCount();
  broadcastNotification(notification);
  return notification;
}

function persistAndBroadcast(bin, reason) {
  persistBin(bin);
  broadcastState(reason);
}

function setSelectedBin(binId) {
  const bin = getBinById(binId);
  if (!bin) {
    return null;
  }

  appState.selectedBinId = bin.id;
  persistSelectedBinId(bin.id);
  broadcastState('BIN_SELECTED');
  return bin;
}

function stopSimulation(bin, reason, options = {}) {
  const existingInterval = simulationIntervals.get(bin.id);
  if (existingInterval) {
    clearInterval(existingInterval);
    simulationIntervals.delete(bin.id);
  }

  if (bin.isRunning) {
    bin.isRunning = false;
    bin.status = getStatusForLevel(bin.currentLevel, bin.alertThreshold, bin.maxCapacity);
    bin.updatedAt = nowIso();
    persistBin(bin);

    if (!options.skipEvent) {
      createEvent(bin, 'SIMULATION_STOPPED', reason || 'Simulation stopped.');
    }
  }

  broadcastState(reason || 'SIMULATION_STOPPED');
}

function startSimulation(bin, reason = 'Simulation started.') {
  if (!bin || bin.isRunning) {
    return false;
  }

  bin.isRunning = true;
  bin.updatedAt = nowIso();
  persistBin(bin);
  createEvent(bin, 'SIMULATION_STARTED', reason);
  broadcastState('SIMULATION_STARTED');

  const interval = setInterval(() => {
    const currentBin = getBinById(bin.id);
    if (!currentBin) {
      clearInterval(interval);
      simulationIntervals.delete(bin.id);
      return;
    }

    if (!currentBin.isRunning) {
      clearInterval(interval);
      simulationIntervals.delete(bin.id);
      return;
    }

    const increment = currentBin.fillRate * (CHECK_INTERVAL_MS / 60000);
    applyLevelUpdate(currentBin, currentBin.currentLevel + increment, 'LEVEL_UPDATE', 'Automatic fill update.');
  }, CHECK_INTERVAL_MS);

  simulationIntervals.set(bin.id, interval);
  return true;
}

function applyLevelUpdate(bin, nextLevel, sourceEventType, message) {
  const safeNextLevel = readNumber(nextLevel, bin.currentLevel);
  const previousLevel = bin.currentLevel;
  const previousStatus = bin.status;
  const wasFull = previousLevel >= bin.maxCapacity;

  bin.currentLevel = roundToOneDecimal(clamp(safeNextLevel, 0, bin.maxCapacity));
  bin.status = getStatusForLevel(bin.currentLevel, bin.alertThreshold, bin.maxCapacity);
  bin.updatedAt = nowIso();

  if (bin.currentLevel >= bin.maxCapacity && !wasFull) {
    bin.alertCount += 1;
    createEvent(bin, 'BIN_FULL', 'Bin reached full capacity and needs emptying.');
    storeNotification(bin, `Bin ${bin.binName} is full. Empty it now.`, bin.currentLevel);
    if (bin.isRunning) {
      stopSimulation(bin, 'Stopped after reaching full capacity.', { skipEvent: true });
    }
  } else if (bin.status === 'WARNING' && previousStatus !== 'WARNING') {
    createEvent(bin, 'BIN_WARNING', 'Bin reached the alert threshold.');
  } else if (bin.status === 'NORMAL' && previousStatus !== 'NORMAL') {
    createEvent(bin, 'BIN_NORMAL', 'Bin returned to normal operating range.');
  }

  if (sourceEventType) {
    createEvent(bin, sourceEventType, message || 'Level changed.');
  }

  persistAndBroadcast(bin, sourceEventType || 'LEVEL_CHANGED');
}

function applySettingsUpdate(bin, updates, eventType, message) {
  if (updates.communityName !== undefined) {
    bin.communityName = updates.communityName;
  }

  if (updates.binName !== undefined) {
    bin.binName = updates.binName;
  }

  if (updates.location !== undefined) {
    bin.location = updates.location;
  }

  if (updates.fillRate !== undefined) {
    bin.fillRate = readNumber(updates.fillRate, bin.fillRate);
  }

  if (updates.alertThreshold !== undefined) {
    bin.alertThreshold = readNumber(updates.alertThreshold, bin.alertThreshold);
  }

  if (updates.currentLevel !== undefined) {
    bin.currentLevel = readNumber(updates.currentLevel, bin.currentLevel);
  }

  if (updates.isRunning !== undefined) {
    bin.isRunning = Boolean(updates.isRunning);
  }

  bin.updatedAt = nowIso();

  bin.alertThreshold = clamp(roundToOneDecimal(bin.alertThreshold), 1, bin.maxCapacity);
  bin.fillRate = clamp(roundToOneDecimal(bin.fillRate), 0, 100);
  bin.currentLevel = clamp(roundToOneDecimal(bin.currentLevel), 0, bin.maxCapacity);
  bin.status = getStatusForLevel(bin.currentLevel, bin.alertThreshold, bin.maxCapacity);

  if (eventType) {
    createEvent(bin, eventType, message || 'Settings updated.');
  }

  persistAndBroadcast(bin, eventType || 'SETTINGS_CHANGED');
}

function resetBin(bin, reason = 'Bin emptied and simulation reset.') {
  stopSimulation(bin, reason, { skipEvent: true });
  bin.currentLevel = 0;
  bin.status = 'NORMAL';
  bin.emptyCount += 1;
  bin.updatedAt = nowIso();
  createEvent(bin, 'BIN_EMPTIED', reason);
  persistAndBroadcast(bin, 'BIN_EMPTIED');
}

function createBin(payload) {
  if (!isPlainObject(payload)) {
    return null;
  }

  const communityName = String(payload.communityName || payload.community_name || '').trim();
  const binName = String(payload.binName || payload.bin_name || '').trim();
  const location = String(payload.location || '').trim();

  if (!communityName || !binName || !location) {
    return { error: 'communityName, binName, and location are required.' };
  }

  const maxCapacity = clamp(readNumber(payload.maxCapacity, 100), 1, 100);
  const currentLevel = clamp(readNumber(payload.currentLevel, 0), 0, maxCapacity);
  const alertThreshold = clamp(readNumber(payload.alertThreshold, 80), 1, maxCapacity);
  const fillRate = clamp(readNumber(payload.fillRate, 5), 0, 100);
  const isRunning = Boolean(payload.isRunning);

  const bin = {
    id: null,
    communityName,
    binName,
    location,
    currentLevel,
    maxCapacity,
    alertThreshold,
    fillRate,
    isRunning,
    status: getStatusForLevel(currentLevel, alertThreshold, maxCapacity),
    emptyCount: 0,
    alertCount: 0,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  const insertedId = persistNewBin(bin);
  bin.id = insertedId;
  appState.bins.unshift(bin);
  setSelectedBin(bin.id);
  createEvent(bin, 'BIN_CREATED', `Community ${communityName} created ${binName}.`);
  broadcastState('BIN_CREATED');

  if (isRunning) {
    startSimulation(bin, 'Simulation started for new bin.');
  }

  return bin;
}

function ingestRealtimeData(bin, payload, source = 'realtime') {
  if (!bin || !isPlainObject(payload)) {
    return { error: 'realtime payload must be a JSON object.' };
  }

  const updates = {};
  const previousLevel = bin.currentLevel;
  const previousStatus = bin.status;

  if (typeof payload.communityName === 'string' && payload.communityName.trim()) {
    updates.communityName = payload.communityName.trim();
  }

  if (typeof payload.binName === 'string' && payload.binName.trim()) {
    updates.binName = payload.binName.trim();
  }

  if (typeof payload.location === 'string' && payload.location.trim()) {
    updates.location = payload.location.trim();
  }

  if (payload.fillRate !== undefined) {
    updates.fillRate = clamp(readNumber(payload.fillRate, bin.fillRate), 0, 100);
  }

  if (payload.alertThreshold !== undefined) {
    updates.alertThreshold = clamp(readNumber(payload.alertThreshold, bin.alertThreshold), 1, bin.maxCapacity);
  }

  if (payload.currentLevel !== undefined || payload.level !== undefined) {
    updates.currentLevel = clamp(readNumber(payload.currentLevel ?? payload.level, bin.currentLevel), 0, bin.maxCapacity);
  }

  if (payload.isRunning !== undefined) {
    updates.isRunning = Boolean(payload.isRunning);
  }

  Object.assign(bin, updates, {
    updatedAt: nowIso()
  });

  bin.alertThreshold = clamp(roundToOneDecimal(bin.alertThreshold), 1, bin.maxCapacity);
  bin.fillRate = clamp(roundToOneDecimal(bin.fillRate), 0, 100);
  bin.currentLevel = clamp(roundToOneDecimal(bin.currentLevel), 0, bin.maxCapacity);
  bin.status = getStatusForLevel(bin.currentLevel, bin.alertThreshold, bin.maxCapacity);

  if (bin.currentLevel >= bin.maxCapacity && previousLevel < bin.maxCapacity) {
    bin.alertCount += 1;
    createEvent(bin, 'BIN_FULL', 'Bin reached full capacity and needs emptying.');
    storeNotification(bin, `Bin ${bin.binName} is full. Empty it now.`, bin.currentLevel);
    if (bin.isRunning) {
      stopSimulation(bin, 'Stopped after reaching full capacity.', { skipEvent: true });
    }
  } else if (bin.status === 'WARNING' && previousStatus !== 'WARNING') {
    createEvent(bin, 'BIN_WARNING', 'Bin reached the alert threshold.');
  } else if (bin.status === 'NORMAL' && previousStatus !== 'NORMAL') {
    createEvent(bin, 'BIN_NORMAL', 'Bin returned to normal operating range.');
  }

  createEvent(bin, 'REALTIME_DATA_ACCEPTED', `Realtime data accepted from ${source}.`, { source });
  persistAndBroadcast(bin, 'REALTIME_DATA_ACCEPTED');
  return bin;
}

function buildBinsResponse() {
  return appState.bins;
}

function getNotificationById(notificationId) {
  const numericNotificationId = Number(notificationId);
  return appState.notifications.find((notification) => notification.id === numericNotificationId) || null;
}

function isAdminRequest(request) {
  const adminFlag = request.headers['x-admin-mode'] ?? request.body?.isAdmin;
  return ['1', 'true', 'yes', 'admin'].includes(String(adminFlag || '').trim().toLowerCase());
}

function getAdminName(request) {
  const requestedName = String(request.headers['x-admin-name'] || request.body?.adminName || 'Local Admin').trim();
  return requestedName.slice(0, 80) || 'Local Admin';
}

function acknowledgeNotification(notification, adminName) {
  if (!notification) {
    return null;
  }

  if (notification.isRead) {
    return notification;
  }

  const acknowledgedAt = nowIso();
  notification.isRead = true;
  notification.readAt = acknowledgedAt;
  notification.acknowledgedAt = acknowledgedAt;
  notification.acknowledgedBy = adminName;
  markNotificationAcknowledged(notification.id, adminName, acknowledgedAt);
  updateUnreadCount();

  const relatedBin = getBinById(notification.binId);
  if (relatedBin) {
    createEvent(
      relatedBin,
      'NOTIFICATION_ACKNOWLEDGED',
      `Notification acknowledged by ${adminName}.`,
      {
        notificationId: notification.id,
        acknowledgedBy: adminName,
        acknowledgedAt
      }
    );
  }

  broadcastState('NOTIFICATION_ACKNOWLEDGED');
  return notification;
}

function seedExampleBins() {
  const existingKeys = new Set(
    appState.bins.map((bin) => `${bin.communityName.toLowerCase()}::${bin.binName.toLowerCase()}`)
  );

  const createdBins = createExampleBinTemplates()
    .filter((template) => !existingKeys.has(`${template.communityName.toLowerCase()}::${template.binName.toLowerCase()}`))
    .map((template) => {
    const bin = {
      ...template,
      id: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status: getStatusForLevel(template.currentLevel, template.alertThreshold, template.maxCapacity)
    };

    const insertedId = persistNewBin(bin);
    bin.id = insertedId;
    appState.bins.push(bin);
    createEvent(bin, 'BIN_CREATED', `Seeded example bin ${bin.binName} for ${bin.communityName}.`, {
      source: 'seed'
    });

    if (bin.isRunning) {
      startSimulation(bin, 'Simulation started for seeded example bin.');
    }

    return bin;
  });

  if (!appState.selectedBinId && createdBins[0]) {
    appState.selectedBinId = createdBins[0].id;
    persistSelectedBinId(createdBins[0].id);
  }

  broadcastState('EXAMPLE_BINS_SEEDED');
  return createdBins;
}

function setSelectedBinFromRequest(request, response) {
  const binId = Number(request.params.binId || request.body?.binId);
  const bin = setSelectedBin(binId);

  if (!bin) {
    response.status(404).json({ success: false, message: 'Bin not found.' });
    return null;
  }

  response.json({ success: true, selectedBinId: bin.id, state: serializeState() });
  return bin;
}

app.get('/', (request, response) => {
  response.json({
    name: 'Community Waste Bin Registry Backend',
    status: 'running',
    websocket: 'enabled'
  });
});

app.get('/api/state', (request, response) => {
  response.json(serializeState());
});

app.get('/api/app-state', (request, response) => {
  response.json(serializeState());
});

app.get('/api/bins', (request, response) => {
  response.json({
    total: appState.bins.length,
    bins: buildBinsResponse()
  });
});

app.post('/api/bins', (request, response) => {
  const createdBin = createBin(request.body);

  if (!createdBin) {
    response.status(400).json({ success: false, message: 'Invalid bin payload.' });
    return;
  }

  if (createdBin.error) {
    response.status(400).json({ success: false, message: createdBin.error });
    return;
  }

  response.status(201).json({ success: true, bin: createdBin, state: serializeState() });
});

app.get('/api/bins/:binId', (request, response) => {
  const bin = getBinById(request.params.binId);

  if (!bin) {
    response.status(404).json({ success: false, message: 'Bin not found.' });
    return;
  }

  response.json({ success: true, bin, state: serializeState() });
});

app.post('/api/bins/:binId/select', (request, response) => {
  setSelectedBinFromRequest(request, response);
});

app.get('/api/notifications', (request, response) => {
  response.json({
    total: appState.notifications.length,
    unreadCount: appState.unreadNotificationCount,
    notifications: appState.notifications
  });
});

app.post('/api/notifications/:notificationId/acknowledge', (request, response) => {
  if (!isAdminRequest(request)) {
    response.status(403).json({ success: false, message: 'Admin mode is required to acknowledge notifications.' });
    return;
  }

  const notification = getNotificationById(request.params.notificationId);

  if (!notification) {
    response.status(404).json({ success: false, message: 'Notification not found.' });
    return;
  }

  acknowledgeNotification(notification, getAdminName(request));
  response.json({ success: true, notification, state: serializeState() });
});

app.post('/api/notifications/:notificationId/read', (request, response) => {
  if (!isAdminRequest(request)) {
    response.status(403).json({ success: false, message: 'Admin mode is required to acknowledge notifications.' });
    return;
  }

  const notification = getNotificationById(request.params.notificationId);

  if (!notification) {
    response.status(404).json({ success: false, message: 'Notification not found.' });
    return;
  }

  acknowledgeNotification(notification, getAdminName(request));
  response.json({ success: true, notification, state: serializeState() });
});

app.get('/api/events', (request, response) => {
  const limit = clamp(readNumber(request.query.limit, 100), 1, MAX_EVENTS);
  const binId = request.query.binId ? Number(request.query.binId) : null;

  const events = binId
    ? appState.events.filter((event) => event.binId === binId).slice(0, limit)
    : appState.events.slice(0, limit);

  response.json({ total: events.length, events });
});

app.get('/api/stats', (request, response) => {
  const totalBins = appState.bins.length;
  const totalCommunities = new Set(appState.bins.map((bin) => bin.communityName)).size;

  response.json({
    totalBins,
    totalCommunities,
    unreadNotifications: appState.unreadNotificationCount,
    runningBins: appState.bins.filter((bin) => bin.isRunning).length,
    activeBinId: appState.selectedBinId,
    eventCount: appState.events.length,
    notificationCount: appState.notifications.length,
    uptimeSeconds: Math.round(process.uptime())
  });
});

app.get('/api/health', (request, response) => {
  response.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    websocketClients: webSocketServer.clients.size,
    totalBins: appState.bins.length,
    unreadNotifications: appState.unreadNotificationCount,
    runningBins: appState.bins.filter((bin) => bin.isRunning).length
  });
});

app.post('/api/control/start', (request, response) => {
  const bin = getSelectedBin();

  if (!bin) {
    response.status(404).json({ success: false, message: 'No bin is selected.' });
    return;
  }

  const started = startSimulation(bin, 'Simulation started from control endpoint.');
  response.json({ success: true, started, state: serializeState() });
});

app.post('/api/control/stop', (request, response) => {
  const bin = getSelectedBin();

  if (!bin) {
    response.status(404).json({ success: false, message: 'No bin is selected.' });
    return;
  }

  stopSimulation(bin, 'Simulation stopped from control endpoint.');
  response.json({ success: true, state: serializeState() });
});

app.post('/api/control/reset', (request, response) => {
  const bin = getSelectedBin();

  if (!bin) {
    response.status(404).json({ success: false, message: 'No bin is selected.' });
    return;
  }

  resetBin(bin, 'Bin emptied and simulation reset.');
  response.json({ success: true, state: serializeState() });
});

app.post('/api/control/set-level', (request, response) => {
  const bin = getSelectedBin();

  if (!bin) {
    response.status(404).json({ success: false, message: 'No bin is selected.' });
    return;
  }

  applyLevelUpdate(bin, request.body?.level, 'MANUAL_SET', 'Level manually set from control endpoint.');
  response.json({ success: true, state: serializeState() });
});

app.post('/api/control/set-fill-rate', (request, response) => {
  const bin = getSelectedBin();

  if (!bin) {
    response.status(404).json({ success: false, message: 'No bin is selected.' });
    return;
  }

  applySettingsUpdate(bin, { fillRate: request.body?.rate }, 'SETTINGS_CHANGED', 'Fill rate updated from control endpoint.');
  response.json({ success: true, state: serializeState() });
});

app.post('/api/control/set-alert-threshold', (request, response) => {
  const bin = getSelectedBin();

  if (!bin) {
    response.status(404).json({ success: false, message: 'No bin is selected.' });
    return;
  }

  applySettingsUpdate(bin, { alertThreshold: request.body?.threshold }, 'SETTINGS_CHANGED', 'Alert threshold updated from control endpoint.');
  response.json({ success: true, state: serializeState() });
});

app.post('/api/bins/:binId/control/start', (request, response) => {
  const bin = getBinById(request.params.binId);

  if (!bin) {
    response.status(404).json({ success: false, message: 'Bin not found.' });
    return;
  }

  const started = startSimulation(bin, 'Simulation started from bin control endpoint.');
  response.json({ success: true, started, state: serializeState() });
});

app.post('/api/bins/:binId/control/stop', (request, response) => {
  const bin = getBinById(request.params.binId);

  if (!bin) {
    response.status(404).json({ success: false, message: 'Bin not found.' });
    return;
  }

  stopSimulation(bin, 'Simulation stopped from bin control endpoint.');
  response.json({ success: true, state: serializeState() });
});

app.post('/api/bins/:binId/control/reset', (request, response) => {
  const bin = getBinById(request.params.binId);

  if (!bin) {
    response.status(404).json({ success: false, message: 'Bin not found.' });
    return;
  }

  resetBin(bin, 'Bin emptied and reset from bin control endpoint.');
  response.json({ success: true, state: serializeState() });
});

app.post('/api/bins/:binId/control/set-level', (request, response) => {
  const bin = getBinById(request.params.binId);

  if (!bin) {
    response.status(404).json({ success: false, message: 'Bin not found.' });
    return;
  }

  applyLevelUpdate(bin, request.body?.level, 'MANUAL_SET', 'Level manually set from bin control endpoint.');
  response.json({ success: true, state: serializeState() });
});

app.post('/api/bins/:binId/control/set-fill-rate', (request, response) => {
  const bin = getBinById(request.params.binId);

  if (!bin) {
    response.status(404).json({ success: false, message: 'Bin not found.' });
    return;
  }

  applySettingsUpdate(bin, { fillRate: request.body?.rate }, 'SETTINGS_CHANGED', 'Fill rate updated from bin control endpoint.');
  response.json({ success: true, state: serializeState() });
});

app.post('/api/bins/:binId/control/set-alert-threshold', (request, response) => {
  const bin = getBinById(request.params.binId);

  if (!bin) {
    response.status(404).json({ success: false, message: 'Bin not found.' });
    return;
  }

  applySettingsUpdate(bin, { alertThreshold: request.body?.threshold }, 'SETTINGS_CHANGED', 'Alert threshold updated from bin control endpoint.');
  response.json({ success: true, state: serializeState() });
});

app.post('/api/bins/:binId/ingest', (request, response) => {
  const bin = getBinById(request.params.binId);

  if (!bin) {
    response.status(404).json({ success: false, message: 'Bin not found.' });
    return;
  }

  const nextBin = ingestRealtimeData(bin, request.body, 'REST');

  if (nextBin?.error) {
    response.status(400).json({ success: false, message: nextBin.error });
    return;
  }

  response.json({ success: true, bin, state: serializeState() });
});

app.post('/api/control/ingest', (request, response) => {
  const bin = getSelectedBin();

  if (!bin) {
    response.status(404).json({ success: false, message: 'No bin is selected.' });
    return;
  }

  const nextBin = ingestRealtimeData(bin, request.body, 'REST');

  if (nextBin?.error) {
    response.status(400).json({ success: false, message: nextBin.error });
    return;
  }

  response.json({ success: true, state: serializeState() });
});

webSocketServer.on('connection', (socket) => {
  socket.send(JSON.stringify({
    type: 'APP_STATE_UPDATE',
    data: serializeState()
  }));

  socket.on('message', (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());

      switch (message.type) {
        case 'CREATE_BIN': {
          const createdBin = createBin(message.data ?? message.payload ?? message);
          if (createdBin?.error) {
            socket.send(JSON.stringify({ type: 'ERROR', message: createdBin.error }));
          }
          break;
        }
        case 'SELECT_BIN': {
          const selectedBinId = Number(message.binId ?? message.id);
          if (!setSelectedBin(selectedBinId)) {
            socket.send(JSON.stringify({ type: 'ERROR', message: 'Bin not found.' }));
          }
          break;
        }
        case 'START': {
          const bin = getSelectedBin();
          if (!bin) {
            socket.send(JSON.stringify({ type: 'ERROR', message: 'No bin is selected.' }));
            break;
          }
          startSimulation(bin, 'Simulation started from WebSocket control.');
          break;
        }
        case 'STOP': {
          const bin = getSelectedBin();
          if (!bin) {
            socket.send(JSON.stringify({ type: 'ERROR', message: 'No bin is selected.' }));
            break;
          }
          stopSimulation(bin, 'Simulation stopped from WebSocket control.');
          break;
        }
        case 'RESET': {
          const bin = getSelectedBin();
          if (!bin) {
            socket.send(JSON.stringify({ type: 'ERROR', message: 'No bin is selected.' }));
            break;
          }
          resetBin(bin, 'Bin emptied from WebSocket control.');
          break;
        }
        case 'SET_LEVEL': {
          const bin = getSelectedBin();
          if (!bin) {
            socket.send(JSON.stringify({ type: 'ERROR', message: 'No bin is selected.' }));
            break;
          }
          applyLevelUpdate(bin, message.level, 'MANUAL_SET', 'Level manually set from WebSocket control.');
          break;
        }
        case 'SET_FILL_RATE': {
          const bin = getSelectedBin();
          if (!bin) {
            socket.send(JSON.stringify({ type: 'ERROR', message: 'No bin is selected.' }));
            break;
          }
          applySettingsUpdate(bin, { fillRate: message.rate }, 'SETTINGS_CHANGED', 'Fill rate updated from WebSocket control.');
          break;
        }
        case 'SET_ALERT_THRESHOLD': {
          const bin = getSelectedBin();
          if (!bin) {
            socket.send(JSON.stringify({ type: 'ERROR', message: 'No bin is selected.' }));
            break;
          }
          applySettingsUpdate(bin, { alertThreshold: message.threshold }, 'SETTINGS_CHANGED', 'Alert threshold updated from WebSocket control.');
          break;
        }
        case 'DATA_UPDATE':
        case 'INGEST':
        case 'REALTIME_DATA': {
          const bin = getSelectedBin();
          if (!bin) {
            socket.send(JSON.stringify({ type: 'ERROR', message: 'No bin is selected.' }));
            break;
          }
          const nextBin = ingestRealtimeData(bin, message.data ?? message.payload ?? message, 'WebSocket');
          if (nextBin?.error) {
            socket.send(JSON.stringify({ type: 'ERROR', message: nextBin.error }));
          }
          break;
        }
        case 'MARK_NOTIFICATION_READ':
        case 'ACKNOWLEDGE_NOTIFICATION': {
          if (!['1', 'true', 'yes', 'admin'].includes(String(message.isAdmin || '').trim().toLowerCase())) {
            socket.send(JSON.stringify({ type: 'ERROR', message: 'Admin mode is required to acknowledge notifications.' }));
            break;
          }

          const notificationId = Number(message.notificationId ?? message.id);
          const notification = appState.notifications.find((item) => item.id === notificationId);
          if (!notification) {
            socket.send(JSON.stringify({ type: 'ERROR', message: 'Notification not found.' }));
            break;
          }

          acknowledgeNotification(notification, String(message.adminName || 'Local Admin'));
          break;
        }
        default:
          socket.send(JSON.stringify({
            type: 'ERROR',
            message: `Unsupported message type: ${message.type || 'unknown'}`
          }));
      }
    } catch (error) {
      socket.send(JSON.stringify({
        type: 'ERROR',
        message: 'Invalid WebSocket message format.'
      }));
    }
  });
});

