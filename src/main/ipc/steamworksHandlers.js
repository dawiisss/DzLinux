// Steamworks IPC handlers: user profile and workshop item management via the
// isolated steamworks worker process.

const { ipcMain } = require("electron");
const steamworksManager = require("../steamworksManager");
const { isValidModId } = require("../validation");

function registerSteamworksHandlers() {
  ipcMain.handle("steamworks-user-info", () =>
    steamworksManager.getUserProfile(),
  );
  ipcMain.handle("steamworks-subscribe", (_event, modId) => {
    if (!isValidModId(modId)) return Promise.reject(new Error("Invalid modId"));
    return steamworksManager.subscribeMod(String(modId));
  });
  ipcMain.handle("steamworks-unsubscribe", (_event, modId) => {
    if (!isValidModId(modId)) return Promise.reject(new Error("Invalid modId"));
    return steamworksManager.unsubscribeMod(String(modId));
  });
  ipcMain.handle("steamworks-download-info", (_event, modId) => {
    if (!isValidModId(modId)) return Promise.reject(new Error("Invalid modId"));
    return steamworksManager.getDownloadProgress(String(modId));
  });
  ipcMain.handle("steamworks-mod-state", (_event, modId) => {
    if (!isValidModId(modId)) return Promise.reject(new Error("Invalid modId"));
    return steamworksManager.getModState(String(modId));
  });
}

module.exports = {
  registerSteamworksHandlers,
};
