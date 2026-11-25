// System IPC handlers: auto-updates, diagnostics, external links, path/disk
// checks guarded by pathGuard, log access, and custom window controls.

const { ipcMain, shell, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { autoUpdater, checkForUpdates, isSystemInstall, canUpdateAppImage } = require("../updater");
const logParser = require("../logParser");
const systemCheck = require("../systemCheck");
const { getLogFilePath } = require("../logger");
const { resolveAllowedPath } = require("./pathGuard");
const { isBoundedString } = require("../validation");

function registerSystemHandlers() {
  ipcMain.handle("get-diagnostics", () => logParser.getRecentLogs());
  ipcMain.handle("get-session-summary", () => logParser.getSessionSummary());
  ipcMain.handle("get-diagnostics-snapshot", () =>
    logParser.getDiagnosticsSnapshot(),
  );
  ipcMain.handle("run-system-compatibility-check", () =>
    systemCheck.runSystemCheck(),
  );

  ipcMain.handle("check-for-updates", async () => {
    const result = await checkForUpdates();
    if (result.kind === "available" && isSystemInstall()) {
      return {
        kind: "system-package",
        currentVersion: result.currentVersion,
        releaseUrl:
          result.updateInfo.downloadUrl ||
          "https://github.com/dawiisss/DzLinux/releases/latest",
      };
    }
    return result;
  });
  ipcMain.handle("download-update", async () => {
    if (!(await canUpdateAppImage())) throw new Error("Update this installation from the release page.");
    return autoUpdater
      .downloadUpdate()
      .then(() => true)
      .catch((err) => {
        console.error("Download failed:", err);
        return false;
      });
  });
  ipcMain.handle("install-update", async () => {
    if (!(await canUpdateAppImage())) throw new Error("Update this installation from the release page.");
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle("open-external", (_event, url) => {
    if (
      typeof url !== "string" ||
      (!url.startsWith("https://") && !url.startsWith("http://"))
    ) {
      return Promise.reject(new Error("Invalid URL scheme"));
    }
    return shell.openExternal(url);
  });

  ipcMain.handle("check-path-exists", async (_event, filePath) => {
    return (await resolveAllowedPath(filePath)) !== null;
  });

  ipcMain.handle("get-disk-space", async (_event, dirPath) => {
    if (typeof dirPath !== "string" || !path.isAbsolute(dirPath)) return null;
    const allowedPath = await resolveAllowedPath(dirPath);
    if (!allowedPath) return null;
    try {
      const stats = await fs.promises.statfs(allowedPath);
      const total = stats.blocks * stats.bsize;
      const free = stats.bavail * stats.bsize;
      const used = total - stats.bfree * stats.bsize;
      return { total, used, free };
    } catch {
      return null;
    }
  });

  ipcMain.on("renderer-log", (_event, msg) => {
    if (!isBoundedString(msg)) return;
    console.log(`[RENDERER] ${msg}`);
  });

  ipcMain.handle("open-log-file", () => {
    const logPath = getLogFilePath();
    shell.showItemInFolder(logPath);
  });

  ipcMain.on("window-min", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
  });

  ipcMain.on("window-max", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
  });

  ipcMain.on("window-close", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.close();
  });
}

module.exports = {
  registerSystemHandlers,
};
