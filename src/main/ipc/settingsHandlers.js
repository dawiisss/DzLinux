// Settings IPC handlers: app version, settings load/save, favorites persistence.

const { app, ipcMain } = require("electron");
const settingsManager = require("../settings");

function registerSettingsHandlers() {
  ipcMain.handle("get-version", () => app.getVersion());
  ipcMain.handle("load-settings", () => settingsManager.loadSettingsAsync());
  ipcMain.handle("save-settings", async (_event, settings) => {
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return Promise.reject(new Error("Invalid settings payload"));
    }
    const result = await settingsManager.saveSettings(settings);
    if (result !== false) await require("../watchlistMonitor").monitor.configure(await settingsManager.loadSettingsAsync())
      .catch((error) => console.error("Could not reconfigure Watchlist:", error));
    return result;
  });
  ipcMain.handle("get-default-settings", () =>
    settingsManager.getDefaultSettings(),
  );


}

module.exports = {
  registerSettingsHandlers,
};
