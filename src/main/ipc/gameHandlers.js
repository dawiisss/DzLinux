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
  ipcMain.handle("launch-game", (_event, ip, port, mods) => {
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
    return gameManager.launchDayZ(ip, port, mods);
  });
  ipcMain.handle("open-workshop", (_event, modId) =>
    gameManager.openWorkshopPage(modId),
  );
  ipcMain.handle("check-gamemode", () => gameManager.checkGameMode());
  ipcMain.handle("scan-proton-versions", () =>
    gameManager.scanProtonVersions(),
  );
}

module.exports = {
  registerGameHandlers,
};
