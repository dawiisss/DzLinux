// System IPC handlers: auto-updates, diagnostics, external links, path/disk
// checks guarded by pathGuard, log access, and custom window controls.

const { ipcMain, shell, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { autoUpdater, checkForUpdates, isSystemInstall } = require("../updater");
const logParser = require("../logParser");
const systemCheck = require("../systemCheck");
const { getLogFilePath } = require("../logger");
const { isAllowedPath } = require("./pathGuard");

function registerSystemHandlers() {
  ipcMain.handle("get-diagnostics", () => logParser.getRecentLogs());
  ipcMain.handle("get-session-summary", () => logParser.getSessionSummary());
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
  ipcMain.handle("download-update", () => {
    return autoUpdater
      .downloadUpdate()
      .then(() => true)
      .catch((err) => {
        console.error("Download failed:", err);
        return false;
      });
  });
  ipcMain.handle("install-update", () => {
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
    if (!(await isAllowedPath(filePath))) return false;
    try {
      await fs.promises.access(path.resolve(filePath));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("get-disk-space", async (_event, dirPath) => {
    if (!(await isAllowedPath(dirPath)) || !dirPath.startsWith("/")) {
      return null;
    }
    return new Promise((resolve) => {
      execFile("df", ["-k", dirPath], (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        const lines = stdout.trim().split("\n");
        if (lines.length > 1) {
          const parts = lines[1].trim().split(/\s+/);
          if (parts.length >= 4) {
            const total = parseInt(parts[1], 10) * 1024;
            const used = parseInt(parts[2], 10) * 1024;
            const free = parseInt(parts[3], 10) * 1024;
            if (!isNaN(total) && !isNaN(used) && !isNaN(free)) {
              resolve({ total, used, free });
              return;
            }
          }
        }
        resolve(null);
      });
    });
  });

  ipcMain.on("renderer-log", (_event, msg) => console.log(`[RENDERER] ${msg}`));

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
