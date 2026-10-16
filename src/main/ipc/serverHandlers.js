// Server query IPC handlers: server list fetch, A2S mod queries, and the
// background ping pipeline with per-request and per-generation cancellation.

const { ipcMain } = require("electron");
const serverManager = require("../servers");
const { pingServer, queryServerGameDig } = require("../serverQuery");
const { isValidIpOrHost, isValidPort } = require("../validation");

const activePingRequests = new Map();

function registerServerHandlers() {
  ipcMain.handle("fetch-servers", async (event, generationId) => {
    return serverManager.fetchDayZServers((batch) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send("servers-batch", batch, generationId);
      }
    }, generationId);
  });
  ipcMain.handle("query-mods", async (_event, ip, port, queryPort, requestId) => {
    if (
      !isValidIpOrHost(ip) ||
      !isValidPort(port) ||
      (queryPort !== null && queryPort !== undefined && !isValidPort(queryPort))
    ) {
      return null;
    }
    if (typeof requestId !== "string" || requestId.length > 200) {
      const result = await queryServerGameDig(ip, port, queryPort);
      return result && Array.isArray(result.mods) ? result.mods : null;
    }
    const request = new AbortController();
    activePingRequests.set(requestId, request);
    try {
      const result = await queryServerGameDig(ip, port, queryPort, request.signal);
      return request.signal.aborted || !Array.isArray(result?.mods) ? null : result.mods;
    } finally {
      if (activePingRequests.get(requestId) === request) activePingRequests.delete(requestId);
    }
  });
  ipcMain.handle("refresh-mod-cache", async (_event, ip, port, queryPort) => {
    if (
      !isValidIpOrHost(ip) ||
      !isValidPort(port) ||
      (queryPort !== null && queryPort !== undefined && !isValidPort(queryPort))
    ) {
      return null;
    }
    const result = await serverManager.refreshServerModCache(
      ip,
      port,
      queryPort,
    );
    return result ? result.mods : null;
  });
  ipcMain.handle("ping-server", async (_event, ip, port, queryPort, requestId) => {
    if (
      !isValidIpOrHost(ip) ||
      !isValidPort(port) ||
      (queryPort !== null && queryPort !== undefined && !isValidPort(queryPort))
    ) {
      return null;
    }
    const id = typeof requestId === "string" && requestId.length <= 200
      ? requestId
      : null;
    if (!id) return pingServer(ip, port, queryPort);

    const request = new AbortController();
    activePingRequests.set(id, request);
    try {
      const result = await pingServer(ip, port, queryPort, request.signal);
      return request.signal.aborted ? null : result;
    } finally {
      activePingRequests.delete(id);
    }
  });
  ipcMain.on("cancel-ping-generation", (_event, generationId) => {
    if (typeof generationId !== "number" && typeof generationId !== "string") return;
    const prefix = `${generationId}:`;
    for (const [requestId, request] of activePingRequests) {
      if (requestId.startsWith(prefix)) request.abort();
    }
  });
  ipcMain.on("cancel-ping-request", (_event, requestId) => {
    if (typeof requestId !== "string") return;
    const request = activePingRequests.get(requestId);
    if (request) request.abort();
  });
}

module.exports = {
  registerServerHandlers,
};
