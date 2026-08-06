const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");
const steamPaths = require("./steamPaths");
const { writeJsonAtomically } = require("./fileUtils");
const {
  isBoundedString,
  validateFavorites,
  validateWatchlist,
  MIN_QUERY_CONCURRENCY,
  MAX_QUERY_CONCURRENCY,
} = require("./validation");

const settingsPath = path.join(app.getPath("userData"), "settings.json");

const defaultSettings = {
  playerName: "",
  launchParams: "",
  steamUsername: "",
  modDirectory: "",
  favorites: [],
  history: [],
  theme: "tactical-dark",
  protonPath: "default",
  audioFeedback: true,
  dxvkAsyncEnabled: true,
  dxvkThreads: "0",
  disableProtonLogs: true,
  enableGameMode: false,
  nativeWayland: false,
  mallocSystem: true,
  maxMem: "16000",
  mallocTrim: true,
  noEsync: false,
  mangoHudEnabled: false,
  mangoHudConfig: "cpu_temp,gpu_temp,ram,fps,frame_timing",
  dxvkConfig: "",
  serverListPageSize: 50,
  queryConcurrency: 500,
  serverListMode: "compact",
  autoRefreshEnabled: false,
  autoRefreshTime: 360,
  modLoadouts: {},
  watchlist: [],
  watchlistThreshold: 50,
  watchlistRefreshEnabled: true,
  watchlistRefreshTime: 10,
  showWatchlistTab: true,
  enableWatchlist: true,
  showDiagnosticsTab: true,
  showHistoryTab: true,
  enableHistory: true,
  layoutMode: "modern",
  listMode: "paging",
  sidebarPinned: false,
  autoSaveFilters: false,
  filterName: "",
  filterPerspective: "all",
  filterCategory: "all",
  filterMaps: [],
  filterCountries: [],
  flagFavoritesOnly: false,
  flagHideFavorites: false,
  flagHideEmpty: false,
  flagHideFull: false,
  flagHistoryOnly: false,
  flagHideLocked: false,
};

const SETTINGS_KEYS = new Set(Object.keys(defaultSettings));

function parseFavKeyInline(favKey) {
  if (typeof favKey !== "string") return null;
  if (favKey.startsWith("[")) {
    const closingBracket = favKey.indexOf("]");
    if (closingBracket === -1) return null;
    const ip = favKey.substring(1, closingBracket);
    const portStr = favKey.substring(closingBracket + 1);
    if (!portStr.startsWith(":")) return null;
    const port = parseInt(portStr.substring(1), 10);
    if (isNaN(port) || port <= 0 || port > 65535) return null;
    return { ip, port };
  }
  const lastColon = favKey.lastIndexOf(":");
  if (lastColon === -1) return null;
  const ip = favKey.substring(0, lastColon);
  const port = parseInt(favKey.substring(lastColon + 1), 10);
  if (isNaN(port) || port <= 0 || port > 65535) return null;
  return { ip, port };
}

let cachedSettings = null;
let settingsLoadPromise = null;

async function loadSettingsAsync() {
  if (cachedSettings !== null) {
    return { ...cachedSettings };
  }

  if (settingsLoadPromise) return settingsLoadPromise;

  settingsLoadPromise = loadSettingsFromDisk();
  try {
    return await settingsLoadPromise;
  } finally {
    settingsLoadPromise = null;
  }
}

async function loadSettingsFromDisk() {

  const settings = { ...defaultSettings };
  let legacyNames = {};
  let legacyPorts = {};
  try {
    const data = await fs.promises.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(data);
    legacyNames = parsed.favoriteNames || {};
    legacyPorts = parsed.favoritePorts || {};
    // Only merge known setting keys to prevent prototype pollution
    for (const key of Object.keys(parsed)) {
      if (SETTINGS_KEYS.has(key)) {
        settings[key] = parsed[key];
      }
    }
  } catch (e) {
    if (e.code !== "ENOENT") {
      console.error("Failed to load settings", e);
    }
  }

  // Migrate old string-format favorites + parallel maps to unified object array
  if (
    Array.isArray(settings.favorites) &&
    settings.favorites.length > 0 &&
    typeof settings.favorites[0] === "string"
  ) {
    const names = legacyNames;
    const ports = legacyPorts;
    settings.favorites = settings.favorites
      .map((key) => {
        const parsed = parseFavKeyInline(key);
        if (!parsed) return null;
        return {
          ip: parsed.ip,
          port: parsed.port,
          queryPort: ports[key] || null,
          name: names[key] || "",
        };
      })
      .filter(Boolean);
    delete settings.favoriteNames;
    delete settings.favoritePorts;
    cachedSettings = { ...settings };
    await saveSettings(settings);
  }

  // Auto-discover if empty
  if (!settings.modDirectory) {
    settings.modDirectory = await steamPaths.findDayzWorkshopFolderAsync();
  }

  cachedSettings = sanitizeSettings(settings);
  return { ...cachedSettings };
}

function sanitizeSettings(settings) {
  const safeSettings = { ...defaultSettings };
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return safeSettings;
  }

  for (const key of SETTINGS_KEYS) {
    if (settings[key] !== undefined) safeSettings[key] = settings[key];
  }

  const booleanKeys = [
    "audioFeedback",
    "dxvkAsyncEnabled",
    "disableProtonLogs",
    "enableGameMode",
    "nativeWayland",
    "mallocSystem",
    "mallocTrim",
    "noEsync",
    "mangoHudEnabled",
    "autoRefreshEnabled",
    "watchlistRefreshEnabled",
    "showWatchlistTab",
    "showDiagnosticsTab",
    "sidebarPinned",
    "autoSaveFilters",
    "flagFavoritesOnly",
    "flagHideFavorites",
    "flagHideEmpty",
    "flagHideFull",
    "flagHistoryOnly",
    "flagHideLocked",
  ];
  for (const key of booleanKeys) {
    if (typeof safeSettings[key] !== "boolean") safeSettings[key] = defaultSettings[key];
  }

  if (!isBoundedString(safeSettings.playerName, 100)) safeSettings.playerName = "";
  if (!isBoundedString(safeSettings.launchParams)) safeSettings.launchParams = "";
  if (!isBoundedString(safeSettings.steamUsername, 100)) safeSettings.steamUsername = "";
  if (!isBoundedString(safeSettings.modDirectory)) safeSettings.modDirectory = "";
  if (!isBoundedString(safeSettings.protonPath)) safeSettings.protonPath = "default";
  if (!isBoundedString(safeSettings.mangoHudConfig, 1000)) safeSettings.mangoHudConfig = defaultSettings.mangoHudConfig;
  if (!isBoundedString(safeSettings.dxvkConfig, 10000)) safeSettings.dxvkConfig = "";
  if (!validateFavorites(safeSettings.favorites)) safeSettings.favorites = [];
  if (!validateWatchlist(safeSettings.watchlist)) safeSettings.watchlist = [];
  if (!Number.isInteger(safeSettings.serverListPageSize) || safeSettings.serverListPageSize < 10 || safeSettings.serverListPageSize > 500) safeSettings.serverListPageSize = defaultSettings.serverListPageSize;
  if (!Number.isInteger(safeSettings.queryConcurrency) || safeSettings.queryConcurrency < MIN_QUERY_CONCURRENCY || safeSettings.queryConcurrency > MAX_QUERY_CONCURRENCY) safeSettings.queryConcurrency = defaultSettings.queryConcurrency;
  if (!Number.isInteger(safeSettings.autoRefreshTime) || safeSettings.autoRefreshTime < 30 || safeSettings.autoRefreshTime > 3600) safeSettings.autoRefreshTime = defaultSettings.autoRefreshTime;
  if (!Number.isInteger(safeSettings.watchlistRefreshTime) || safeSettings.watchlistRefreshTime < 5 || safeSettings.watchlistRefreshTime > 600) safeSettings.watchlistRefreshTime = defaultSettings.watchlistRefreshTime;
  if (!Number.isInteger(safeSettings.watchlistThreshold) || safeSettings.watchlistThreshold < 0 || safeSettings.watchlistThreshold > 10000) safeSettings.watchlistThreshold = defaultSettings.watchlistThreshold;

  return safeSettings;
}

async function saveSettings(settings) {
  try {
    // Prevent storing password if it inadvertently gets passed
    const safeSettings = sanitizeSettings(settings);
    delete safeSettings.steamPassword;

    // Auto-discover if empty
    if (!safeSettings.modDirectory) {
      steamPaths._clearCache();
      safeSettings.modDirectory = await steamPaths.findDayzWorkshopFolderAsync();
    }

    // Update cache immediately
    cachedSettings = { ...safeSettings };

    // Write to disk and await
    await writeJsonAtomically(settingsPath, safeSettings);
    return true;
  } catch (e) {
    console.error("Failed to save settings", e);
    return false;
  }
}

module.exports = {
  loadSettingsAsync,
  saveSettings,
  getDefaultSettings: () => ({ ...defaultSettings }),
  _clearCache: () => {
    cachedSettings = null;
    settingsLoadPromise = null;
  },
};
