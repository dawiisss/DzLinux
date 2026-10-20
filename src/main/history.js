const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");
const { writeJsonAtomically } = require("./fileUtils");
const { validateServerAddress, isValidActivityId, sanitizeHistoryPayload } = require("./validation");

let userDataPath;
try {
  userDataPath = require("electron").app.getPath("userData");
} catch {
  userDataPath = path.join(os.homedir(), ".config", "dzlinux");
}
const HISTORY_FILE = path.join(userDataPath, "history.json");
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_RECORDS = 500;
const MAX_SNAPSHOTS = 200;
let memoryHistory = null;
let loadPromise = null;
let mutationQueue = Promise.resolve();
let stopping = false;

const timestamp = (value) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
const ping = (value) => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 60000 ? value : null;
const population = (value) => Number.isInteger(value) && value >= 0 && value <= 10000 ? value : null;
const capacity = (value) => Number.isInteger(value) && value > 0 && value <= 10000 ? value : null;
const text = (value, limit) => typeof value === "string" ? value.slice(0, limit) : "";

function normalizeSnapshot(entry) {
  if (!entry || !timestamp(entry.timestamp)) return null;
  return {
    id: isValidActivityId(entry.id) ? entry.id : randomUUID(),
    timestamp: entry.timestamp,
    ping: ping(entry.ping),
    players: population(entry.players),
    maxPlayers: capacity(entry.maxPlayers),
    map: text(entry.map, 100),
    source: entry.source === "connect-attempt" ? "connect-attempt" : "legacy",
  };
}

function normalizeStore(parsed, now) {
  if (!parsed || !Array.isArray(parsed.records) ||
      (parsed.schemaVersion !== undefined && ![1, 2].includes(parsed.schemaVersion))) {
    throw new Error("History has an unsupported or invalid format");
  }
  const records = new Map();
  for (const value of parsed.records) {
    if (!value || !validateServerAddress(value)) continue;
    const snapshots = (Array.isArray(value.snapshots) ? value.snapshots : [])
      .map(normalizeSnapshot).filter(Boolean)
      .sort((a, b) => a.timestamp - b.timestamp);
    const seen = new Set();
    const unique = snapshots.filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
    const id = value.ip + ":" + Number(value.port);
    const record = {
      id, ip: value.ip, port: Number(value.port),
      queryPort: value.queryPort == null ? null : Number(value.queryPort),
      name: text(value.name, 200) || id,
      map: text(value.map, 100),
      lastJoined: timestamp(value.lastJoined) || unique.at(-1)?.timestamp || null,
      playCount: Number.isSafeInteger(value.playCount) && value.playCount >= 0
        ? value.playCount : unique.length,
      lastPing: ping(value.lastPing),
      lastPlayers: population(value.lastPlayers),
      maxPlayers: capacity(value.maxPlayers),
      snapshots: unique,
      lastActivityId: unique.at(-1)?.id || null,
    };
    if (!record.lastJoined) record.importedAt = timestamp(value.importedAt) || now;
    // Old notes remain inert on disk; no DTO or write API exposes them.
    if (typeof value.customNote === "string") record.customNote = value.customNote;
    const previous = records.get(id);
    if (!previous || (record.lastJoined || 0) > (previous.lastJoined || 0)) records.set(id, record);
  }
  return prune({ schemaVersion: 2, records: [...records.values()] }, now).store;
}

function prune(store, now) {
  const cutoff = now - RETENTION_MS;
  const previousCount = store.records.length;
  store.records = store.records
    .filter((record) => (record.lastJoined || record.importedAt || 0) >= cutoff)
    .sort((a, b) => (b.lastJoined || 0) - (a.lastJoined || 0) || a.id.localeCompare(b.id))
    .slice(0, MAX_RECORDS);
  let changed = previousCount !== store.records.length;
  for (const record of store.records) {
    const length = record.snapshots.length;
    record.snapshots = record.snapshots
      .filter((entry) => entry.timestamp >= cutoff)
      .slice(-MAX_SNAPSHOTS);
    if (length !== record.snapshots.length) changed = true;
    record.lastActivityId = record.snapshots.at(-1)?.id || null;
  }
  return { store, changed };
}

async function importLegacy(now) {
  let entries = [];
  try {
    const settings = JSON.parse(await fs.promises.readFile(path.join(userDataPath, "settings.json"), "utf8"));
    if (Array.isArray(settings.history)) entries = settings.history;
  } catch (error) {
    if (error.code !== "ENOENT") console.warn("Could not import legacy history:", error.message);
  }
  return normalizeStore({
    records: entries.map((entry) => {
      const knownTime = timestamp(entry?.timestamp) || timestamp(entry?.lastJoined);
      return {
        ...entry, lastJoined: knownTime, importedAt: now,
        playCount: knownTime ? 1 : 0,
        lastPing: entry?.ping, lastPlayers: entry?.players,
        snapshots: knownTime ? [{
          timestamp: knownTime, ping: entry.ping, players: entry.players,
          maxPlayers: entry.maxPlayers, map: entry.map, source: "legacy",
        }] : [],
      };
    }),
  }, now);
}

async function ensureLoaded() {
  if (memoryHistory) return memoryHistory;
  if (!loadPromise) {
    loadPromise = (async () => {
      let store;
      let original;
      try {
        original = JSON.parse(await fs.promises.readFile(HISTORY_FILE, "utf8"));
        store = normalizeStore(original, Date.now());
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        store = await importLegacy(Date.now());
      }
      if (!original || JSON.stringify(original) !== JSON.stringify(store)) {
        await writeJsonAtomically(HISTORY_FILE, store);
      }
      memoryHistory = store;
      return store;
    })().finally(() => { loadPromise = null; });
  }
  return loadPromise;
}

function enqueue(operation) {
  if (stopping) return Promise.reject(new Error("History is shutting down"));
  const result = mutationQueue.then(operation);
  mutationQueue = result.catch(() => {});
  return result;
}

function transact(operation) {
  return enqueue(async () => {
    const current = await ensureLoaded();
    const { store: candidate, changed: expired } = prune(structuredClone(current), Date.now());
    const result = await operation(candidate);
    if (expired || result.changed) {
      await writeJsonAtomically(HISTORY_FILE, candidate);
      memoryHistory = candidate;
    }
    return structuredClone(result.value);
  });
}

function summary(record) {
  const { snapshots, customNote, ...value } = record;
  void snapshots;
  void customNote;
  return value;
}

function detail(record) {
  return { ...summary(record), snapshots: record.snapshots };
}

function loadHistory() {
  return transact((store) => ({
    changed: false, value: { schemaVersion: 2, records: store.records.map(detail) },
  }));
}

function saveHistory() {
  return transact(() => ({ changed: true, value: undefined }));
}

function updateSummary(record, server) {
  if (server.name && server.name !== record.id && !server.name.startsWith(server.ip + ":")) {
    record.name = server.name;
  }
  if (server.map) record.map = server.map;
  if (server.queryPort) record.queryPort = server.queryPort;
  if (ping(server.ping)) record.lastPing = ping(server.ping);
  if (population(server.players) !== null) record.lastPlayers = server.players;
  if (capacity(server.maxPlayers) !== null) record.maxPlayers = server.maxPlayers;
}

function updateObservation(entry, server) {
  if (ping(server.ping)) entry.ping = ping(server.ping);
  if (population(server.players) !== null) entry.players = server.players;
  if (capacity(server.maxPlayers) !== null) entry.maxPlayers = server.maxPlayers;
  if (server.map) entry.map = server.map;
}

function recordConnection(payload) {
  const server = sanitizeHistoryPayload(payload);
  if (!server) return Promise.resolve(null);
  return transact(async (store) => {
    const settings = await require("./settings").loadSettingsAsync();
    if (settings.enableHistory === false || settings.showHistoryTab === false) {
      return { changed: false, value: null };
    }
    const id = server.ip + ":" + server.port;
    let record = store.records.find((entry) => entry.id === id);
    if (server.updateOnly) {
      const entry = record?.snapshots.find((snapshot) => snapshot.id === server.activityId);
      if (!entry) return { changed: false, value: null };
      updateObservation(entry, server);
      if (record.lastActivityId === entry.id) updateSummary(record, server);
      return { changed: true, value: detail(record) };
    }
    const now = Date.now();
    if (!record) {
      record = {
        id, ip: server.ip, port: server.port, queryPort: server.queryPort || null,
        name: server.name || id, map: server.map || "", lastJoined: null,
        playCount: 0, lastPing: null, lastPlayers: null, maxPlayers: null,
        lastActivityId: null, snapshots: [],
      };
      store.records.push(record);
    }
    const rapid = record.lastJoined && now >= record.lastJoined && now - record.lastJoined < 15000;
    updateSummary(record, server);
    if (rapid && record.snapshots.length) {
      updateObservation(record.snapshots.at(-1), server);
    } else {
      record.lastJoined = now;
      record.playCount++;
      record.snapshots.push({
        id: randomUUID(), timestamp: now, ping: ping(server.ping),
        players: population(server.players), maxPlayers: capacity(server.maxPlayers),
        map: server.map || "", source: "connect-attempt",
      });
    }
    delete record.importedAt;
    prune(store, now);
    return { changed: true, value: detail(record) };
  });
}

function getHistoryRecords() {
  return transact((store) => ({ changed: false, value: store.records.map(detail) }));
}

function getHistorySummaries() {
  return transact((store) => ({ changed: false, value: store.records.map(summary) }));
}

function deleteHistoryRecord(id) {
  return transact((store) => {
    store.records = store.records.filter((record) => record.id !== id);
    return { changed: true, value: store.records.map(summary) };
  });
}

function clearAllHistory() {
  return transact((store) => {
    store.records = [];
    return { changed: true, value: [] };
  });
}

function getAnalytics(id) {
  return transact((store) => {
    const record = store.records.find((entry) => entry.id === id);
    return { changed: false, value: record ? detail(record) : null };
  });
}

module.exports = {
  loadHistory, saveHistory, recordConnection, getHistoryRecords,
  getHistorySummaries, deleteHistoryRecord, clearAllHistory, getAnalytics,
  flush: () => mutationQueue,
  stop: () => { stopping = true; return mutationQueue; },
};
