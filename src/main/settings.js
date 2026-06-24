const fs = require("fs");
const path = require("path");
const _os = require("os");
const { app } = require("electron");
const steamPaths = require("./steamPaths");

const settingsPath = path.join(app.getPath("userData"), "settings.json");

const defaultSettings = {
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
  serverListMode: "compact",
  autoRefreshEnabled: true,
  autoRefreshTime: 360,
  modLoadouts: {},
  watchlist: [],
  watchlistThreshold: 50,
  watchlistRefreshEnabled: true,
  watchlistRefreshTime: 10,
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

function loadSettings() {
  const settings = { ...defaultSettings };
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, "utf8");
      const parsed = JSON.parse(data);
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
    const names = settings.favoriteNames || {};
    const ports = settings.favoritePorts || {};
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
    saveSettings(settings);
  }

  // Auto-discover if empty
  if (!settings.modDirectory) {
    settings.modDirectory = findDayzWorkshopFolder();
  }

  return settings;
}

function saveSettings(settings) {
  try {
    // Prevent storing password if it inadvertently gets passed
    const safeSettings = { ...settings };
    delete safeSettings.steamPassword;

    fs.writeFileSync(settingsPath, JSON.stringify(safeSettings, null, 2));
    return true;
  } catch (e) {
    console.error("Failed to save settings", e);
    return false;
  }
}

module.exports = {
  loadSettings,
  saveSettings,
};
