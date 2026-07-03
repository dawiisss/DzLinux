const { app, ipcMain, shell, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { execFile } = require("node:child_process");

const settingsManager = require("./settings");
const serverManager = require("./servers");
const gameManager = require("./game");
const { pingServer, queryServerGameDig } = require("./serverQuery");
const modManager = require("./modManager");
const {
  autoUpdater,
  checkForUpdates,
  isSystemInstall,
} = require("./updater");
const logParser = require("./logParser");
const steamworksManager = require("./steamworksManager");
const steamDependencyResolver = require("./steamDependencyResolver");
const watchlistManager = require("./watchlist");
const { getLogFilePath } = require("./logger");

function isValidIpOrHost(ip) {
  if (typeof ip !== "string") return false;
  return /^[a-zA-Z0-9.-]+$/.test(ip);
}

function isValidPort(port) {
  const p = parseInt(port, 10);
  return Number.isInteger(p) && p > 0 && p <= 65535;
}

let allowedPathPrefixes = null;
function getAllowedPathPrefixes() {
  if (!allowedPathPrefixes) {
    allowedPathPrefixes = [
      path.join(app.getPath("home"), ".steam"),
      path.join(app.getPath("home"), ".local", "share", "Steam"),
      path.join(app.getPath("home"), ".var", "app", "com.valvesoftware.Steam"),
      "/usr",
      "/opt",
      "/snap",
      "/home",
    ];
  }
  return allowedPathPrefixes;
}

function isAllowedPath(filePath) {
  if (typeof filePath !== "string") return false;
  const resolved = path.resolve(filePath);
  const prefixes = [...getAllowedPathPrefixes()];
  try {
    const currentSettings = settingsManager.loadSettings();
    if (currentSettings && currentSettings.modDirectory) {
      prefixes.push(path.resolve(currentSettings.modDirectory));
    }
  } catch {
    // Fallback if settings fail to load
  }
  return prefixes.some((prefix) => resolved.startsWith(prefix));
}

function registerIpcHandlers() {
  ipcMain.handle("get-version", () => app.getVersion());
  ipcMain.handle("load-settings", () => settingsManager.loadSettings());
  ipcMain.handle("save-settings", (_event, settings) =>
    settingsManager.saveSettings(settings),
  );
  ipcMain.handle("fetch-servers", async (event, generationId) => {
    return serverManager.fetchDayZServers((batch) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send("servers-batch", batch, generationId);
      }
    }, generationId);
  });
  ipcMain.handle("query-mods", async (_event, ip, port, queryPort) => {
    if (!isValidIpOrHost(ip) || !isValidPort(port) || (queryPort !== null && queryPort !== undefined && !isValidPort(queryPort))) {
      return [];
    }
    const result = await queryServerGameDig(ip, port, queryPort);
    return result ? result.mods || [] : [];
  });
  ipcMain.handle("refresh-mod-cache", async (_event, ip, port, queryPort) => {
    if (!isValidIpOrHost(ip) || !isValidPort(port) || (queryPort !== null && queryPort !== undefined && !isValidPort(queryPort))) {
      return [];
    }
    const result = await serverManager.refreshServerModCache(
      ip,
      port,
      queryPort,
    );
    return result ? result.mods : [];
  });
  ipcMain.handle("ping-server", (_event, ip, port, queryPort) => {
    if (!isValidIpOrHost(ip) || !isValidPort(port) || (queryPort !== null && queryPort !== undefined && !isValidPort(queryPort))) {
      return Promise.resolve(null);
    }
    return pingServer(ip, port, queryPort);
  });
  ipcMain.handle("check-mods", (_event, requiredMods) => {
    if (!Array.isArray(requiredMods)) {
      return { missingMods: [], hasAllMods: true };
    }
    const validMods = requiredMods.filter(mod => mod && /^\d+$/.test(String(mod.id)));
    return gameManager.checkMods(validMods);
  });
  ipcMain.handle("launch-game", (_event, ip, port, mods) => {
    if (ip || port) {
      if (!isValidIpOrHost(ip) || !isValidPort(port)) {
        return Promise.reject(new Error("Invalid arguments"));
      }
    }
    if (!Array.isArray(mods)) {
      return Promise.reject(new Error("Invalid arguments"));
    }
    const isValidMods = mods.every(mod => {
      if (!mod) return false;
      const id = typeof mod === "object" ? mod.id : mod;
      return typeof id === "string" || typeof id === "number" ? /^\d+$/.test(String(id)) : false;
    });
    if (!isValidMods) {
      return Promise.reject(new Error("Invalid mod IDs"));
    }
    return gameManager.launchDayZ(ip, port, mods);
  });
  ipcMain.handle("open-workshop", (_event, modId) =>
    gameManager.openWorkshopPage(modId),
  );
  ipcMain.handle("subscribe-mod", (_event, modId) => {
    if (!/^\d+$/.test(modId)) return Promise.reject(new Error("Invalid modId"));
    return shell.openExternal(
      `steam://openurl/https://steamcommunity.com/sharedfiles/filedetails/?id=${modId}`,
    );
  });
  ipcMain.handle("get-installed-mods", () => modManager.getInstalledMods());
  ipcMain.handle("check-mod-updates", (_event, mods) =>
    modManager.checkModUpdates(mods),
  );

  // Watchlist Integration
  ipcMain.handle("load-watchlist", () => watchlistManager.loadWatchlist());
  ipcMain.handle("save-watchlist", (_event, watchlist) =>
    watchlistManager.saveWatchlist(watchlist),
  );
  ipcMain.handle("check-watchlist-thresholds", (event, currentServers) => {
    const triggered = watchlistManager.processWatchlistChecks(currentServers);
    if (triggered && triggered.length > 0) {
      event.sender.send("watchlist-notify", triggered);
    }
    return triggered;
  });

  ipcMain.handle("save-favorites", (_event, { favorites }) => {
    const settings_ = settingsManager.loadSettings();
    settings_.favorites = favorites;
    return settingsManager.saveSettings(settings_);
  });

  ipcMain.handle("check-mod-updates-detailed", (_event, mods) =>
    modManager.checkModUpdatesDetailed(mods),
  );
  ipcMain.handle("get-diagnostics", () => logParser.getRecentLogs());
  ipcMain.handle("get-session-summary", () => logParser.getSessionSummary());
  ipcMain.handle("delete-mod", (_event, modId) => modManager.deleteMod(modId));
  ipcMain.handle("open-mod-folder", (_event, modId) =>
    modManager.openModFolder(modId),
  );
  ipcMain.handle("scan-proton-versions", () =>
    gameManager.scanProtonVersions(),
  );
  ipcMain.handle("check-for-updates", async () => {
    const result = await checkForUpdates();
    if (result.kind === "available" && isSystemInstall()) {
      return {
        kind: "system-package",
        currentVersion: result.currentVersion,
        releaseUrl:
          result.updateInfo.downloadUrl ||
          "https://github.com/dawiisss/DzLinux/releases/latest",
      };
    }
    return result;
  });
  ipcMain.handle("download-update", () => {
    return autoUpdater
      .downloadUpdate()
      .then(() => true)
      .catch((err) => {
        console.error("Download failed:", err);
        return false;
      });
  });
  ipcMain.handle("install-update", () => {
    autoUpdater.quitAndInstall();
  });
  ipcMain.handle("open-external", (_event, url) => {
    if (
      typeof url !== "string" ||
      (!url.startsWith("https://") && !url.startsWith("http://"))
    ) {
      return Promise.reject(new Error("Invalid URL scheme"));
    }
    return shell.openExternal(url);
  });
  ipcMain.handle("check-gamemode", () => gameManager.checkGameMode());
  ipcMain.handle("check-path-exists", (_event, filePath) => {
    if (!isAllowedPath(filePath)) return false;
    try {
      return fs.existsSync(path.resolve(filePath));
    } catch {
      return false;
    }
  });

  // Steamworks Integration
  ipcMain.handle("steamworks-user-info", () =>
    steamworksManager.getUserProfile(),
  );
  ipcMain.handle("steamworks-subscribe", (_event, modId) =>
    steamworksManager.subscribeMod(modId),
  );
  ipcMain.handle("steamworks-unsubscribe", (_event, modId) =>
    steamworksManager.unsubscribeMod(modId),
  );
  ipcMain.handle("steamworks-download-info", (_event, modId) =>
    steamworksManager.getDownloadProgress(modId),
  );
  ipcMain.handle("steamworks-mod-state", (_event, modId) =>
    steamworksManager.getModState(modId),
  );

  // Dependency Tree Resolver
  ipcMain.handle("resolve-mod-dependencies", (_event, modId) =>
    steamDependencyResolver.resolveDependencies(modId),
  );
  ipcMain.handle("resolve-mod-dependencies-batch", (_event, modIds) =>
    steamDependencyResolver.resolveBatchDependencies(modIds),
  );

  ipcMain.handle("get-disk-space", (_event, dirPath) => {
    if (!isAllowedPath(dirPath) || !dirPath.startsWith("/")) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      execFile("df", ["-k", dirPath], (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        const lines = stdout.trim().split("\n");
        if (lines.length > 1) {
          const parts = lines[1].trim().split(/\s+/);
          if (parts.length >= 4) {
            const total = parseInt(parts[1], 10) * 1024;
            const used = parseInt(parts[2], 10) * 1024;
            const free = parseInt(parts[3], 10) * 1024;
            if (!isNaN(total) && !isNaN(used) && !isNaN(free)) {
              resolve({ total, used, free });
              return;
            }
          }
        }
        resolve(null);
      });
    });
  });

  ipcMain.on("renderer-log", (_event, msg) => console.log(`[RENDERER] ${msg}`));

  ipcMain.handle("open-log-file", () => {
    const logPath = getLogFilePath();
    shell.showItemInFolder(logPath);
  });

  ipcMain.on("window-min", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
  });

  ipcMain.on("window-max", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
  });

  ipcMain.on("window-close", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.close();
  });
}

module.exports = {
  registerIpcHandlers,
};
