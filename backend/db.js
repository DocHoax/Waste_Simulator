const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const MAX_EVENTS = 1000;
const MAX_NOTIFICATIONS = 200;
const dataDirectory = path.join(__dirname, 'data');
const databasePath = path.join(dataDirectory, 'waste-simulator.db');

fs.mkdirSync(dataDirectory, { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function hasColumn(tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some((row) => row.name === columnName);
}

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundToOneDecimal(value) {
  return Math.round(value * 10) / 10;
}

function safeParseJson(text, fallback) {
  if (!text) {
    return fallback;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return fallback;
  }
}

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS state_snapshot (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      snapshot TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      selected_bin_id INTEGER,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      community_name TEXT NOT NULL,
      bin_name TEXT NOT NULL,
      location TEXT NOT NULL,
      current_level REAL NOT NULL,
      max_capacity REAL NOT NULL,
      alert_threshold REAL NOT NULL,
      fill_rate REAL NOT NULL,
      is_running INTEGER NOT NULL,
      status TEXT NOT NULL,
      empty_count INTEGER NOT NULL,
      alert_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bin_id INTEGER NOT NULL,
      community_name TEXT NOT NULL,
      bin_name TEXT NOT NULL,
      message TEXT NOT NULL,
      level REAL NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      acknowledged_by TEXT,
      created_at TEXT NOT NULL,
      read_at TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY,
      bin_id INTEGER,
      community_name TEXT,
      bin_name TEXT,
      type TEXT NOT NULL,
      level REAL NOT NULL,
      message TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      extra_json TEXT
    );
  `);

  if (!hasColumn('events', 'bin_id')) {
    db.exec('ALTER TABLE events ADD COLUMN bin_id INTEGER');
  }

  if (!hasColumn('events', 'community_name')) {
    db.exec('ALTER TABLE events ADD COLUMN community_name TEXT');
  }

  if (!hasColumn('events', 'bin_name')) {
    db.exec('ALTER TABLE events ADD COLUMN bin_name TEXT');
  }

  if (!hasColumn('notifications', 'acknowledged_by')) {
    db.exec('ALTER TABLE notifications ADD COLUMN acknowledged_by TEXT');
  }
}

ensureSchema();

const selectLegacySnapshotStatement = db.prepare('SELECT snapshot FROM state_snapshot WHERE id = 1');
const selectAppStateStatement = db.prepare('SELECT selected_bin_id FROM app_state WHERE id = 1');
const upsertAppStateStatement = db.prepare(`
  INSERT INTO app_state (id, selected_bin_id, updated_at)
  VALUES (1, @selectedBinId, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET
    selected_bin_id = excluded.selected_bin_id,
    updated_at = excluded.updated_at
`);

const selectBinsStatement = db.prepare('SELECT * FROM bins ORDER BY created_at DESC, id DESC');
const selectBinByIdStatement = db.prepare('SELECT * FROM bins WHERE id = ?');
const insertBinStatement = db.prepare(`
  INSERT INTO bins (
    community_name,
    bin_name,
    location,
    current_level,
    max_capacity,
    alert_threshold,
    fill_rate,
    is_running,
    status,
    empty_count,
    alert_count,
    created_at,
    updated_at
  ) VALUES (
    @communityName,
    @binName,
    @location,
    @currentLevel,
    @maxCapacity,
    @alertThreshold,
    @fillRate,
    @isRunning,
    @status,
    @emptyCount,
    @alertCount,
    @createdAt,
    @updatedAt
  )
`);
const updateBinStatement = db.prepare(`
  UPDATE bins SET
    community_name = @communityName,
    bin_name = @binName,
    location = @location,
    current_level = @currentLevel,
    max_capacity = @maxCapacity,
    alert_threshold = @alertThreshold,
    fill_rate = @fillRate,
    is_running = @isRunning,
    status = @status,
    empty_count = @emptyCount,
    alert_count = @alertCount,
    updated_at = @updatedAt
  WHERE id = @id
`);

const selectNotificationsStatement = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC, id DESC LIMIT ?');
const selectUnreadNotificationCountStatement = db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE is_read = 0');
const insertNotificationStatement = db.prepare(`
  INSERT INTO notifications (
    bin_id,
    community_name,
    bin_name,
    message,
    level,
    is_read,
    created_at,
    read_at
  ) VALUES (
    @binId,
    @communityName,
    @binName,
    @message,
    @level,
    @isRead,
    @createdAt,
    @readAt
  )
`);
const markNotificationReadStatement = db.prepare(`
  UPDATE notifications
  SET is_read = 1, read_at = @readAt, acknowledged_by = @acknowledgedBy
  WHERE id = @id
`);
const deleteOldNotificationsStatement = db.prepare(`
  DELETE FROM notifications
  WHERE id IN (
    SELECT id FROM notifications ORDER BY created_at ASC, id ASC LIMIT ?
  )
`);

const selectEventsStatement = db.prepare('SELECT id, bin_id, community_name, bin_name, type, level, message, timestamp, extra_json FROM events ORDER BY id DESC LIMIT ?');
const selectMaxEventIdStatement = db.prepare('SELECT COALESCE(MAX(id), 0) AS maxId FROM events');
const insertEventStatement = db.prepare(`
  INSERT INTO events (
    id,
    bin_id,
    community_name,
    bin_name,
    type,
    level,
    message,
    timestamp,
    extra_json
  ) VALUES (
    @id,
    @binId,
    @communityName,
    @binName,
    @type,
    @level,
    @message,
    @timestamp,
    @extraJson
  )
`);
const deleteOldEventsStatement = db.prepare('DELETE FROM events WHERE id < ?');

function defaultCommunityName() {
  return process.env.DEFAULT_COMMUNITY_NAME || 'Community Hub';
}

function createDefaultBinState() {
  const now = new Date().toISOString();

  return {
    communityName: defaultCommunityName(),
    binName: process.env.DEVICE_ID || 'BIN-001',
    location: process.env.DEVICE_LOCATION || 'Zone 1',
    currentLevel: 42,
    maxCapacity: 100,
    alertThreshold: readNumber(process.env.DEFAULT_ALERT_THRESHOLD, 80),
    fillRate: readNumber(process.env.DEFAULT_FILL_RATE, 5),
    isRunning: false,
    status: 'NORMAL',
    emptyCount: 0,
    alertCount: 0,
    createdAt: now,
    updatedAt: now
  };
}

function createBinFromLegacySnapshot(snapshot = {}) {
  const base = createDefaultBinState();

  return {
    ...base,
    communityName: snapshot.communityName || snapshot.community_name || base.communityName,
    binName: snapshot.binName || snapshot.binId || snapshot.bin_name || base.binName,
    location: snapshot.location || base.location,
    currentLevel: readNumber(snapshot.currentLevel ?? snapshot.current_level, base.currentLevel),
    maxCapacity: readNumber(snapshot.maxCapacity ?? snapshot.max_capacity, base.maxCapacity),
    alertThreshold: readNumber(snapshot.alertThreshold ?? snapshot.alert_threshold, base.alertThreshold),
    fillRate: readNumber(snapshot.fillRate ?? snapshot.fill_rate, base.fillRate),
    isRunning: Boolean(snapshot.isRunning),
    status: snapshot.status || base.status,
    emptyCount: Math.max(0, Math.floor(readNumber(snapshot.emptyCount ?? snapshot.empty_count, base.emptyCount))),
    alertCount: Math.max(0, Math.floor(readNumber(snapshot.alertCount ?? snapshot.alert_count, base.alertCount)))
  };
}

function serializeBin(row) {
  return {
    id: row.id,
    communityName: row.community_name,
    binName: row.bin_name,
    location: row.location,
    currentLevel: roundToOneDecimal(row.current_level),
    maxCapacity: roundToOneDecimal(row.max_capacity),
    alertThreshold: roundToOneDecimal(row.alert_threshold),
    fillRate: roundToOneDecimal(row.fill_rate),
    isRunning: Boolean(row.is_running),
    status: row.status,
    emptyCount: row.empty_count,
    alertCount: row.alert_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializeNotification(row) {
  return {
    id: row.id,
    binId: row.bin_id,
    communityName: row.community_name,
    binName: row.bin_name,
    message: row.message,
    level: roundToOneDecimal(row.level),
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    readAt: row.read_at,
    acknowledgedAt: row.read_at,
    acknowledgedBy: row.acknowledged_by || null
  };
}

function normalizeEvent(row) {
  const extra = safeParseJson(row.extra_json, {});

  return {
    id: row.id,
    binId: row.bin_id,
    communityName: row.community_name,
    binName: row.bin_name,
    type: row.type,
    level: roundToOneDecimal(row.level),
    message: row.message,
    timestamp: row.timestamp,
    ...extra
  };
}

function persistSelectedBinId(selectedBinId) {
  upsertAppStateStatement.run({
    selectedBinId,
    updatedAt: new Date().toISOString()
  });
}

function persistBin(bin) {
  updateBinStatement.run({
    id: bin.id,
    communityName: bin.communityName,
    binName: bin.binName,
    location: bin.location,
    currentLevel: roundToOneDecimal(bin.currentLevel),
    maxCapacity: roundToOneDecimal(bin.maxCapacity),
    alertThreshold: roundToOneDecimal(bin.alertThreshold),
    fillRate: roundToOneDecimal(bin.fillRate),
    isRunning: bin.isRunning ? 1 : 0,
    status: bin.status,
    emptyCount: bin.emptyCount,
    alertCount: bin.alertCount,
    updatedAt: new Date().toISOString()
  });
}

function persistNewBin(bin) {
  const now = new Date().toISOString();

  const result = insertBinStatement.run({
    communityName: bin.communityName,
    binName: bin.binName,
    location: bin.location,
    currentLevel: roundToOneDecimal(bin.currentLevel),
    maxCapacity: roundToOneDecimal(bin.maxCapacity),
    alertThreshold: roundToOneDecimal(bin.alertThreshold),
    fillRate: roundToOneDecimal(bin.fillRate),
    isRunning: bin.isRunning ? 1 : 0,
    status: bin.status,
    emptyCount: bin.emptyCount,
    alertCount: bin.alertCount,
    createdAt: now,
    updatedAt: now
  });

  return Number(result.lastInsertRowid);
}

function persistNotification(notification) {
  const result = insertNotificationStatement.run({
    binId: notification.binId,
    communityName: notification.communityName,
    binName: notification.binName,
    message: notification.message,
    level: roundToOneDecimal(notification.level),
    isRead: notification.isRead ? 1 : 0,
    createdAt: notification.createdAt,
    readAt: notification.readAt || null
  });

  const excess = db.prepare('SELECT COUNT(*) AS count FROM notifications').get().count - MAX_NOTIFICATIONS;
  if (excess > 0) {
    deleteOldNotificationsStatement.run(excess);
  }

  return Number(result.lastInsertRowid);
}

function markNotificationAcknowledged(notificationId, acknowledgedBy = null, acknowledgedAt = new Date().toISOString()) {
  markNotificationReadStatement.run({
    id: notificationId,
    readAt: acknowledgedAt,
    acknowledgedBy: acknowledgedBy || null
  });
}

function markNotificationRead(notificationId) {
  markNotificationAcknowledged(notificationId, null, new Date().toISOString());
}

function persistEvent(event) {
  const { id, binId, communityName, binName, type, level, message, timestamp, ...extra } = event;

  insertEventStatement.run({
    id,
    binId,
    communityName,
    binName,
    type,
    level,
    message,
    timestamp,
    extraJson: JSON.stringify(extra)
  });

  const cutoffId = id - MAX_EVENTS + 1;
  if (cutoffId > 0) {
    deleteOldEventsStatement.run(cutoffId);
  }
}

function migrateLegacySnapshotIfNeeded() {
  const binCount = db.prepare('SELECT COUNT(*) AS count FROM bins').get().count;
  if (binCount > 0) {
    return;
  }

  const snapshotRow = selectLegacySnapshotStatement.get();
  const legacySnapshot = snapshotRow ? safeParseJson(snapshotRow.snapshot, {}) : {};
  const binState = createBinFromLegacySnapshot(legacySnapshot);
  const binId = persistNewBin(binState);

  persistSelectedBinId(binId);

  if (hasColumn('events', 'bin_id')) {
    db.prepare('UPDATE events SET bin_id = ? WHERE bin_id IS NULL').run(binId);
    db.prepare('UPDATE events SET community_name = COALESCE(community_name, ?), bin_name = COALESCE(bin_name, ?) WHERE bin_id = ?').run(binState.communityName, binState.binName, binId);
  }
}

function hydrateStateFromDatabase(defaultBinState) {
  const seedBins = Array.isArray(defaultBinState) ? defaultBinState : [defaultBinState];
  let bins = selectBinsStatement.all().map(serializeBin);

  if (bins.length === 0) {
    bins = seedBins.map((seedBin) => {
      const binId = persistNewBin(seedBin);

      return {
        id: binId,
        communityName: seedBin.communityName,
        binName: seedBin.binName,
        location: seedBin.location,
        currentLevel: roundToOneDecimal(seedBin.currentLevel),
        maxCapacity: roundToOneDecimal(seedBin.maxCapacity),
        alertThreshold: roundToOneDecimal(seedBin.alertThreshold),
        fillRate: roundToOneDecimal(seedBin.fillRate),
        isRunning: Boolean(seedBin.isRunning),
        status: seedBin.status,
        emptyCount: seedBin.emptyCount,
        alertCount: seedBin.alertCount,
        createdAt: seedBin.createdAt,
        updatedAt: seedBin.updatedAt
      };
    });

    if (bins[0]?.id) {
      persistSelectedBinId(bins[0].id);
    }
  } else {
    migrateLegacySnapshotIfNeeded();
    bins = selectBinsStatement.all().map(serializeBin);
  }

  const appStateRow = selectAppStateStatement.get();
  let selectedBinId = appStateRow?.selected_bin_id || bins[0]?.id || null;

  if (selectedBinId && !bins.some((bin) => bin.id === selectedBinId)) {
    selectedBinId = bins[0]?.id || null;
  }

  if (selectedBinId) {
    persistSelectedBinId(selectedBinId);
  }

  const notifications = selectNotificationsStatement.all(MAX_NOTIFICATIONS).map(serializeNotification);
  const unreadNotificationCount = selectUnreadNotificationCountStatement.get().count;
  const events = selectEventsStatement.all(MAX_EVENTS).map(normalizeEvent);
  const maxEventRow = selectMaxEventIdStatement.get();

  return {
    state: {
      bins,
      selectedBinId,
      notifications,
      unreadNotificationCount,
      events
    },
    nextEventId: Number(maxEventRow.maxId) + 1
  };
}

module.exports = {
  databasePath,
  hydrateStateFromDatabase,
  markNotificationAcknowledged,
  markNotificationRead,
  persistEvent,
  persistNewBin,
  persistNotification,
  persistSelectedBinId,
  persistBin,
  roundToOneDecimal,
  MAX_EVENTS
};
