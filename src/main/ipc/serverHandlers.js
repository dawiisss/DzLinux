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
  ipcMain.handle("query-mods", async (_event, ip, port, queryPort) => {
    if (
      !isValidIpOrHost(ip) ||
      !isValidPort(port) ||
      (queryPort !== null && queryPort !== undefined && !isValidPort(queryPort))
    ) {
      return null;
    }
    const result = await queryServerGameDig(ip, port, queryPort);
    return result ? result.mods || [] : null;
  });
  ipcMain.handle("refresh-mod-cache", async (_event, ip, port, queryPort) => {
    if (
      !isValidIpOrHost(ip) ||
      !isValidPort(port) ||
      (queryPort !== null && queryPort !== undefined && !isValidPort(queryPort))
    ) {
      return [];
    }
    const result = await serverManager.refreshServerModCache(
      ip,
      port,
      queryPort,
    );
    return result ? result.mods : [];
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

    const request = { cancelled: false };
    activePingRequests.set(id, request);
    try {
      const result = await pingServer(ip, port, queryPort);
      return request.cancelled ? null : result;
    } finally {
      activePingRequests.delete(id);
    }
  });
  ipcMain.on("cancel-ping-generation", (_event, generationId) => {
    if (typeof generationId !== "number" && typeof generationId !== "string") return;
    const prefix = `${generationId}:`;
    for (const [requestId, request] of activePingRequests) {
      if (requestId.startsWith(prefix)) request.cancelled = true;
    }
  });
  ipcMain.on("cancel-ping-request", (_event, requestId) => {
    if (typeof requestId !== "string") return;
    const request = activePingRequests.get(requestId);
    if (request) request.cancelled = true;
  });
}

module.exports = {
  registerServerHandlers,
};
