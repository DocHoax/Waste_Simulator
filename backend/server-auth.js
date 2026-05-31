const express = require('express');
const http = require('http');
const cors = require('cors');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const bcryptjs = require('bcryptjs');
const {
  db,
  hydrateStateFromDatabase,
  persistEvent,
  persistBin,
  roundToOneDecimal,
  createUser,
  getUserByEmail,
  getUserById,
  getUserBins,
  getAllBins,
  deleteBinById,
  createAdminNotification,
  getAdminNotifications,
  acknowledgeAdminNotification,
  getSuperAdmin,
  getUnreadNotificationCount,
  persistSelectedBinId,
  persistNewBinWithUser,
  MAX_EVENTS
} = require('./db');

const PORT = Number(process.env.PORT || 5051);
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 5000);

// Initialize with super admin if not exists
function initializeSuperAdmin() {
  const existing = getSuperAdmin();
  if (!existing) {
    const password = bcryptjs.hashSync('admin123', 10);
    createUser('admin', 'admin@waste-system.com', password, 'System Admin', 'super_admin');
    console.log('Created super admin user: admin / admin123');
  }
}

// Utility functions
function nowIso() {
  return new Date().toISOString();
}

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getStatusForLevel(level, alertThreshold, maxCapacity) {
  if (level >= maxCapacity) return 'ALERT';
  if (level >= alertThreshold) return 'WARNING';
  return 'NORMAL';
}

// Auth middleware
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(403).json({ success: false, message: 'Invalid token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ success: false, message: `Requires ${role} role` });
    }
    next();
  };
}

// Simulation state
const hydration = hydrateStateFromDatabase([]);
const appState = {
  bins: hydration.state.bins,
  notifications: hydration.state.notifications,
  events: hydration.state.events,
  selectedBinId: hydration.state.selectedBinId
};

let nextEventId = hydration.nextEventId;
const simulationIntervals = new Map();
const connectedClients = new Map();

// Express app
const app = express();

const allowedCorsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : [];

function isAllowedCorsOrigin(origin) {
  if (!origin) {
    return true;
  }

  if (allowedCorsOrigins.includes(origin)) {
    return true;
  }

  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.hostname === 'localhost' || parsedOrigin.hostname === '127.0.0.1') {
      return true;
    }

    if (parsedOrigin.hostname.endsWith('.vercel.app')) {
      return true;
    }
  } catch (error) {
    return false;
  }

  return false;
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Mode', 'X-Admin-Name'],
  optionsSuccessStatus: 200
}));
app.options('*', cors({
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Mode', 'X-Admin-Name'],
  optionsSuccessStatus: 200
}));
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function startBinSimulation(bin, userId) {
  if (!bin || simulationIntervals.has(bin.id) || !bin.isRunning) {
    return;
  }

  const interval = setInterval(() => {
    const currentBin = appState.bins.find((entry) => entry.id === bin.id);
    if (!currentBin || !currentBin.isRunning) {
      clearInterval(interval);
      simulationIntervals.delete(bin.id);
      return;
    }

    const increment = currentBin.fillRate * (CHECK_INTERVAL_MS / 60000);
    updateBinLevel(currentBin, currentBin.currentLevel + increment, userId ?? currentBin.userId);
  }, CHECK_INTERVAL_MS);

  simulationIntervals.set(bin.id, interval);
}

function resumeRunningSimulations() {
  for (const bin of appState.bins) {
    if (bin.isRunning) {
      startBinSimulation(bin, bin.userId);
    }
  }
}

// ============ AUTH ENDPOINTS ============

app.post('/api/auth/register', (req, res) => {
  const { username, email, password, communityName } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ success: false, message: 'Username, email, and password required' });
  }

  try {
    const hash = bcryptjs.hashSync(password, 10);
    const userId = createUser(username, email, hash, communityName || username, 'community_manager');
    const token = jwt.sign({ id: userId, username, email, role: 'community_manager' }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ success: true, token, userId, message: 'Account created' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || 'Registration failed' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required' });
  }

  const user = getUserByEmail(email);
  if (!user || !bcryptjs.compareSync(password, user.password_hash)) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, username: user.username, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, role: user.role, communityName: user.community_name } });
});

app.get('/api/auth/me', verifyToken, (req, res) => {
  const user = getUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const userBins = req.user.role === 'super_admin' ? getAllBins() : getUserBins(req.user.id);
  res.json({ success: true, user: { id: user.id, username: user.username, email: user.email, role: user.role, communityName: user.community_name }, bins: userBins });
});

// ============ BIN ENDPOINTS ============

app.post('/api/bins', verifyToken, (req, res) => {
  const { communityName, binName, location, currentLevel = 0, maxCapacity = 100, alertThreshold = 80, fillRate = 5, isRunning = false } = req.body;

  if (!binName || !location) {
    return res.status(400).json({ success: false, message: 'binName and location required' });
  }

  const bin = {
    communityName: communityName || 'Community',
    binName,
    location,
    currentLevel: clamp(readNumber(currentLevel, 0), 0, 100),
    maxCapacity: clamp(readNumber(maxCapacity, 100), 1, 100),
    alertThreshold: clamp(readNumber(alertThreshold, 80), 1, 100),
    fillRate: clamp(readNumber(fillRate, 5), 0, 100),
    isRunning: Boolean(isRunning),
    status: 'NORMAL',
    emptyCount: 0,
    alertCount: 0,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  const binId = persistNewBinWithUser(bin, req.user.id);
  bin.id = binId;
  bin.userId = req.user.id;
  appState.bins.push(bin);
  if (!appState.selectedBinId) {
    appState.selectedBinId = bin.id;
    persistSelectedBinId(bin.id);
  }

  if (bin.isRunning) {
    startBinSimulation(bin, req.user.id);
  }

  res.status(201).json({ success: true, bin });
});

app.get('/api/bins', verifyToken, (req, res) => {
  const bins = req.user.role === 'super_admin' ? getAllBins() : getUserBins(req.user.id);
  res.json({ success: true, bins });
});

app.post('/api/bins/:binId/select', verifyToken, (req, res) => {
  const binId = Number(req.params.binId);
  const bin = appState.bins.find((entry) => entry.id === binId);

  if (!bin || (req.user.role !== 'super_admin' && bin.userId !== req.user.id)) {
    return res.status(404).json({ success: false, message: 'Bin not found' });
  }

  appState.selectedBinId = bin.id;
  persistSelectedBinId(bin.id);
  broadcastState('BIN_SELECTED');

  return res.json({
    success: true,
    selectedBinId: bin.id,
    state: {
      bins: appState.bins,
      selectedBinId: appState.selectedBinId,
      notifications: appState.notifications,
      events: appState.events
    }
  });
});

app.get('/api/bins/:binId', verifyToken, (req, res) => {
  const bin = appState.bins.find(b => b.id === Number(req.params.binId));
  if (!bin || (req.user.role !== 'super_admin' && bin.userId !== req.user.id)) {
    return res.status(404).json({ success: false, message: 'Bin not found' });
  }
  res.json({ success: true, bin });
});

app.delete('/api/bins/:binId', verifyToken, requireRole('super_admin'), (req, res) => {
  const binId = Number(req.params.binId);
  const bin = appState.bins.find((entry) => entry.id === binId);

  if (!bin) {
    return res.status(404).json({ success: false, message: 'Bin not found' });
  }

  const interval = simulationIntervals.get(bin.id);
  if (interval) {
    clearInterval(interval);
    simulationIntervals.delete(bin.id);
  }

  const deletedCount = deleteBinById(binId);
  if (!deletedCount) {
    return res.status(404).json({ success: false, message: 'Bin not found' });
  }

  appState.bins = appState.bins.filter((entry) => entry.id !== binId);
  if (appState.selectedBinId === binId) {
    appState.selectedBinId = appState.bins[0]?.id || null;
    persistSelectedBinId(appState.selectedBinId);
  }
  broadcastState('BIN_DELETED');

  return res.json({ success: true, deletedBinId: binId });
});

// ============ CONTROL ENDPOINTS ============

app.post('/api/bins/:binId/control/start', verifyToken, (req, res) => {
  const bin = appState.bins.find(b => b.id === Number(req.params.binId));
  if (!bin || (req.user.role !== 'super_admin' && bin.userId !== req.user.id)) {
    return res.status(404).json({ success: false, message: 'Bin not found' });
  }

  if (!bin.isRunning) {
    bin.isRunning = true;
    bin.updatedAt = nowIso();
    persistBin(bin);

    startBinSimulation(bin, req.user.id);
  }

  broadcastState('SIMULATION_STARTED');
  res.json({ success: true, bin });
});

app.post('/api/bins/:binId/control/stop', verifyToken, (req, res) => {
  const bin = appState.bins.find(b => b.id === Number(req.params.binId));
  if (!bin || (req.user.role !== 'super_admin' && bin.userId !== req.user.id)) {
    return res.status(404).json({ success: false, message: 'Bin not found' });
  }

  const interval = simulationIntervals.get(bin.id);
  if (interval) {
    clearInterval(interval);
    simulationIntervals.delete(bin.id);
  }

  bin.isRunning = false;
  bin.updatedAt = nowIso();
  persistBin(bin);
  broadcastState('SIMULATION_STOPPED');

  res.json({ success: true, bin });
});

app.post('/api/bins/:binId/control/reset', verifyToken, (req, res) => {
  const bin = appState.bins.find(b => b.id === Number(req.params.binId));
  if (!bin || (req.user.role !== 'super_admin' && bin.userId !== req.user.id)) {
    return res.status(404).json({ success: false, message: 'Bin not found' });
  }

  const interval = simulationIntervals.get(bin.id);
  if (interval) {
    clearInterval(interval);
    simulationIntervals.delete(bin.id);
  }

  bin.currentLevel = 0;
  bin.status = 'NORMAL';
  bin.isRunning = false;
  bin.emptyCount += 1;
  bin.updatedAt = nowIso();
  persistBin(bin);
  broadcastState('BIN_RESET');

  res.json({ success: true, bin });
});

app.post('/api/bins/:binId/control/set-level', verifyToken, (req, res) => {
  const bin = appState.bins.find(b => b.id === Number(req.params.binId));
  if (!bin || (req.user.role !== 'super_admin' && bin.userId !== req.user.id)) {
    return res.status(404).json({ success: false, message: 'Bin not found' });
  }

  const newLevel = clamp(readNumber(req.body.level, bin.currentLevel), 0, bin.maxCapacity);
  updateBinLevel(bin, newLevel, req.user.id);

  res.json({ success: true, bin });
});

// ============ ADMIN NOTIFICATION ENDPOINTS ============

app.get('/api/admin/notifications', verifyToken, requireRole('super_admin'), (req, res) => {
  const notifications = getAdminNotifications(req.user.id);
  const unreadCount = getUnreadNotificationCount(req.user.id);
  res.json({ success: true, notifications, unreadCount });
});

app.post('/api/admin/notifications/:notificationId/acknowledge', verifyToken, requireRole('super_admin'), (req, res) => {
  acknowledgeAdminNotification(req.params.notificationId, req.user.id);
  const notifications = getAdminNotifications(req.user.id);
  const unreadCount = getUnreadNotificationCount(req.user.id);
  res.json({ success: true, notifications, unreadCount });
});

// ============ HELPER FUNCTIONS ============

function updateBinLevel(bin, newLevel, userId) {
  const previousLevel = bin.currentLevel;
  const previousStatus = bin.status;

  bin.currentLevel = roundToOneDecimal(clamp(newLevel, 0, bin.maxCapacity));
  bin.status = getStatusForLevel(bin.currentLevel, bin.alertThreshold, bin.maxCapacity);
  bin.updatedAt = nowIso();

  // Bin reached capacity - notify super admin
  if (bin.currentLevel >= bin.maxCapacity && previousLevel < bin.maxCapacity) {
    bin.alertCount += 1;
    const superAdmin = getSuperAdmin();
    if (superAdmin) {
      createAdminNotification(
        superAdmin.id,
        bin.id,
        bin.communityName,
        bin.binName,
        `Bin ${bin.binName} in ${bin.communityName} has reached capacity and needs emptying.`,
        bin.currentLevel
      );
      broadcastAdminNotification({
        binId: bin.id,
        communityName: bin.communityName,
        binName: bin.binName,
        message: `Bin ${bin.binName} is FULL`,
        level: bin.currentLevel
      });
    }
  }

  persistBin(bin);
  broadcastState('LEVEL_CHANGED');
}

function broadcastState(reason) {
  const message = JSON.stringify({
    type: 'STATE_UPDATE',
    reason,
    data: { bins: appState.bins, selectedBinId: appState.selectedBinId, events: appState.events }
  });

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function broadcastAdminNotification(notification) {
  const message = JSON.stringify({
    type: 'ADMIN_NOTIFICATION',
    data: notification
  });

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// ============ WEBSOCKET ============

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// ============ HEALTH/INFO ENDPOINTS ============

app.get('/', (req, res) => {
  res.json({ name: 'Waste Simulator - Multi-Tenant API', status: 'running', version: '2.0' });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    websocketClients: wss.clients.size,
    totalBins: appState.bins.length,
    wsClients: wss.clients.size
  });
});

// ============ START SERVER ============

initializeSuperAdmin();
resumeRunningSimulations();

server.listen(PORT, () => {
  console.log(`\n🚀 Multi-Tenant Waste Simulator API running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket available at ws://localhost:${PORT}`);
  console.log(`\nSuper admin account is initialized on first start if missing.\n`);
});

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  for (const interval of simulationIntervals.values()) {
    clearInterval(interval);
  }
  server.close(() => process.exit(0));
});
