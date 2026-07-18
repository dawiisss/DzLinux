const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  app: {
    getVersion: () => ipcRenderer.invoke("get-version"),
    openLogFile: () => ipcRenderer.invoke("open-log-file"),
  },

  settings: {
    load: () => ipcRenderer.invoke("load-settings"),
    save: (settings) => ipcRenderer.invoke("save-settings", settings),
    saveFavorites: (data) => ipcRenderer.invoke("save-favorites", data),
    getDefaults: () => ipcRenderer.invoke("get-default-settings"),
  },

  servers: {
    fetch: (generationId) => ipcRenderer.invoke("fetch-servers", generationId),
    queryMods: (ip, port, queryPort) =>
      ipcRenderer.invoke("query-mods", ip, port, queryPort),
    refreshModCache: (ip, port, queryPort) =>
      ipcRenderer.invoke("refresh-mod-cache", ip, port, queryPort),
    ping: (ip, port, queryPort) =>
      ipcRenderer.invoke("ping-server", ip, port, queryPort),
    onBatch: (callback) => {
      const handler = (_event, batch, generationId) =>
        callback(batch, generationId);
      ipcRenderer.on("servers-batch", handler);
      return () => ipcRenderer.removeListener("servers-batch", handler);
    },
    onComplete: (callback) => {
      const handler = (_event) => callback();
      ipcRenderer.on("servers-complete", handler);
      return () => ipcRenderer.removeListener("servers-complete", handler);
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners("servers-batch");
      ipcRenderer.removeAllListeners("servers-complete");
    },
  },

  mods: {
    getInstalled: () => ipcRenderer.invoke("get-installed-mods"),
    checkUpdates: (mods) => ipcRenderer.invoke("check-mod-updates", mods),
    checkUpdatesDetailed: (mods) =>
      ipcRenderer.invoke("check-mod-updates-detailed", mods),
    delete: (modId) => ipcRenderer.invoke("delete-mod", modId),
    openFolder: (modId) => ipcRenderer.invoke("open-mod-folder", modId),
    openWorkshop: (modId) => ipcRenderer.invoke("open-workshop", modId),
    subscribe: (modId) => ipcRenderer.invoke("subscribe-mod", modId),
  },

  game: {
    launch: (ip, port, mods) =>
      ipcRenderer.invoke("launch-game", ip, port, mods),
    checkRequired: (requiredMods) =>
      ipcRenderer.invoke("check-mods", requiredMods),
    scanProton: () => ipcRenderer.invoke("scan-proton-versions"),
    checkGameMode: () => ipcRenderer.invoke("check-gamemode"),
  },

  steamworks: {
    userInfo: () => ipcRenderer.invoke("steamworks-user-info"),
    subscribe: (modId) => ipcRenderer.invoke("steamworks-subscribe", modId),
    unsubscribe: (modId) => ipcRenderer.invoke("steamworks-unsubscribe", modId),
    downloadInfo: (modId) =>
      ipcRenderer.invoke("steamworks-download-info", modId),
    modState: (modId) => ipcRenderer.invoke("steamworks-mod-state", modId),
  },

  watchlist: {
    load: () => ipcRenderer.invoke("load-watchlist"),
    save: (watchlist) => ipcRenderer.invoke("save-watchlist", watchlist),
    checkThresholds: (currentServers) =>
      ipcRenderer.invoke("check-watchlist-thresholds", currentServers),
    onNotify: (callback) => {
      const handler = (_event, notifications) => callback(notifications);
      ipcRenderer.on("watchlist-notify", handler);
      return () => ipcRenderer.removeListener("watchlist-notify", handler);
    },
    onOpen: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("open-watchlist", handler);
      return () => ipcRenderer.removeListener("open-watchlist", handler);
    },
  },

  diagnostics: {
    getRecentLogs: () => ipcRenderer.invoke("get-diagnostics"),
    getSessionSummary: () => ipcRenderer.invoke("get-session-summary"),
    onGameCrashed: (callback) => {
      const handler = (_event, diagnostic) => callback(diagnostic);
      ipcRenderer.on("game-crashed", handler);
      return () => ipcRenderer.removeListener("game-crashed", handler);
    },
    removeGameCrashedListener: () => {
      ipcRenderer.removeAllListeners("game-crashed");
    },
  },

  updater: {
    check: () => ipcRenderer.invoke("check-for-updates"),
    download: () => ipcRenderer.invoke("download-update"),
    install: () => ipcRenderer.invoke("install-update"),
    onAvailable: (callback) => {
      const handler = (_event, value) => callback(value);
      ipcRenderer.on("update-available", handler);
      return () => ipcRenderer.removeListener("update-available", handler);
    },
    onNotAvailable: (callback) => {
      const handler = (_event, value) => callback(value);
      ipcRenderer.on("update-not-available", handler);
      return () => ipcRenderer.removeListener("update-not-available", handler);
    },
    onProgress: (callback) => {
      const handler = (_event, value) => callback(value);
      ipcRenderer.on("update-download-progress", handler);
      return () =>
        ipcRenderer.removeListener("update-download-progress", handler);
    },
    onDownloaded: (callback) => {
      const handler = (_event, value) => callback(value);
      ipcRenderer.on("update-downloaded", handler);
      return () => ipcRenderer.removeListener("update-downloaded", handler);
    },
    onError: (callback) => {
      const handler = (_event, value) => callback(value);
      ipcRenderer.on("update-error", handler);
      return () => ipcRenderer.removeListener("update-error", handler);
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners("update-available");
      ipcRenderer.removeAllListeners("update-not-available");
      ipcRenderer.removeAllListeners("update-download-progress");
      ipcRenderer.removeAllListeners("update-downloaded");
      ipcRenderer.removeAllListeners("update-error");
    },
  },

  deps: {
    resolve: (modId) => ipcRenderer.invoke("resolve-mod-dependencies", modId),
    resolveBatch: (modIds) =>
      ipcRenderer.invoke("resolve-mod-dependencies-batch", modIds),
  },

  ui: {
    windowMin: () => ipcRenderer.send("window-min"),
    windowMax: () => ipcRenderer.send("window-max"),
    windowClose: () => ipcRenderer.send("window-close"),
    openExternal: (url) => {
      if (
        typeof url !== "string" ||
        (!url.startsWith("https://") && !url.startsWith("http://"))
      ) {
        return Promise.reject(new Error("Invalid URL scheme"));
      }
      return ipcRenderer.invoke("open-external", url);
    },
    log: (msg) => ipcRenderer.send("renderer-log", msg),
    getDiskSpace: (dirPath) => ipcRenderer.invoke("get-disk-space", dirPath),
    checkPathExists: (filePath) =>
      ipcRenderer.invoke("check-path-exists", filePath),
  },
});
