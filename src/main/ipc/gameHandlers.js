// Game launch IPC handlers: mod checks, game launch, workshop page, Proton
// scanning, and GameMode detection.

const { ipcMain } = require("electron");
const gameManager = require("../game");
const {
  isValidIpOrHost,
  isValidPort,
  isValidModId,
  normalizeModId,
} = require("../validation");

function isOmittedLaunchParam(value) {
  return value === undefined || value === null || value === "";
}

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
    if (!isOmittedLaunchParam(ip) || !isOmittedLaunchParam(port)) {
      if (!isValidIpOrHost(ip) || !isValidPort(port)) {
        return Promise.reject(new Error("Invalid arguments"));
      }
    }
    if (!Array.isArray(mods)) {
      return Promise.reject(new Error("Invalid arguments"));
    }
    const normalizedMods = [];
    for (const mod of mods) {
      const id = normalizeModId(mod);
      if (id === null) {
        return Promise.reject(new Error("Invalid mod IDs"));
      }
      normalizedMods.push(
        typeof mod === "object" && mod !== null ? { ...mod, id } : { id },
      );
    }
    const { monitor } = require("../watchlistMonitor");
    if (connectionId !== undefined) monitor.assertConnection(connectionId, event.sender.id);
    else connectionId = monitor.beginConnection(event.sender.id);
    try {
      const assertCurrent = () => {
        if (event.sender.isDestroyed()) throw new Error("Connection owner closed");
        monitor.assertConnection(connectionId, event.sender.id);
      };
      const result = await gameManager.launchDayZ(ip, port, normalizedMods, assertCurrent);
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
