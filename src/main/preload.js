const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("api", {
  app: {
    getVersion: () => ipcRenderer.invoke("get-version"),
    openLogFile: () => ipcRenderer.invoke("open-log-file"),
  },

  settings: {
    load: () => ipcRenderer.invoke("load-settings"),
    save: (settings) => ipcRenderer.invoke("save-settings", settings),
    getDefaults: () => ipcRenderer.invoke("get-default-settings"),
  },

  servers: {
    fetch: (generationId) => ipcRenderer.invoke("fetch-servers", generationId),
    queryMods: (ip, port, queryPort, requestId) => requestId === undefined
      ? ipcRenderer.invoke("query-mods", ip, port, queryPort)
      : ipcRenderer.invoke("query-mods", ip, port, queryPort, requestId),
    refreshModCache: (ip, port, queryPort) =>
      ipcRenderer.invoke("refresh-mod-cache", ip, port, queryPort),
    ping: (ip, port, queryPort, requestId) =>
      requestId === undefined
        ? ipcRenderer.invoke("ping-server", ip, port, queryPort)
        : ipcRenderer.invoke("ping-server", ip, port, queryPort, requestId),
    cancelPingGeneration: (generationId) =>
      ipcRenderer.send("cancel-ping-generation", generationId),
    cancelPingRequest: (requestId) =>
      ipcRenderer.send("cancel-ping-request", requestId),
    onBatch: (callback) => {
      const handler = (_event, batch, generationId) =>
        callback(batch, generationId);
      ipcRenderer.on("servers-batch", handler);
      return () => ipcRenderer.removeListener("servers-batch", handler);
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners("servers-batch");
    },
  },

  mods: {
    getInstalled: () => ipcRenderer.invoke("get-installed-mods"),
    getDownloadSizes: (modIds) => ipcRenderer.invoke("get-mod-download-sizes", modIds),
    checkUpdates: (mods) => ipcRenderer.invoke("check-mod-updates", mods),
    checkUpdatesDetailed: (mods) =>
      ipcRenderer.invoke("check-mod-updates-detailed", mods),
    delete: (modId) => ipcRenderer.invoke("delete-mod", modId),
    openFolder: (modId) => ipcRenderer.invoke("open-mod-folder", modId),
    openWorkshop: (modId) => ipcRenderer.invoke("open-workshop", modId),
    subscribe: (modId) => ipcRenderer.invoke("subscribe-mod", modId),
  },

  game: {
    launch: (ip, port, mods, connectionId) => connectionId === undefined
      ? ipcRenderer.invoke("launch-game", ip, port, mods)
      : ipcRenderer.invoke("launch-game", ip, port, mods, connectionId),
    checkRequired: (requiredMods) =>
      ipcRenderer.invoke("check-mods", requiredMods),
    scanProton: (refresh = false) => ipcRenderer.invoke("scan-proton-versions", refresh),
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

  favorites: {
    getSnapshot: () => ipcRenderer.invoke("favorites:snapshot"),
    add: (input, token = null) => ipcRenderer.invoke("favorites:add", input, token),
    update: (id, patch, revision) => ipcRenderer.invoke("favorites:update", id, patch, revision),
    remove: (id) => ipcRenderer.invoke("favorites:remove", id),
    group: (action, id, name) => ipcRenderer.invoke("favorites:group", action, id, name),
    preview: (input, requestId) => ipcRenderer.invoke("favorites:preview", input, requestId),
    refresh: (ids, requestId) => ipcRenderer.invoke("favorites:refresh", ids, requestId),
    cancel: (requestId = null) => ipcRenderer.invoke("favorites:cancel", requestId),
    onChanged: (callback) => subscribe("favorites:changed", callback),
    onRefreshProgress: (callback) => subscribe("favorites:progress", callback),
  },
  watchlist: {
    getSnapshot: () => ipcRenderer.invoke("watchlist:snapshot"),
    add: (input) => ipcRenderer.invoke("watchlist:command", "add", [input]),
    update: (id, patch, revision) => ipcRenderer.invoke("watchlist:command", "update", [id, patch, revision]),
    remove: (id) => ipcRenderer.invoke("watchlist:command", "remove", [id]),
    setEnabled: (id, enabled) => ipcRenderer.invoke("watchlist:command", "setEnabled", [id, enabled]),
    snooze: (id, seconds = 900) => ipcRenderer.invoke("watchlist:command", "snooze", [id, seconds]),
    wake: (id) => ipcRenderer.invoke("watchlist:command", "wake", [id]),
    rearm: (id) => ipcRenderer.invoke("watchlist:command", "rearm", [id]),
    refresh: () => ipcRenderer.invoke("watchlist:refresh"),
    claimAutoJoin: (eventId) => ipcRenderer.invoke("watchlist:claim", eventId),
    cancelAutoJoin: (offerId) => ipcRenderer.invoke("watchlist:cancel", offerId),
    confirmAutoJoin: (offerId) => ipcRenderer.invoke("watchlist:confirm", offerId),
    resumeAutoJoin: () => ipcRenderer.invoke("watchlist:resume-auto"),
    onChanged: (callback) => subscribe("watchlist:changed", callback),
    onAlert: (callback) => subscribe("watchlist:alert", callback),
    onAutoJoinOffer: (callback) => subscribe("watchlist:offer", callback),
    onOpen: (callback) => subscribe("watchlist:open", callback),
  },
  connection: {
    begin: () => ipcRenderer.invoke("connection:begin"),
    finish: (id, launched = false) => ipcRenderer.invoke("connection:finish", id, launched),
    onCancelled: (callback) => subscribe("connection:cancelled", callback),
  },

  history: {
    get: () => ipcRenderer.invoke("history:get"),
    record: (server) => ipcRenderer.invoke("history:record", server),
    delete: (id) => ipcRenderer.invoke("history:delete", id),
    clear: () => ipcRenderer.invoke("history:clear"),
    getAnalytics: (serverId) =>
      ipcRenderer.invoke("history:get-analytics", serverId),
  },

  diagnostics: {
    getRecentLogs: () => ipcRenderer.invoke("get-diagnostics"),
    getSessionSummary: () => ipcRenderer.invoke("get-session-summary"),
    runSystemCheck: () =>
      ipcRenderer.invoke("run-system-compatibility-check"),
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
