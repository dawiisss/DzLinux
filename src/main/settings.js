const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");
const steamPaths = require("./steamPaths");

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
  showDiagnosticsTab: true,
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

function findDayzWorkshopFolder() {
  return steamPaths.findDayzWorkshopFolder();
}

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

function loadSettings() {
  if (cachedSettings !== null) {
    return { ...cachedSettings };
  }

  const settings = { ...defaultSettings };
  let legacyNames = {};
  let legacyPorts = {};
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, "utf8");
      const parsed = JSON.parse(data);
      legacyNames = parsed.favoriteNames || {};
      legacyPorts = parsed.favoritePorts || {};
      // Only merge known setting keys to prevent prototype pollution
      for (const key of Object.keys(parsed)) {
        if (SETTINGS_KEYS.has(key)) {
          settings[key] = parsed[key];
        }
      }
    }
  } catch (e) {
    console.error("Failed to load settings", e);
  }

  // Migrate old string-format favorites + parallel maps to unified object array
  if (
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
    saveSettings(settings);
  }

  // Auto-discover if empty
  if (!settings.modDirectory) {
    settings.modDirectory = findDayzWorkshopFolder();
  }

  cachedSettings = { ...settings };
  return settings;
}

async function saveSettings(settings) {
  try {
    // Prevent storing password if it inadvertently gets passed
    const safeSettings = { ...settings };
    delete safeSettings.steamPassword;

    // Auto-discover if empty
    if (!safeSettings.modDirectory) {
      steamPaths._clearCache();
      safeSettings.modDirectory = await steamPaths.findDayzWorkshopFolderAsync();
    }

    // Update cache immediately
    cachedSettings = { ...safeSettings };

    // Write to disk and await
    await fs.promises.writeFile(settingsPath, JSON.stringify(safeSettings, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("Failed to save settings", e);
    return false;
  }
}

module.exports = {
  loadSettings,
  saveSettings,
  getDefaultSettings: () => ({ ...defaultSettings }),
  _clearCache: () => {
    cachedSettings = null;
  },
};
