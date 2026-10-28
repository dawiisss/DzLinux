const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");
const steamPaths = require("./steamPaths");
const { writeJsonAtomically } = require("./fileUtils");
const {
  isBoundedString,
  normalizeMaxMem,
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
  favoritesSchemaVersion: 1,
  favoritesRevision: 0,
  favoriteGroups: [],
  favoriteNames: {},
  favoritePorts: {},
  favoritesViewSort: "saved",
  favoritesViewGroupId: "all",
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
  queryConcurrency: 150,
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
  enableTrustScore: true,
};

const SETTINGS_KEYS = new Set(Object.keys(defaultSettings));
const VALID_THEMES = new Set([
  "tactical-dark",
  "classic",
  "toxic",
  "amber",
  "deep-sea",
  "vampire",
  "frost-light",
  "solar-light",
  "cyber-neon",
  "forest-moss",
]);

const FAVORITE_FIELDS = ["favorites", "favoritesSchemaVersion", "favoritesRevision", "favoriteGroups", "favoriteNames", "favoritePorts"];
const clone = (value) => JSON.parse(JSON.stringify(value));
let settingsReadError = null;

let cachedSettings = null;
let settingsLoadPromise = null;

async function loadSettingsAsync() {
  if (cachedSettings !== null && !settingsReadError) {
    return clone(cachedSettings);
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
  settingsReadError = null;
  try {
    const data = await fs.promises.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid settings file");
    // Only merge known setting keys to prevent prototype pollution
    for (const key of Object.keys(parsed)) {
      if (SETTINGS_KEYS.has(key)) {
        settings[key] = parsed[key];
      }
    }
  } catch (e) {
    if (e.code !== "ENOENT") {
      settingsReadError = e;
      console.error("Failed to load settings", e);
    }
  }

  // Auto-discover if empty
  if (!settings.modDirectory) {
    settings.modDirectory = await steamPaths.findDayzWorkshopFolderAsync();
  }

  cachedSettings = sanitizeSettings(settings);
  return clone(cachedSettings);
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
    "enableWatchlist",
    "showDiagnosticsTab",
    "showHistoryTab",
    "enableHistory",
    "sidebarPinned",
    "autoSaveFilters",
    "flagFavoritesOnly",
    "flagHideFavorites",
    "flagHideEmpty",
    "flagHideFull",
    "flagHistoryOnly",
    "flagHideLocked",
    "enableTrustScore",
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
  if (!isBoundedString(safeSettings.filterName, 200)) safeSettings.filterName = defaultSettings.filterName;
  safeSettings.maxMem = normalizeMaxMem(safeSettings.maxMem);

  if (
    typeof safeSettings.dxvkThreads === "number" &&
    Number.isSafeInteger(safeSettings.dxvkThreads) &&
    safeSettings.dxvkThreads >= 0
  ) {
    safeSettings.dxvkThreads = String(safeSettings.dxvkThreads);
  } else if (typeof safeSettings.dxvkThreads === "string") {
    const trimmedThreads = safeSettings.dxvkThreads.trim();
    if (/^\d+$/.test(trimmedThreads) && isBoundedString(trimmedThreads, 10)) {
      safeSettings.dxvkThreads = trimmedThreads;
    } else {
      safeSettings.dxvkThreads = defaultSettings.dxvkThreads;
    }
  } else {
    safeSettings.dxvkThreads = defaultSettings.dxvkThreads;
  }

  if (!VALID_THEMES.has(safeSettings.theme)) safeSettings.theme = defaultSettings.theme;
  if (!["all", "1pp", "3pp"].includes(safeSettings.filterPerspective)) safeSettings.filterPerspective = defaultSettings.filterPerspective;
  if (!["all", "vanilla", "modded"].includes(safeSettings.filterCategory)) safeSettings.filterCategory = defaultSettings.filterCategory;
  if (!["standard", "compact"].includes(safeSettings.serverListMode)) safeSettings.serverListMode = defaultSettings.serverListMode;
  if (!["classic", "modern"].includes(safeSettings.layoutMode)) safeSettings.layoutMode = defaultSettings.layoutMode;
  if (!["paging", "virtual"].includes(safeSettings.listMode)) safeSettings.listMode = defaultSettings.listMode;
  // Favorites are validated by their repository. Preserve raw invalid/legacy data
  // during unrelated preference writes instead of silently erasing the collection.
  if (safeSettings.favoritesSchemaVersion === 2) { delete safeSettings.favoriteNames; delete safeSettings.favoritePorts; }
  if (!["saved", "name", "ping", "players", "lastUsed"].includes(safeSettings.favoritesViewSort)) safeSettings.favoritesViewSort = "saved";
  if (!isBoundedString(safeSettings.favoritesViewGroupId, 100)) safeSettings.favoritesViewGroupId = "all";
  if (!validateWatchlist(safeSettings.watchlist)) safeSettings.watchlist = [];
  if (
    !Array.isArray(safeSettings.filterMaps) ||
    !safeSettings.filterMaps.every((m) => isBoundedString(m, 100))
  ) {
    safeSettings.filterMaps = [];
  }
  if (
    !Array.isArray(safeSettings.filterCountries) ||
    !safeSettings.filterCountries.every((c) => isBoundedString(c, 20))
  ) {
    safeSettings.filterCountries = [];
  }
  if (
    !safeSettings.modLoadouts ||
    typeof safeSettings.modLoadouts !== "object" ||
    Array.isArray(safeSettings.modLoadouts)
  ) {
    safeSettings.modLoadouts = {};
  } else {
    const sanitizedLoadouts = {};
    for (const [name, mods] of Object.entries(safeSettings.modLoadouts)) {
      if (isBoundedString(name, 100) && Array.isArray(mods)) {
        sanitizedLoadouts[name] = mods.filter(
          (m) => typeof m === "string" && isBoundedString(m, 50),
        );
      }
    }
    safeSettings.modLoadouts = sanitizedLoadouts;
  }
  if (!Number.isInteger(safeSettings.serverListPageSize) || safeSettings.serverListPageSize < 10 || safeSettings.serverListPageSize > 500) safeSettings.serverListPageSize = defaultSettings.serverListPageSize;
  if (!Number.isInteger(safeSettings.queryConcurrency)) {
    safeSettings.queryConcurrency = defaultSettings.queryConcurrency;
  } else if (safeSettings.queryConcurrency > MAX_QUERY_CONCURRENCY) {
    safeSettings.queryConcurrency = MAX_QUERY_CONCURRENCY;
  } else if (safeSettings.queryConcurrency < MIN_QUERY_CONCURRENCY) {
    safeSettings.queryConcurrency = MIN_QUERY_CONCURRENCY;
  }
  if (!Number.isInteger(safeSettings.autoRefreshTime) || safeSettings.autoRefreshTime < 30 || safeSettings.autoRefreshTime > 3600) safeSettings.autoRefreshTime = defaultSettings.autoRefreshTime;
  if (!Number.isInteger(safeSettings.watchlistRefreshTime) || safeSettings.watchlistRefreshTime < 5 || safeSettings.watchlistRefreshTime > 600) safeSettings.watchlistRefreshTime = defaultSettings.watchlistRefreshTime;
  if (!Number.isInteger(safeSettings.watchlistThreshold) || safeSettings.watchlistThreshold < 0 || safeSettings.watchlistThreshold > 10000) safeSettings.watchlistThreshold = defaultSettings.watchlistThreshold;

  return safeSettings;
}

let settingsSaveQueue = Promise.resolve();

function updateSettings(transform) {
  const result = settingsSaveQueue.then(async () => {
    const current = clone(await loadSettingsAsync());
    if (settingsReadError) throw new Error("Settings could not be read; original file preserved. Repair the file and Retry.");
    await transform(current);
    const candidate = sanitizeSettings(current);
    if (!await persistSettings(candidate)) throw new Error("Could not save settings");
    return clone(cachedSettings);
  });
  settingsSaveQueue = result.catch(() => {});
  return result;
}

function saveSettings(settings) {
  let input;
  try { input = clone(settings); }
  catch { return Promise.resolve(false); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return Promise.resolve(false);
  return updateSettings((current) => {
    for (const key of SETTINGS_KEYS) {
      if (!FAVORITE_FIELDS.includes(key) && Object.hasOwn(input, key)) current[key] = input[key];
    }
  }).then(() => true).catch((error) => { console.error("Failed to save settings", error); return false; });
}

function reloadSettings() {
  const result = settingsSaveQueue.then(() => { cachedSettings = null; return loadSettingsAsync(); });
  settingsSaveQueue = result.catch(() => {});
  return result;
}

async function persistSettings(safeSettings) {
  try {
    // Prevent storing password if it inadvertently gets passed
    delete safeSettings.steamPassword;

    // Auto-discover if empty
    if (!safeSettings.modDirectory) {
      steamPaths._clearCache();
      safeSettings.modDirectory = await steamPaths.findDayzWorkshopFolderAsync();
    }

    // Write to disk and await
    await writeJsonAtomically(settingsPath, safeSettings);
    cachedSettings = { ...safeSettings };
    return true;
  } catch (e) {
    console.error("Failed to save settings", e);
    return false;
  }
}

/**
 * Synchronous settings loader for pre-ready startup only.
 * This MUST NOT be called after app.whenReady() — use loadSettingsAsync() instead.
 * Required because Chromium command-line switches (e.g. Wayland/Ozone flags)
 * must be set before the event loop starts.
 */
function loadSettings() {
  if (cachedSettings !== null) {
    return { ...cachedSettings };
  }
  const settings = { ...defaultSettings };
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, "utf8");
      const parsed = JSON.parse(data);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid settings file");
      }
      for (const key of Object.keys(parsed)) {
        if (SETTINGS_KEYS.has(key)) {
          settings[key] = parsed[key];
        }
      }
    }
  } catch (e) {
    if (e.code !== "ENOENT") {
      console.error("Failed to load settings synchronously:", e);
    }
  }
  return sanitizeSettings(settings);
}

module.exports = {
  loadSettings,
  loadSettingsAsync,
  saveSettings,
  updateSettings,
  reloadSettings,
  flushSettings: () => settingsSaveQueue,
  getDefaultSettings: () => ({ ...defaultSettings }),
  _clearCache: () => {
    cachedSettings = null;
    settingsLoadPromise = null;
    settingsReadError = null;
  },
};
