const { GameDig } = require("gamedig");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

let userDataPath;
if (process.versions && process.versions.electron) {
  const { app } = require("electron");
  userDataPath = app.getPath("userData");
} else {
  userDataPath = path.join(os.homedir(), ".config", "dzlinux");
}

const QUERY_PORT_CACHE_FILE = path.join(userDataPath, "query_port_cache.json");
const QUERY_PORT_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days per entry

// Module-level singleton — loaded once at startup, shared across all concurrent queries.
// The in-memory Map is the authoritative cache; reads are always against this singleton.
// Writes use a read-merge-write pattern against the on-disk file to survive parallel
// saves from concurrent GameDig queries (especially background batch pinging).
const queryPortCache = loadQueryPortCache();

// Load the GameDig query port cache from disk — returns a Map of "ip:gamePort" → queryPort
// Entries older than QUERY_PORT_CACHE_TTL are silently evicted on load
function loadQueryPortCache() {
  try {
    if (fs.existsSync(QUERY_PORT_CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(QUERY_PORT_CACHE_FILE, "utf8"));
      if (data && data.entries) {
        const now = Date.now();
        const validEntries = new Map();
        for (const [key, entry] of Object.entries(data.entries)) {
          if (entry.timestamp && now - entry.timestamp < QUERY_PORT_CACHE_TTL) {
            validEntries.set(key, { port: entry.port, timestamp: entry.timestamp });
          }
        }
        console.log(
          `Query port cache loaded: ${validEntries.size} valid entries`,
        );
        return validEntries;
      }
    }
  } catch (e) {
    console.error("Failed to read query port cache:", e.message);
  }
  return new Map();
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
      await fs.promises.writeFile(
        QUERY_PORT_CACHE_FILE,
        JSON.stringify({ timestamp: Date.now(), entries }),
        "utf8",
      );
    } catch (e) {
      console.error("Failed to write query port cache:", e.message);
    }
  });
}

function saveQueryPortCacheEntry(cacheKey, port) {
  queryPortCache.set(cacheKey, { port, timestamp: Date.now() });
  triggerWrite();
}

function deleteQueryPortCacheEntry(cacheKey) {
  queryPortCache.delete(cacheKey);
  triggerWrite();
}

module.exports = {
  pingServer: queryServerGameDig,
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
async function queryServerGameDig(ip, port, queryPort) {
  const p = parseInt(port);
  const cacheKey = `${ip}:${p}`;

  // Read from the module-level singleton — never loads from disk mid-flight
  const cached = queryPortCache.get(cacheKey);
  const cachedPort = cached ? cached.port : null;

  // Build port list: queryPort (from hosted list) first, then cached port, then game port
  const queryPorts = [];
  if (queryPort && queryPort > 0 && queryPort <= 65535) {
    queryPorts.push(queryPort);
  }
  if (
    cachedPort !== null &&
    cachedPort > 0 &&
    cachedPort <= 65535 &&
    !queryPorts.includes(cachedPort)
  ) {
    queryPorts.push(cachedPort);
  }
  if (p > 0 && p <= 65535 && !queryPorts.includes(p)) {
    queryPorts.push(p);
  }

  for (const qp of queryPorts) {
    try {
      const state = await GameDig.query({
        type: "dayz",
        host: ip,
        port: qp,
        maxAttempts: 1,
        socketTimeout: 2000,
        attemptTimeout: 10000,
        givenPortOnly: true,
        requestRules: true,
      });

      const players = state.players
        ? state.players.length
        : state.raw && state.raw.numplayers
          ? state.raw.numplayers
          : 0;
      const raw = state.raw || {};

      let mods = null;
      if (Array.isArray(raw.dayzMods)) {
        mods = raw.dayzMods
          .filter((m) => m.workshopId)
          .map((m) => ({
            id: String(m.workshopId),
            name: m.title || `Mod ${m.workshopId}`,
          }));
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
      const modded = tagValues.includes("mod") || (mods && mods.length > 0);
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
      // Cached port failed — the query port likely changed, evict the stale entry.
      // Uses atomic read-merge-write so parallel saves aren't clobbered.
      // Subsequent iterations will scan the regular port offsets and cache the
      // new working port if one is found.
      if (cachedPort !== null && qp === cachedPort) {
        queryPortCache.delete(cacheKey);
        deleteQueryPortCacheEntry(cacheKey);
      }
    }
  }
  return null;
}
