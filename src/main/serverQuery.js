const { GameDig } = require("gamedig");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { writeJsonAtomically } = require("./fileUtils");
const { createQueryLimiter } = require("./queryLimiter");
const queryLimiter = createQueryLimiter();

let userDataPath;
try {
  const { app } = require("electron");
  userDataPath = app.getPath("userData");
} catch {
  userDataPath = path.join(os.homedir(), ".config", "dzlinux");
}

const QUERY_PORT_CACHE_FILE = path.join(userDataPath, "query_port_cache.json");
const QUERY_PORT_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days per entry
const QUERY_PORT_CACHE_MAX_ENTRIES = 5000;

// Module-level singleton — loaded once at startup, shared across all concurrent queries.
// The in-memory Map is the authoritative cache; reads are always against this singleton.
// Writes use a read-merge-write pattern against the on-disk file to survive parallel
// saves from concurrent GameDig queries (especially background batch pinging).
const queryPortCache = new Map();
let cacheLoadPromise = null;
let cacheLoaded = false;

// Load the GameDig query port cache from disk — returns a Map of "ip:gamePort" → queryPort
// Entries older than QUERY_PORT_CACHE_TTL are silently evicted on load
async function ensureQueryPortCacheLoaded() {
  if (cacheLoaded) return;
  if (cacheLoadPromise) return cacheLoadPromise;

  cacheLoadPromise = fs.promises
    .readFile(QUERY_PORT_CACHE_FILE, "utf8")
    .then((content) => {
      const data = JSON.parse(content);
      if (data && data.entries) {
        const now = Date.now();
        for (const [key, entry] of Object.entries(data.entries)) {
          if (entry.timestamp && now - entry.timestamp < QUERY_PORT_CACHE_TTL) {
            queryPortCache.set(key, {
              port: entry.port,
              timestamp: entry.timestamp,
            });
          }
        }
        console.log(`Query port cache loaded: ${queryPortCache.size} valid entries`);
      }
    })
    .catch((e) => {
      if (e.code !== "ENOENT") {
        console.error("Failed to read query port cache:", e.message);
      }
    })
    .finally(() => {
      cacheLoaded = true;
      cacheLoadPromise = null;
    });

  return cacheLoadPromise;
}

let currentWritePromise = Promise.resolve();
let writePending = false;
let writeTimeout = null;

function triggerWrite() {
  writePending = true;
  if (writeTimeout) return;

  writeTimeout = setTimeout(() => {
    writeTimeout = null;
    performWrite();
  }, 1000);
}

function performWrite() {
  if (!writePending) return;
  writePending = false;

  currentWritePromise = currentWritePromise.then(async () => {
    try {
      const entries = {};
      for (const [key, val] of queryPortCache.entries()) {
        entries[key] = { port: val.port, timestamp: val.timestamp };
      }
      await writeJsonAtomically(QUERY_PORT_CACHE_FILE, {
        timestamp: Date.now(),
        entries,
      });
    } catch (e) {
      console.error("Failed to write query port cache:", e.message);
    }
  });
}

function saveQueryPortCacheEntry(cacheKey, port) {
  queryPortCache.set(cacheKey, { port, timestamp: Date.now() });

  // Evict oldest entries when the cache exceeds the max size.
  // Map preserves insertion order, so the first entry is the oldest.
  while (queryPortCache.size > QUERY_PORT_CACHE_MAX_ENTRIES) {
    const oldestKey = queryPortCache.keys().next().value;
    queryPortCache.delete(oldestKey);
  }

  triggerWrite();
}

function deleteQueryPortCacheEntry(cacheKey) {
  queryPortCache.delete(cacheKey);
  triggerWrite();
}

module.exports = {
  // Population/ping sweeps do not need the player roster or Workshop rules.
  pingServer: (ip, port, queryPort, signal) =>
    queryServerGameDig(ip, port, queryPort, signal, true),
  queryServerGameDig,
  getCacheWriteQueue: () => {
    if (writeTimeout) {
      clearTimeout(writeTimeout);
      writeTimeout = null;
      performWrite();
    }
    return currentWritePromise;
  },
};

// Shared GameDig query — tries cached port first (30-day TTL), then game port with
// offsets +1/+2/+3, then Steam query fallback 27016. On success the working port
// is atomically persisted; on cached-port failure the stale entry is evicted.
// Uses a module-level singleton cache to survive parallel batch pinging.
async function queryServerGameDig(ip, port, queryPort, signal, infoOnly = false) {
  if (signal?.aborted) return null;
  const settings = await require("./settings").loadSettingsAsync();
  const concurrency = settings.queryConcurrency;
  queryLimiter.setLimit(Number.isInteger(concurrency)
    ? Math.min(500, Math.max(10, concurrency)) : 150);
  await ensureQueryPortCacheLoaded();
  if (signal?.aborted) return null;
  const p = parseInt(port, 10);
  const cacheKey = `${ip}:${p}`;

  // Read from the module-level singleton — never loads from disk mid-flight
  const cached = queryPortCache.get(cacheKey);
  const cachedPort = cached ? cached.port : null;

  // A recovered cached port is preferable to a potentially stale hosted port
  // during bulk sweeps. Detailed queries still discover all fallback ports.
  const queryPorts = [];
  const preferredPorts = infoOnly ? [cachedPort, queryPort] : [queryPort, cachedPort];
  for (const candidate of preferredPorts) {
    const qp = Number(candidate);
    if (Number.isInteger(qp) && qp > 0 && qp <= 65535 && !queryPorts.includes(qp)) {
      queryPorts.push(qp);
    }
  }

  // Do not scan five extra ports for every offline entry in a 15,000-server
  // sweep. Unlisted addresses and explicit mod queries retain discovery.
  const discoverPorts = !infoOnly || queryPorts.length === 0;
  for (const candidate of discoverPorts ? [p, p + 1, p + 2, p + 3, 27016] : []) {
    if (
      candidate > 0 &&
      candidate <= 65535 &&
      !queryPorts.includes(candidate)
    ) {
      queryPorts.push(candidate);
    }
  }

  for (const qp of queryPorts) {
    if (signal?.aborted) return null;
    try {
      const state = await queryLimiter.run(() => GameDig.query({
        type: "dayz",
        host: ip,
        port: qp,
        maxRetries: 1,
        socketTimeout: infoOnly ? 1000 : 2000,
        attemptTimeout: infoOnly ? 2000 : 10000,
        givenPortOnly: true,
        requestPlayers: false,
        requestRules: !infoOnly,
      }), signal);
      if (signal?.aborted || !state) return null;

      // A2S_INFO includes population even when the player roster is omitted.
      const players = Number.isInteger(state.numplayers)
        ? state.numplayers
        : Number.isInteger(state.raw?.numplayers)
          ? state.raw.numplayers
          : state.players?.length || 0;
      const raw = state.raw || {};

      let mods = null;
      if (Array.isArray(raw.dayzMods)) {
        mods = raw.dayzMods
          .filter((m) => m.workshopId)
          .map((m) => ({
            id: String(m.workshopId),
            name: m.title || `Mod ${m.workshopId}`,
          }));
      } else if (raw.dayzMods && typeof raw.dayzMods === "object" &&
                 Object.keys(raw.dayzMods).length === 0) {
        // GameDig uses an empty object for an empty, successfully read payload.
        mods = [];
      }

      let time = "";
      const tags = raw.tags || {};
      const tagValues = Array.isArray(tags) ? tags : Object.values(tags);
      for (const t of tagValues) {
        if (typeof t === "string" && /^\d{1,2}:\d{2}$/.test(t)) {
          time = t;
          break;
        }
      }

      const thirdPerson = !tagValues.includes("no3rd");
      const modded = tagValues.includes("mod") || Boolean(mods?.length);
      const map = state.map || raw.rules?.island || "";

      // Cache the working query port if it differs from what's already stored.
      // Uses atomic read-merge-write to survive concurrent saves from parallel queries.
      if (qp !== cachedPort) {
        saveQueryPortCacheEntry(cacheKey, qp);
      }

      return {
        ping: state.ping,
        players,
        maxPlayers: state.maxplayers || 60,
        name: state.name,
        status: "online",
        mods,
        time,
        map,
        thirdPerson,
        modded,
        password: state.password || false,
        rawRules: raw.rules || null,
        rawTags: raw.tags || null,
      };
    } catch {
      if (signal?.aborted) return null;
      // Cached port failed — the query port likely changed, evict the stale entry.
      // Uses atomic read-merge-write so parallel saves aren't clobbered.
      // Subsequent iterations will scan the regular port offsets and cache the
      // new working port if one is found.
      if (cachedPort !== null && qp === cachedPort) {
        deleteQueryPortCacheEntry(cacheKey);
      }
    }
  }
  return null;
}
