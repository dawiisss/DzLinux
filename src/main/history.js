const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { writeJsonAtomically } = require("./fileUtils");

let userDataPath;
try {
  const { app } = require("electron");
  userDataPath = app.getPath("userData");
} catch {
  userDataPath = path.join(os.homedir(), ".config", "dzlinux");
}

const HISTORY_FILE = path.join(userDataPath, "history.json");
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_RECORDS = 500;
const MAX_SNAPSHOTS_PER_RECORD = 200;

let memoryHistory = null;

/**
 * Loads history from history.json or migrates legacy settings.history if needed.
 */
async function loadHistory() {
  if (memoryHistory) return memoryHistory;

  try {
    const raw = await fs.promises.readFile(HISTORY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.records)) {
      memoryHistory = parsed;
      pruneInMemoryHistory();
      return memoryHistory;
    }
  } catch {
    // File doesn't exist or invalid JSON, fall through to fallback/migration
  }

  memoryHistory = { records: [] };

  // Attempt migration from settings.json if available
  try {
    const settingsPath = path.join(userDataPath, "settings.json");
    const rawSettings = await fs.promises.readFile(settingsPath, "utf8");
    const settings = JSON.parse(rawSettings);
    if (Array.isArray(settings.history) && settings.history.length > 0) {
      const now = Date.now();
      memoryHistory.records = settings.history.map((h, idx) => ({
        id: `${h.ip}:${h.port}`,
        ip: String(h.ip),
        port: parseInt(h.port, 10),
        name: h.name && !h.name.startsWith(`${h.ip}:`) ? h.name : `${h.ip}:${h.port}`,
        map: h.map || "Chernarus",
        lastJoined: now - idx * 60000,
        playCount: 1,
        lastPing: typeof h.ping === "number" ? h.ping : 0,
        lastPlayers: typeof h.players === "number" ? h.players : 0,
        maxPlayers: typeof h.maxPlayers === "number" ? h.maxPlayers : 60,
        customNote: "",
        snapshots: [
          {
            timestamp: now - idx * 60000,
            players: typeof h.players === "number" ? h.players : 0,
            maxPlayers: typeof h.maxPlayers === "number" ? h.maxPlayers : 60,
            ping: typeof h.ping === "number" ? h.ping : 0,
          },
        ],
      }));
    }
  } catch {
    // No legacy settings file
  }

  await saveHistory();
  return memoryHistory;
}

/**
 * Persists memoryHistory atomically to disk.
 */
async function saveHistory() {
  if (!memoryHistory) return;
  pruneInMemoryHistory();
  await writeJsonAtomically(HISTORY_FILE, memoryHistory);
}

/**
 * Prunes snapshots older than 30 days and enforces maximum record counts.
 */
function pruneInMemoryHistory() {
  if (!memoryHistory || !Array.isArray(memoryHistory.records)) return;

  const cutoff = Date.now() - RETENTION_MS;

  memoryHistory.records = memoryHistory.records.filter((rec) => {
    if (!rec || !rec.ip || !rec.port) return false;
    return rec.lastJoined >= cutoff;
  });

  // Sort by lastJoined desc
  memoryHistory.records.sort((a, b) => b.lastJoined - a.lastJoined);

  // Cap records count
  if (memoryHistory.records.length > MAX_RECORDS) {
    memoryHistory.records = memoryHistory.records.slice(0, MAX_RECORDS);
  }

  // Prune snapshots per record
  for (const rec of memoryHistory.records) {
    if (Array.isArray(rec.snapshots)) {
      rec.snapshots = rec.snapshots.filter((s) => s.timestamp >= cutoff);
      if (rec.snapshots.length > MAX_SNAPSHOTS_PER_RECORD) {
        rec.snapshots = rec.snapshots.slice(-MAX_SNAPSHOTS_PER_RECORD);
      }
    } else {
      rec.snapshots = [];
    }
  }
}

/**
 * Records or updates a server connection session.
 */
async function recordConnection(server) {
  if (!server || !server.ip || !server.port) return;

  // Respect user setting: skip recording connection history if tracking or history tab is disabled
  const settingsManager = require("./settings");
  try {
    const settings = await settingsManager.loadSettingsAsync();
    if (settings && (settings.enableHistory === false || settings.showHistoryTab === false)) {
      return;
    }
  } catch {
    // Ignore error loading settings
  }

  await loadHistory();

  const ipStr = String(server.ip);
  const portNum = parseInt(server.port, 10);
  const serverId = `${ipStr}:${portNum}`;
  const now = Date.now();

  let record = memoryHistory.records.find((r) => r.id === serverId);

  const hasCleanName = server.name && server.name !== serverId && !server.name.startsWith(`${ipStr}:`);
  const nameToUse = hasCleanName
    ? server.name
    : (record && record.name && !record.name.startsWith(`${ipStr}:`) ? record.name : serverId);
  const mapToUse = server.map || (record ? record.map : "Chernarus");
  const pingToUse = typeof server.ping === "number" && server.ping > 0 ? server.ping : (record ? record.lastPing || 0 : 0);
  const playersToUse = typeof server.players === "number" ? server.players : (record ? record.lastPlayers || 0 : 0);
  const maxPlayersToUse = typeof server.maxPlayers === "number" && server.maxPlayers > 0 ? server.maxPlayers : (record ? record.maxPlayers || 60 : 60);

  if (record) {
    record.lastJoined = now;
    record.playCount = (record.playCount || 1) + 1;
    record.name = nameToUse;
    record.map = mapToUse;
    record.lastPing = pingToUse;
    record.lastPlayers = playersToUse;
    record.maxPlayers = maxPlayersToUse;
  } else {
    record = {
      id: serverId,
      ip: ipStr,
      port: portNum,
      name: nameToUse,
      map: mapToUse,
      lastJoined: now,
      playCount: 1,
      lastPing: pingToUse,
      lastPlayers: playersToUse,
      maxPlayers: maxPlayersToUse,
      customNote: "",
      snapshots: [],
    };
    memoryHistory.records.push(record);
  }

  record.snapshots.push({
    timestamp: now,
    players: playersToUse,
    maxPlayers: maxPlayersToUse,
    ping: pingToUse,
  });

  await saveHistory();
  return record;
}

/**
 * Returns all active history records sorted by lastJoined desc.
 */
async function getHistoryRecords() {
  await loadHistory();
  return memoryHistory.records;
}

/**
 * Deletes a single history record by ID (ip:port).
 */
async function deleteHistoryRecord(id) {
  await loadHistory();
  memoryHistory.records = memoryHistory.records.filter((r) => r.id !== id);
  await saveHistory();
  return memoryHistory.records;
}

/**
 * Clears all history records.
 */
async function clearAllHistory() {
  memoryHistory = { records: [] };
  await saveHistory();
  return memoryHistory.records;
}

/**
 * Updates a custom note for a server.
 */
async function saveServerNote(serverId, note) {
  await loadHistory();
  const record = memoryHistory.records.find((r) => r.id === serverId);
  if (!record) {
    throw new Error(`History record not found: ${serverId}`);
  }
  record.customNote = (note || "").slice(0, 500);
  await saveHistory();
  return record;
}

/**
 * Gets analytics data (snapshots and stats) for a specific server.
 */
async function getAnalytics(serverId) {
  await loadHistory();
  const record = memoryHistory.records.find((r) => r.id === serverId);
  if (!record) return null;

  return {
    id: record.id,
    name: record.name,
    ip: record.ip,
    port: record.port,
    map: record.map,
    lastJoined: record.lastJoined,
    playCount: record.playCount,
    lastPing: record.lastPing,
    lastPlayers: record.lastPlayers,
    maxPlayers: record.maxPlayers,
    customNote: record.customNote || "",
    snapshots: record.snapshots || [],
  };
}

module.exports = {
  loadHistory,
  saveHistory,
  recordConnection,
  getHistoryRecords,
  deleteHistoryRecord,
  clearAllHistory,
  saveServerNote,
  getAnalytics,
};
