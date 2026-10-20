// Game launch IPC handlers: mod checks, game launch, workshop page, Proton
// scanning, and GameMode detection.

const { ipcMain } = require("electron");
const gameManager = require("../game");
const { isValidIpOrHost, isValidPort, isValidModId } = require("../validation");

function registerGameHandlers() {
  ipcMain.handle("check-mods", (_event, requiredMods) => {
    if (!Array.isArray(requiredMods)) {
      return { missingMods: [], hasAllMods: true };
    }
    const validMods = requiredMods.filter(
      (mod) => mod && isValidModId(mod.id),
    );
    return gameManager.checkMods(validMods);
  });
  ipcMain.handle("launch-game", async (event, ip, port, mods, connectionId) => {
    if (ip || port) {
      if (!isValidIpOrHost(ip) || !isValidPort(port)) {
        return Promise.reject(new Error("Invalid arguments"));
      }
    }
    if (!Array.isArray(mods)) {
      return Promise.reject(new Error("Invalid arguments"));
    }
    const isValidMods = mods.every((mod) => {
      if (!mod) return false;
      const id = typeof mod === "object" ? mod.id : mod;
      return isValidModId(id);
    });
    if (!isValidMods) {
      return Promise.reject(new Error("Invalid mod IDs"));
    }
    const { monitor } = require("../watchlistMonitor");
    if (connectionId !== undefined) monitor.assertConnection(connectionId, event.sender.id);
    else connectionId = monitor.beginConnection(event.sender.id);
    try {
      const assertCurrent = () => {
        if (event.sender.isDestroyed()) throw new Error("Connection owner closed");
        monitor.assertConnection(connectionId, event.sender.id);
      };
      const result = await gameManager.launchDayZ(ip, port, mods, assertCurrent);
      monitor.finishConnection(connectionId, event.sender.id, true);
      return result;
    } catch (error) {
      monitor.finishConnection(connectionId, event.sender.id, false);
      throw error;
    }
  });
  ipcMain.handle("open-workshop", (_event, modId) =>
    gameManager.openWorkshopPage(modId),
  );
  ipcMain.handle("check-gamemode", () => gameManager.checkGameMode());
  ipcMain.handle("scan-proton-versions", (_event, refresh) =>
    gameManager.scanProtonVersions(refresh === true),
  );
}

module.exports = {
  registerGameHandlers,
};
