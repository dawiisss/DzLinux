// History & Analytics IPC handlers

const { ipcMain } = require("electron");
const historyManager = require("../history");

function registerHistoryHandlers() {
  ipcMain.handle("history:get", async () => {
    return await historyManager.getHistoryRecords();
  });

  ipcMain.handle("history:record", async (_event, server) => {
    if (!server || typeof server !== "object" || !server.ip || !server.port) {
      return Promise.reject(new Error("Invalid server payload for history"));
    }
    return await historyManager.recordConnection(server);
  });

  ipcMain.handle("history:delete", async (_event, id) => {
    if (!id || typeof id !== "string") {
      return Promise.reject(new Error("Invalid history entry ID"));
    }
    return await historyManager.deleteHistoryRecord(id);
  });

  ipcMain.handle("history:clear", async () => {
    return await historyManager.clearAllHistory();
  });

  ipcMain.handle("history:save-note", async (_event, payload) => {
    if (!payload || typeof payload !== "object" || !payload.serverId) {
      return Promise.reject(new Error("Invalid note payload"));
    }
    return await historyManager.saveServerNote(
      payload.serverId,
      payload.note || "",
    );
  });

  ipcMain.handle("history:get-analytics", async (_event, serverId) => {
    if (!serverId || typeof serverId !== "string") {
      return Promise.reject(new Error("Invalid serverId for analytics"));
    }
    return await historyManager.getAnalytics(serverId);
  });
}

module.exports = {
  registerHistoryHandlers,
};
