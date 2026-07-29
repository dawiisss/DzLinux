// Mod management IPC handlers: workshop subscription, installed-mod queries,
// update checks, deletion, and dependency-tree resolution.

const { ipcMain, shell } = require("electron");
const modManager = require("../modManager");
const steamDependencyResolver = require("../steamDependencyResolver");
const { isValidModId } = require("../validation");

function registerModHandlers() {
  ipcMain.handle("subscribe-mod", (_event, modId) => {
    if (!isValidModId(modId)) return Promise.reject(new Error("Invalid modId"));
    return shell.openExternal(
      `steam://openurl/https://steamcommunity.com/sharedfiles/filedetails/?id=${modId}`,
    );
  });
  ipcMain.handle("get-installed-mods", () => modManager.getInstalledMods());
  ipcMain.handle("check-mod-updates", (_event, mods) =>
    modManager.checkModUpdates(
      (Array.isArray(mods) ? mods : []).filter(
        (m) => m && isValidModId(m.id),
      ),
    ),
  );
  ipcMain.handle("check-mod-updates-detailed", (_event, mods) =>
    modManager.checkModUpdatesDetailed(
      (Array.isArray(mods) ? mods : []).filter(
        (m) => m && isValidModId(m.id),
      ),
    ),
  );
  ipcMain.handle("delete-mod", (_event, modId) => modManager.deleteMod(modId));
  ipcMain.handle("open-mod-folder", (_event, modId) =>
    modManager.openModFolder(modId),
  );

  // Dependency Tree Resolver
  ipcMain.handle("resolve-mod-dependencies", (_event, modId) => {
    if (!isValidModId(modId)) {
      return Promise.reject(new Error("Invalid modId"));
    }
    return steamDependencyResolver.resolveDependencies(String(modId));
  });
  ipcMain.handle("resolve-mod-dependencies-batch", (_event, modIds) => {
    const validIds = (Array.isArray(modIds) ? modIds : [])
      .filter(isValidModId)
      .map(String)
      .slice(0, 1000);
    return steamDependencyResolver.resolveBatchDependencies(validIds);
  });
}

module.exports = {
  registerModHandlers,
};
