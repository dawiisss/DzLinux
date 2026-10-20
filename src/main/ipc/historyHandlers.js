// History & Analytics IPC handlers

const { ipcMain } = require("electron");
const historyManager = require("../history");
const {
  isBoundedString,
  sanitizeHistoryPayload,
} = require("../validation");

function registerHistoryHandlers() {
  ipcMain.handle("history:get", async () => {
    return await historyManager.getHistorySummaries();
  });

  ipcMain.handle("history:record", async (_event, server) => {
    const payload = sanitizeHistoryPayload(server);
    if (!payload) {
      return Promise.reject(new Error("Invalid server payload for history"));
    }
    return await historyManager.recordConnection(payload);
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
