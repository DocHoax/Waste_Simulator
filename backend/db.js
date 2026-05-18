const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const MAX_EVENTS = 1000;
const dataDirectory = path.join(__dirname, 'data');
const databasePath = path.join(dataDirectory, 'waste-simulator.db');

fs.mkdirSync(dataDirectory, { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS state_snapshot (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    snapshot TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL,
    level REAL NOT NULL,
    message TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    extra_json TEXT
  );
`);

const selectSnapshotStatement = db.prepare('SELECT snapshot FROM state_snapshot WHERE id = 1');
const upsertSnapshotStatement = db.prepare(`
  INSERT INTO state_snapshot (id, snapshot, updated_at)
  VALUES (1, @snapshot, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET
    snapshot = excluded.snapshot,
    updated_at = excluded.updated_at
`);
const insertEventStatement = db.prepare(`
  INSERT INTO events (id, type, level, message, timestamp, extra_json)
  VALUES (@id, @type, @level, @message, @timestamp, @extraJson)
`);
const selectEventsStatement = db.prepare('SELECT id, type, level, message, timestamp, extra_json FROM events ORDER BY id DESC LIMIT ?');
const selectMaxEventIdStatement = db.prepare('SELECT COALESCE(MAX(id), 0) AS maxId FROM events');
const deleteOldEventsStatement = db.prepare('DELETE FROM events WHERE id < ?');

function stripTransientFields(state) {
  const { events, clientCount, ...snapshot } = state;
  return snapshot;
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

function normalizeEvent(row) {
  const extra = safeParseJson(row.extra_json, {});

  return {
    id: row.id,
    type: row.type,
    level: row.level,
    message: row.message,
    timestamp: row.timestamp,
    ...extra
  };
}

function persistStateSnapshot(state) {
  upsertSnapshotStatement.run({
    snapshot: JSON.stringify(stripTransientFields(state)),
    updatedAt: new Date().toISOString()
  });
}

function persistEvent(event) {
  const { id, type, level, message, timestamp, ...extra } = event;

  insertEventStatement.run({
    id,
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

function hydrateStateFromDatabase(defaultState) {
  const snapshotRow = selectSnapshotStatement.get();
  const persistedState = snapshotRow ? safeParseJson(snapshotRow.snapshot, {}) : {};
  const restoredState = {
    ...defaultState,
    ...persistedState,
    events: []
  };

  restoredState.events = selectEventsStatement.all(MAX_EVENTS).map(normalizeEvent);

  if (!snapshotRow) {
    persistStateSnapshot(restoredState);
  }

  const maxEventRow = selectMaxEventIdStatement.get();

  return {
    state: restoredState,
    nextEventId: Number(maxEventRow.maxId) + 1
  };
}

module.exports = {
  databasePath,
  hydrateStateFromDatabase,
  persistEvent,
  persistStateSnapshot,
  MAX_EVENTS
};
