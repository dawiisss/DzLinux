const axios = require("axios");
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");
const { writeJsonAtomically } = require("./fileUtils");

const CACHE_FILE = path.join(app.getPath("userData"), "server_cache.json");
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MONETIZATION_CACHE_FILE = path.join(
  app.getPath("userData"),
  "monetization_cache.json",
);
const MONETIZATION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const VERIFIED_IPS_CACHE_FILE = path.join(
  app.getPath("userData"),
  "verified_ips_cache.json",
);
const VERIFIED_IPS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
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
      return data.servers.map((s, idx) => ({
        id: `custom-${s.ip.replace(/\./g, "-")}-${s.port}`,
        originalIndex: idx,
        name: s.name || "Unknown Server",
        ip: s.ip,
        port: s.port,
        queryPort: s.queryPort || null,
        players: s.players || 0,
        maxPlayers: s.maxPlayers !== undefined ? s.maxPlayers : 60,
        status: s.status || "offline",
        mods: s.mods || [],
        customList: s.customList !== false,
        ping: s.ping,
        country: s.country || "",
        thirdPerson: s.thirdPerson !== false,
        modded: s.modded !== false,
        time: s.time || "",
        map: s.map || "",
        password: s.password === true,
        monetized: s.monetized,
        realPing: s.realPing,
        failedPing: s.failedPing,
      }));
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
    const optimized = servers.map((s) => {
      const opt = {
        name: s.name,
        ip: s.ip,
        port: s.port,
      };
      if (s.queryPort) opt.queryPort = s.queryPort;
      if (s.players) opt.players = s.players;
      if (s.maxPlayers !== undefined && s.maxPlayers !== 60) opt.maxPlayers = s.maxPlayers;
      if (s.status && s.status !== "offline") opt.status = s.status;
      if (s.mods && s.mods.length > 0) opt.mods = s.mods;
      if (s.customList === false) opt.customList = false;
      if (s.ping !== undefined) opt.ping = s.ping;
      if (s.country) opt.country = s.country;
      if (s.thirdPerson === false) opt.thirdPerson = false;
      if (s.modded === false) opt.modded = false;
      if (s.time) opt.time = s.time;
      if (s.map) opt.map = s.map;
      if (s.password === true) opt.password = true;
      if (s.monetized) opt.monetized = s.monetized;
      if (s.realPing !== undefined) opt.realPing = s.realPing;
      if (s.failedPing) opt.failedPing = s.failedPing;
      return opt;
    });

    // Optimize: Use asynchronous write to prevent blocking the Node.js event loop
    // during potentially large JSON stringification and file I/O operations.
    await writeJsonAtomically(CACHE_FILE, {
      timestamp: Date.now(),
      servers: optimized,
    });
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
    await writeJsonAtomically(MONETIZATION_CACHE_FILE, {
      timestamp: Date.now(),
      ips: [...monetizedSet],
    });
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
    await writeJsonAtomically(MODS_METADATA_CACHE_FILE, {
      timestamp: Date.now(),
      entries,
    });
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
        password: !!result.password,
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
      const isClientError = err.response && err.response.status >= 400 && err.response.status < 500;
      if (attempt === retries || isClientError) throw err;
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
    if (existingIdx !== -1 && servers[existingIdx]) {
      servers[existingIdx] = {
        ...servers[existingIdx],
        ...custom,
        customList: true,
        originalIndex: existingIdx,
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
        password:
          custom.password !== undefined
            ? custom.password
            : (cachedEntry && cachedEntry.password !== undefined
                ? cachedEntry.password
                : false),
      });
      serversMap.set(mapKey, servers.length - 1);
    }
  });
  return servers;
}

function injectFavoritesPlaceholders(servers, favorites, serversMap) {
  if (favorites && favorites.length > 0) {
    const added = [];
    favorites.forEach((fav) => {
      const ip = fav.ip;
      const port = typeof fav.port === "number" ? fav.port : parseInt(fav.port, 10);
      const mapKey = `${ip}:${port}`;
      const exists = serversMap.has(mapKey);
      if (!exists) {
        added.push({
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
      }
    });

    if (added.length > 0) {
      // Shift existing indices in serversMap and originalIndex on server objects
      for (const [key, value] of serversMap.entries()) {
        serversMap.set(key, value + added.length);
      }
      servers.forEach((s) => {
        if (s.originalIndex !== undefined) {
          s.originalIndex += added.length;
        }
      });
      // Register new indices in serversMap and set originalIndex on placeholders
      added.forEach((item, idx) => {
        item.originalIndex = idx;
        const mapKey = `${item.ip}:${item.port}`;
        serversMap.set(mapKey, idx);
      });
      // Prepend to servers array
      servers.unshift(...added);
    }
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

async function loadVerifiedIpsCache() {
  try {
    const content = await fs.promises.readFile(VERIFIED_IPS_CACHE_FILE, "utf8");
    const data = JSON.parse(content);
    if (
      data.timestamp &&
      Date.now() - data.timestamp < VERIFIED_IPS_CACHE_TTL &&
      Array.isArray(data.servers)
    ) {
      return data.servers;
    }
  } catch (e) {
    if (e.code !== "ENOENT") {
      console.error("Failed to load verified IPs cache:", e.message);
    }
  }
  return null;
}

async function saveVerifiedIpsCache(verifiedServers) {
  try {
    await writeJsonAtomically(VERIFIED_IPS_CACHE_FILE, {
      timestamp: Date.now(),
      servers: verifiedServers,
    });
  } catch (e) {
    console.error("Failed to write verified IPs cache", e.message);
  }
}

async function fetchAndApplyVerifiedIps(servers) {
  try {
    let verifiedServers = await loadVerifiedIpsCache();
    if (verifiedServers) {
      console.log(
        `Using cached verified IPs list (${verifiedServers.length} servers).`,
      );
    } else {
      console.log("Fetching Verified IPs List...");
      const res = await axios.get(
        "https://raw.githubusercontent.com/dawiisss/DzLinux/main/verified_ips.json",
        { timeout: 5000 },
      );
      verifiedServers = res.data.verified_servers;
      if (Array.isArray(verifiedServers)) {
        await saveVerifiedIpsCache(verifiedServers);
        console.log(
          `Successfully fetched ${verifiedServers.length} verified servers.`,
        );
      }
    }

    if (Array.isArray(verifiedServers)) {
      const verifiedMap = new Map();
      verifiedServers.forEach(v => {
        verifiedMap.set(`${v.ip}:${v.port}`, v.community);
      });
      servers.forEach((s) => {
        const community = verifiedMap.get(`${s.ip}:${s.port}`);
        if (community) {
          s.verifiedCommunity = community;
        }
      });
    }
  } catch (e) {
    console.error("Failed to fetch verified IPs list:", e.message);
  }
}

let currentGenerationId = null;

async function fetchDayZServers(onBatchReceived = () => {}, generationId) {
  currentGenerationId = generationId;
  const isAborted = () => generationId !== undefined && currentGenerationId !== generationId;

  try {
    if (isAborted()) return [];
    // 1. Check Server cache
    const cached = await loadServerCache();
    if (cached) {
      console.log(`Using cached server list (${cached.length} servers).`);
      return cached;
    }

    const settingsManager = require("./settings");
    const settings = await settingsManager.loadSettingsAsync();
    const modsMetadataCache = await loadModsMetadataCache();

    console.log(
      "Fetching servers from Hosted List and Custom List (Phonebook Pattern)...",
    );

    // 2. Fetch data sources concurrently
    const [hostedData, customData] = await Promise.all([
      fetchHostedServers(),
      loadLocalCustomServers(),
    ]);

    if (isAborted()) return [];

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

    if (isAborted()) return servers;

    // 6. Monetization check & Tagging
    await fetchAndApplyMonetization(servers);

    // 6.5 Verified IPs
    if (settings.enableTrustScore !== false) {
      await fetchAndApplyVerifiedIps(servers);
    }

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
