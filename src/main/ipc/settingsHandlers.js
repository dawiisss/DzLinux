// Settings IPC handlers: app version, settings load/save, favorites persistence.

const { app, ipcMain } = require("electron");
const settingsManager = require("../settings");
const { validateFavorites } = require("../validation");

function registerSettingsHandlers() {
  ipcMain.handle("get-version", () => app.getVersion());
  ipcMain.handle("load-settings", () => settingsManager.loadSettingsAsync());
  ipcMain.handle("save-settings", (_event, settings) => {
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return Promise.reject(new Error("Invalid settings payload"));
    }
    return settingsManager.saveSettings(settings);
  });
  ipcMain.handle("get-default-settings", () =>
    settingsManager.getDefaultSettings(),
  );

  ipcMain.handle("save-favorites", async (_event, payload) => {
    if (!payload || !validateFavorites(payload.favorites)) {
      throw new Error("Invalid favorites payload");
    }
    const currentSettings = await settingsManager.loadSettingsAsync();
    const { favorites } = payload;
    currentSettings.favorites = favorites;
    return settingsManager.saveSettings(currentSettings);
  });
}

module.exports = {
  registerSettingsHandlers,
};
