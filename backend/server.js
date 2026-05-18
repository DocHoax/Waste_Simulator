const express = require('express');
const http = require('http');
const cors = require('cors');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 5000);
const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 5000);

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundToOneDecimal(value) {
  return Math.round(value * 10) / 10;
}

function createInitialState() {
  return {
    binId: process.env.DEVICE_ID || 'BIN-001',
    location: process.env.DEVICE_LOCATION || 'Zone 1',
    currentLevel: 42,
    maxCapacity: 100,
    alertThreshold: clamp(readNumber(process.env.DEFAULT_ALERT_THRESHOLD, 80), 1, 100),
    fillRate: clamp(readNumber(process.env.DEFAULT_FILL_RATE, 5), 0, 100),
    isRunning: false,
    lastUpdate: new Date().toISOString(),
    status: 'NORMAL',
    events: [],
    emptyCount: 0,
    alertCount: 0
  };
}

const simulatorState = createInitialState();
let nextEventId = 1;
let simulationInterval = null;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const webSocketServer = new WebSocket.Server({ server });

function getStatusForLevel(level, alertThreshold) {
  if (level >= alertThreshold) {
    return 'ALERT';
  }

  if (level >= 50) {
    return 'WARNING';
  }

  return 'NORMAL';
}

function serializeState() {
  return {
    ...simulatorState,
    currentLevel: roundToOneDecimal(simulatorState.currentLevel),
    lastUpdate: simulatorState.lastUpdate,
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
  broadcastMessage({
    type: 'STATE_UPDATE',
    reason,
    data: serializeState()
  });
}

function addEvent(type, level, message, extra = {}) {
  const event = {
    id: nextEventId++,
    type,
    level: roundToOneDecimal(level),
    message,
    timestamp: new Date().toISOString(),
    ...extra
  };

  simulatorState.events.unshift(event);
  if (simulatorState.events.length > 1000) {
    simulatorState.events.length = 1000;
  }

  broadcastMessage({
    type: 'EVENT_ADDED',
    data: event
  });

  return event;
}

function recalculateStatus(sourceEventType, message) {
  const previousStatus = simulatorState.status;
  simulatorState.status = getStatusForLevel(simulatorState.currentLevel, simulatorState.alertThreshold);

  if (previousStatus !== simulatorState.status) {
    if (simulatorState.status === 'ALERT') {
      simulatorState.alertCount += 1;
      addEvent('ALERT_TRIGGERED', simulatorState.currentLevel, message || 'Alert threshold reached.');
    }

    if (previousStatus === 'ALERT' && simulatorState.status !== 'ALERT') {
      addEvent('SETTINGS_CHANGED', simulatorState.currentLevel, 'Bin returned below alert threshold.');
    }
  }

  if (sourceEventType) {
    addEvent(sourceEventType, simulatorState.currentLevel, message || 'State changed.');
  }

  simulatorState.lastUpdate = new Date().toISOString();
  broadcastState(sourceEventType);
}

function updateLevel(nextLevel, sourceEventType, message) {
  const normalizedLevel = roundToOneDecimal(clamp(nextLevel, 0, simulatorState.maxCapacity));
  simulatorState.currentLevel = normalizedLevel;
  recalculateStatus(sourceEventType, message);
}

function startSimulation() {
  if (simulatorState.isRunning) {
    return false;
  }

  simulatorState.isRunning = true;
  simulatorState.lastUpdate = new Date().toISOString();
  addEvent('SIMULATION_STARTED', simulatorState.currentLevel, 'Simulation started.');
  broadcastState('SIMULATION_STARTED');

  simulationInterval = setInterval(() => {
    const increment = simulatorState.fillRate * (CHECK_INTERVAL_MS / 60000);
    const nextLevel = clamp(simulatorState.currentLevel + increment, 0, simulatorState.maxCapacity);

    if (nextLevel >= simulatorState.maxCapacity) {
      updateLevel(nextLevel, 'LEVEL_UPDATE', 'Bin reached maximum capacity.');
      stopSimulation('Maximum capacity reached.');
      return;
    }

    updateLevel(nextLevel, 'LEVEL_UPDATE', 'Automatic fill update.');
  }, CHECK_INTERVAL_MS);

  return true;
}

function stopSimulation(reason = 'Simulation stopped.') {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }

  if (simulatorState.isRunning) {
    simulatorState.isRunning = false;
    simulatorState.lastUpdate = new Date().toISOString();
    addEvent('SIMULATION_STOPPED', simulatorState.currentLevel, reason);
    broadcastState('SIMULATION_STOPPED');
  }
}

function resetSimulator() {
  stopSimulation('Simulation reset.');
  simulatorState.currentLevel = 0;
  simulatorState.status = 'NORMAL';
  simulatorState.lastUpdate = new Date().toISOString();
  simulatorState.emptyCount += 1;
  addEvent('BIN_EMPTIED', simulatorState.currentLevel, 'Bin emptied and simulation reset.');
  broadcastState('BIN_EMPTIED');
}

function setFillRate(rate) {
  simulatorState.fillRate = clamp(readNumber(rate, simulatorState.fillRate), 0, 100);
  simulatorState.lastUpdate = new Date().toISOString();
  addEvent('SETTINGS_CHANGED', simulatorState.currentLevel, `Fill rate set to ${simulatorState.fillRate}% per minute.`);
  broadcastState('SETTINGS_CHANGED');
}

function setAlertThreshold(threshold) {
  const previousStatus = simulatorState.status;
  simulatorState.alertThreshold = clamp(readNumber(threshold, simulatorState.alertThreshold), 1, simulatorState.maxCapacity);
  simulatorState.lastUpdate = new Date().toISOString();
  simulatorState.status = getStatusForLevel(simulatorState.currentLevel, simulatorState.alertThreshold);
  addEvent('SETTINGS_CHANGED', simulatorState.currentLevel, `Alert threshold set to ${simulatorState.alertThreshold}%.`);

  if (simulatorState.status === 'ALERT' && previousStatus !== 'ALERT') {
    simulatorState.alertCount += 1;
    addEvent('ALERT_TRIGGERED', simulatorState.currentLevel, 'Alert threshold reached after threshold update.');
  }

  broadcastState('SETTINGS_CHANGED');
}

function setManualLevel(level) {
  updateLevel(level, 'MANUAL_SET', `Level manually set to ${roundToOneDecimal(clamp(level, 0, simulatorState.maxCapacity))}%.`);
}

function getEventSlice(limit, offset) {
  return simulatorState.events.slice(offset, offset + limit);
}

function buildStats() {
  const totalEvents = simulatorState.events.length;
  const eventCounts = simulatorState.events.reduce((counts, event) => {
    counts[event.type] = (counts[event.type] || 0) + 1;
    return counts;
  }, {});

  const averageLevel = totalEvents
    ? roundToOneDecimal(simulatorState.events.reduce((sum, event) => sum + event.level, 0) / totalEvents)
    : roundToOneDecimal(simulatorState.currentLevel);

  return {
    binId: simulatorState.binId,
    totalEvents,
    eventCounts,
    averageLevel,
    uptimeSeconds: Math.round(process.uptime())
  };
}

app.get('/', (request, response) => {
  response.json({
    name: 'Waste Level Monitoring Simulator Backend',
    status: 'running',
    websocket: 'enabled'
  });
});

app.get('/api/state', (request, response) => {
  response.json(serializeState());
});

app.get('/api/events', (request, response) => {
  const limit = clamp(readNumber(request.query.limit, 100), 1, 1000);
  const offset = clamp(readNumber(request.query.offset, 0), 0, simulatorState.events.length);
  response.json({
    total: simulatorState.events.length,
    events: getEventSlice(limit, offset)
  });
});

app.get('/api/stats', (request, response) => {
  response.json(buildStats());
});

app.get('/api/health', (request, response) => {
  response.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    websocketClients: webSocketServer.clients.size,
    isRunning: simulatorState.isRunning
  });
});

app.post('/api/control/start', (request, response) => {
  const started = startSimulation();
  response.json({ success: true, started, state: serializeState() });
});

app.post('/api/control/stop', (request, response) => {
  stopSimulation('Stopped from REST control endpoint.');
  response.json({ success: true, state: serializeState() });
});

app.post('/api/control/reset', (request, response) => {
  resetSimulator();
  response.json({ success: true, state: serializeState() });
});

app.post('/api/control/set-level', (request, response) => {
  const { level } = request.body || {};
  setManualLevel(level);
  response.json({ success: true, state: serializeState() });
});

app.post('/api/control/set-fill-rate', (request, response) => {
  const { rate } = request.body || {};
  setFillRate(rate);
  response.json({ success: true, state: serializeState() });
});

app.post('/api/control/set-alert-threshold', (request, response) => {
  const { threshold } = request.body || {};
  setAlertThreshold(threshold);
  response.json({ success: true, state: serializeState() });
});

webSocketServer.on('connection', (socket) => {
  socket.send(JSON.stringify({
    type: 'STATE_UPDATE',
    data: serializeState()
  }));

  socket.on('message', (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());

      switch (message.type) {
        case 'START':
          startSimulation();
          break;
        case 'STOP':
          stopSimulation('Stopped from WebSocket control.');
          break;
        case 'RESET':
          resetSimulator();
          break;
        case 'SET_LEVEL':
          setManualLevel(message.level);
          break;
        case 'SET_FILL_RATE':
          setFillRate(message.rate);
          break;
        case 'SET_ALERT_THRESHOLD':
          setAlertThreshold(message.threshold);
          break;
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

function shutdown() {
  stopSimulation('Shutting down server.');
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
  console.log('Waste Monitoring Simulator Backend');
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
  console.log(`HTTP API: http://localhost:${PORT}/api`);
});

module.exports = {
  app,
  server,
  simulatorState,
  startSimulation,
  stopSimulation,
  resetSimulator
};
