// History & Analytics IPC handlers

const { ipcMain } = require("electron");
const historyManager = require("../history");
const {
  isValidIpOrHost,
  isValidPort,
  isBoundedString,
} = require("../validation");

function registerHistoryHandlers() {
  ipcMain.handle("history:get", async () => {
    return await historyManager.getHistoryRecords();
  });

  ipcMain.handle("history:record", async (_event, server) => {
    if (
      !server ||
      typeof server !== "object" ||
      !isValidIpOrHost(server.ip) ||
      !isValidPort(server.port)
    ) {
      return Promise.reject(new Error("Invalid server payload for history"));
    }
    return await historyManager.recordConnection(server);
  });

  ipcMain.handle("history:delete", async (_event, id) => {
    if (!id || typeof id !== "string" || !isBoundedString(id, 260)) {
      return Promise.reject(new Error("Invalid history entry ID"));
    }
    return await historyManager.deleteHistoryRecord(id);
  });

  ipcMain.handle("history:clear", async () => {
    return await historyManager.clearAllHistory();
  });

  ipcMain.handle("history:save-note", async (_event, payload) => {
    if (
      !payload ||
      typeof payload !== "object" ||
      !payload.serverId ||
      typeof payload.serverId !== "string" ||
      !isBoundedString(payload.serverId, 260) ||
      (payload.note !== undefined && !isBoundedString(payload.note, 2000))
    ) {
      return Promise.reject(new Error("Invalid note payload"));
    }
    return await historyManager.saveServerNote(
      payload.serverId,
      payload.note || "",
    );
  });

  ipcMain.handle("history:get-analytics", async (_event, serverId) => {
    if (
      !serverId ||
      typeof serverId !== "string" ||
      !isBoundedString(serverId, 260)
    ) {
      return Promise.reject(new Error("Invalid serverId for analytics"));
    }
    return await historyManager.getAnalytics(serverId);
  });
}

module.exports = {
  registerHistoryHandlers,
};
