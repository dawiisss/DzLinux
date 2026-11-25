// Mod management IPC handlers: workshop subscription, installed-mod queries,
// update checks, deletion, and dependency-tree resolution.

const { ipcMain, shell } = require("electron");
const modManager = require("../modManager");
const steamDependencyResolver = require("../steamDependencyResolver");
const { isValidModId } = require("../validation");

function registerModHandlers() {
  const dependencyScans = new WeakMap();
  ipcMain.handle("subscribe-mod", (_event, modId) => {
    if (!isValidModId(modId)) return Promise.reject(new Error("Invalid modId"));
    return shell.openExternal(
      `steam://openurl/https://steamcommunity.com/sharedfiles/filedetails/?id=${modId}`,
    );
  });
  ipcMain.handle("scan-mods", (_event, options) =>
    modManager.scanMods(
      options && typeof options === "object"
        ? { force: options.force === true }
        : {},
    ),
  );
  ipcMain.handle("get-installed-mods", () => modManager.getInstalledMods());
  ipcMain.handle("get-mod-download-sizes", (_event, modIds) => {
    if (!Array.isArray(modIds) || modIds.length > 1000 || !modIds.every(isValidModId)) {
      return Promise.reject(new Error("Invalid mod IDs"));
    }
    return steamDependencyResolver.getModDownloadSizes(modIds);
  });
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
  ipcMain.handle("resolve-mod-dependencies-batch", async ({ sender }, modIds, requestId) => {
    if (!Array.isArray(modIds)) throw new Error("Invalid mod IDs");
    const validIds = [...new Set(modIds.filter(isValidModId).map(String))];
    const roots = validIds.slice(0, 1000);
    const omittedRoots = modIds.filter(id => !isValidModId(id)).length + validIds.length - roots.length;
    dependencyScans.get(sender)?.controller.abort();
    const scan = { requestId, controller: new AbortController() };
    const abort = () => scan.controller.abort();
    dependencyScans.set(sender, scan);
    sender.once("destroyed", abort);
    try {
      const trees = await steamDependencyResolver.resolveBatchDependencies(roots, { signal: scan.controller.signal });
      return scan.controller.signal.aborted ? null : { trees, omittedRoots };
    } catch (error) {
      if (scan.controller.signal.aborted) return null;
      throw error;
    } finally {
      sender.removeListener("destroyed", abort);
      if (dependencyScans.get(sender) === scan) dependencyScans.delete(sender);
    }
  });
  ipcMain.on("cancel-mod-dependency-scan", ({ sender }, requestId) => {
    const scan = dependencyScans.get(sender);
    if (scan && scan.requestId === requestId) scan.controller.abort();
  });
}

module.exports = {
  registerModHandlers,
};
