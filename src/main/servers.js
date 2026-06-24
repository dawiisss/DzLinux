const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const CACHE_FILE = path.join(app.getPath("userData"), "server_cache.json");
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MONETIZATION_CACHE_FILE = path.join(
  app.getPath("userData"),
  "monetization_cache.json",
);
const MONETIZATION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const MODS_METADATA_CACHE_FILE = path.join(
  app.getPath("userData"),
  "mods_metadata_cache.json",
);
const MODS_METADATA_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours per entry

async function loadServerCache() {
  try {
    const content = await fs.promises.readFile(CACHE_FILE, "utf8");
    const data = JSON.parse(content);
    if (
      data.timestamp &&
      Date.now() - data.timestamp < CACHE_TTL_MS &&
      Array.isArray(data.servers)
    ) {
      return data.servers;
    }
  } catch (e) {
    if (e.code !== "ENOENT") {
      console.error("Failed to load server cache:", e.message);
    }
  }
  return null;
}

async function saveServerCache(servers) {
  try {
    // Optimize: Use asynchronous write to prevent blocking the Node.js event loop
    // during potentially large JSON stringification and file I/O operations.
    await fs.promises.writeFile(
      CACHE_FILE,
      JSON.stringify({ timestamp: Date.now(), servers }),
      "utf8",
    );
  } catch (e) {
    console.error("Failed to write server cache", e.message);
  }
}

async function loadMonetizationCache() {
  try {
    const content = await fs.promises.readFile(MONETIZATION_CACHE_FILE, "utf8");
    const data = JSON.parse(content);
    if (
      data.timestamp &&
      Date.now() - data.timestamp < MONETIZATION_CACHE_TTL &&
      Array.isArray(data.ips)
    ) {
      return new Set(data.ips);
    }
  } catch (e) {
    if (e.code !== "ENOENT") {
      console.error("Failed to load monetization cache:", e.message);
    }
  }
  return null;
}

async function saveMonetizationCache(monetizedSet) {
  try {
    await fs.promises.writeFile(
      MONETIZATION_CACHE_FILE,
      JSON.stringify({
        timestamp: Date.now(),
        ips: [...monetizedSet],
      }),
      "utf8",
    );
  } catch (e) {
    console.error("Failed to write monetization cache", e.message);
  }
}

// Load the persistent mods & metadata cache, returning a Map of IP:port -> entry
// Each entry has its own timestamp; entries older than MODS_METADATA_CACHE_TTL are evicted
async function loadModsMetadataCache() {
  try {
    const content = await fs.promises.readFile(MODS_METADATA_CACHE_FILE, "utf8");
    const data = JSON.parse(content);
    if (data && data.entries) {
      const now = Date.now();
      const validEntries = new Map();
      for (const [key, entry] of Object.entries(data.entries)) {
        // Only include entries that haven't expired yet
        if (
          entry.timestamp &&
          now - entry.timestamp < MODS_METADATA_CACHE_TTL
        ) {
          validEntries.set(key, entry);
        }
      }
      console.log(
        `Loaded mods metadata cache with ${validEntries.size} valid entries`,
      );
      return validEntries;
    }
  } catch (e) {
    if (e.code !== "ENOENT") {
      console.error("Failed to read mods metadata cache:", e.message);
    }
  }
  return new Map();
}

// Save the full mods metadata cache map to disk
async function saveModsMetadataCache(entriesMap) {
  try {
    const entries = {};
    for (const [key, value] of entriesMap) {
      entries[key] = value;
    }
    await fs.promises.writeFile(
      MODS_METADATA_CACHE_FILE,
      JSON.stringify({
        timestamp: Date.now(),
        entries,
      }),
      "utf8",
    );
    console.log(
      `Saved mods metadata cache with ${Object.keys(entries).length} entries`,
    );
  } catch (e) {
    console.error("Failed to write mods metadata cache:", e.message);
  }
}

// Refresh mods & metadata for a single server by querying via GameDig A2S
// Updates only that server's entry in the persistent cache, leaves other entries intact
async function refreshServerModCache(ip, port, queryPort) {
  try {
    const cache = await loadModsMetadataCache();
    const key = `${ip}:${port}`;

    console.log(`Refreshing mods cache for ${key} via GameDig...`);
    const { queryServerGameDig } = require("./serverQuery");
    const result = await queryServerGameDig(ip, port, queryPort);

    if (result && result.mods && result.mods.length > 0) {
      const entry = {
        timestamp: Date.now(),
        mods: result.mods,
        country: "",
        thirdPerson: result.thirdPerson,
        password: false,
        time: result.time || "",
        modded: result.modded,
        map: result.map || "",
      };
      cache.set(key, entry);
      await saveModsMetadataCache(cache);
      console.log(
        `Mods cache refreshed for ${key}: ${result.mods.length} mods found`,
      );
      return entry;
    }

    // Server not reachable via GameDig — store empty entry
    const emptyEntry = {
      timestamp: Date.now(),
      mods: [],
      country: "",
      thirdPerson: true,
      password: false,
      time: "",
      modded: false,
      map: "",
    };
    cache.set(key, emptyEntry);
    await saveModsMetadataCache(cache);
    console.log(
      `Mods cache: saved empty entry for ${key} (server not reachable via GameDig)`,
    );
    return emptyEntry;
  } catch (e) {
    console.error(`Failed to refresh mods cache for ${ip}:${port}:`, e.message);
    return null;
  }
}

async function axiosGetWithRetry(url, options = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await axios.get(url, {
        ...options,
        timeout: options.timeout || 10000,
      });
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = Math.pow(2, attempt) * 500;
      console.log(`Retry ${attempt}/${retries} for ${url} after ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function fetchHostedServers() {
  const primaryUrl =
    "https://cdn.jsdelivr.net/gh/dawiisss/DzLinux@main/hosted_servers.json";
  const fallbackUrl =
    "https://raw.githubusercontent.com/dawiisss/DzLinux/main/hosted_servers.json";

  try {
    console.log(`Loading hosted servers from ${primaryUrl}...`);
    const hostedRes = await axiosGetWithRetry(
      primaryUrl,
      {
        timeout: 5000,
        headers: {
          "Cache-Control": "no-cache",
          "Accept-Encoding": "identity",
        },
      },
      2,
    );
    if (Array.isArray(hostedRes.data)) {
      return hostedRes.data;
    }
  } catch {
    console.warn(
      `Primary CDN failed, falling back to raw github: ${fallbackUrl}`,
    );
    try {
      const hostedFallbackRes = await axiosGetWithRetry(
        fallbackUrl,
        { timeout: 5000 },
        2,
      );
      if (Array.isArray(hostedFallbackRes.data)) {
        return hostedFallbackRes.data;
      }
    } catch (fallbackErr) {
      console.error(
        "Failed to fetch hosted servers from both primary and fallback URLs:",
        fallbackErr.message,
      );
    }
  }
  return [];
}

async function loadLocalCustomServers() {
  try {
    const userDataPath = app.getPath("userData");
    const customServersPath = path.join(userDataPath, "custom_servers.json");
    const exists = await fs.promises.access(customServersPath).then(() => true).catch(() => false);
    if (exists) {
      console.log("Loading custom_servers.json...");
      const content = await fs.promises.readFile(customServersPath, "utf8");
      const customData = JSON.parse(content);
      if (Array.isArray(customData)) {
        return customData;
      }
    }
  } catch (err) {
    console.error("Failed to parse custom_servers.json:", err.message);
  }
  return [];
}

function buildPhonebookServers(allCustomData, modsMetadataCache, serversMap) {
  const servers = [];
  allCustomData.forEach((custom) => {
    const cacheKey = `${custom.ip}:${custom.port}`;
    const cachedEntry = modsMetadataCache.get(cacheKey);

    const mapKey = `${custom.ip}:${custom.port}`;
    const existingIdx = serversMap.has(mapKey) ? serversMap.get(mapKey) : -1;
    if (existingIdx !== -1) {
      servers[existingIdx] = {
        ...servers[existingIdx],
        ...custom,
        customList: true,
        originalIndex: servers.length,
      };
    } else {
      const resolvedMods =
        custom.mods && custom.mods.length > 0
          ? custom.mods
          : cachedEntry && cachedEntry.mods
            ? cachedEntry.mods
            : [];

      servers.push({
        id: `custom-${custom.ip.replace(/\./g, "-")}-${custom.port}`,
        originalIndex: servers.length,
        name: custom.name || "Unknown Server",
        ip: custom.ip,
        port: custom.port,
        queryPort: custom.queryPort || null,
        players: 0,
        maxPlayers: 60,
        status: "offline",
        mods: resolvedMods,
        customList: true,
        ping: undefined,
        country:
          custom.country || (cachedEntry ? cachedEntry.country : "") || "",
        thirdPerson: custom.thirdPerson !== false,
        modded:
          (custom.mods && custom.mods.length > 0) ||
          (cachedEntry &&
            cachedEntry.mods &&
            cachedEntry.mods.length > 0) ||
          custom.modded !== false,
        time: custom.time || (cachedEntry ? cachedEntry.time : "") || "",
        map: custom.map || (cachedEntry ? cachedEntry.map : "") || "",
      });
      serversMap.set(mapKey, servers.length - 1);
    }
  });
  return servers;
}

function injectFavoritesPlaceholders(servers, favorites, serversMap) {
  if (favorites && favorites.length > 0) {
    favorites.forEach((fav) => {
      const ip = fav.ip;
      const port = typeof fav.port === "number" ? fav.port : parseInt(fav.port);
      const mapKey = `${ip}:${port}`;
      const exists = serversMap.has(mapKey);
      if (!exists) {
        servers.unshift({
          id: `fav-${ip.replace(/\./g, "-")}-${port}`,
          name: fav.name || "Favorited Server",
          ip: ip,
          port: port,
          queryPort: fav.queryPort || null,
          players: 0,
          maxPlayers: 60,
          status: "offline",
          mods: [],
          customList: true,
          ping: undefined,
          country: "",
          thirdPerson: true,
          modded: true,
          time: "",
          map: "",
        });
        serversMap.set(mapKey, 0);
      }
    });
  }
}

async function fetchAndApplyMonetization(servers) {
  try {
    let monetizedSet = await loadMonetizationCache();
    if (monetizedSet) {
      console.log(
        `Using cached monetization list (${monetizedSet.size} servers).`,
      );
    } else {
      console.log("Fetching Bohemia Monetization Approved List...");
      const bohemiaRes = await axios.get(
        "https://www.bohemia.net/monetization/approved/dayz",
        { timeout: 5000 },
      );
      const html = bohemiaRes.data;
      monetizedSet = new Set();
      const regex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*:\s*(\d+)/g;
      let match;
      while ((match = regex.exec(html)) !== null) {
        monetizedSet.add(`${match[1]}:${match[2]}`);
      }
      await saveMonetizationCache(monetizedSet);
      console.log(
        `Successfully tagged ${monetizedSet.size} monetized servers.`,
      );
    }

    servers.forEach((s) => {
      if (monetizedSet.has(`${s.ip}:${s.port}`)) {
        s.monetized = true;
      }
    });
  } catch (e) {
    console.error("Failed to fetch monetization list:", e.message);
  }
}

async function fetchDayZServers(onBatchReceived = () => {}, generationId) {
  try {
    // 1. Check Server cache
    const cached = await loadServerCache();
    if (cached) {
      console.log(`Using cached server list (${cached.length} servers).`);
      return cached;
    }

    const settingsManager = require("./settings");
    const settings = settingsManager.loadSettings();
    const modsMetadataCache = await loadModsMetadataCache();

    console.log(
      "Fetching servers from Hosted List and Custom List (Phonebook Pattern)...",
    );

    // 2. Fetch data sources concurrently
    const [hostedData, customData] = await Promise.all([
      fetchHostedServers(),
      loadLocalCustomServers(),
    ]);

    const allCustomData = hostedData.concat(customData);
    const serversMap = new Map();

    // 3. Process custom and hosted servers
    const servers = buildPhonebookServers(allCustomData, modsMetadataCache, serversMap);

    // 4. Inject unlisted favorites
    injectFavoritesPlaceholders(servers, settings.favorites, serversMap);

    // 5. Stream initial batch to front-end
    if (servers.length > 0) {
      onBatchReceived(servers, generationId);
    }

    // 6. Monetization check & Tagging
    await fetchAndApplyMonetization(servers);

    // 7. Save to cache asynchronously
    await saveServerCache(servers);

    return servers;
  } catch (e) {
    console.error("Failed to fetch DayZ servers", e.message);
    return [];
  }
}

module.exports = {
  fetchDayZServers,
  refreshServerModCache,
  axiosGetWithRetry,
};
