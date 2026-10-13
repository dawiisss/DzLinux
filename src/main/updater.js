const { autoUpdater } = require("electron-updater");
const { app } = require("electron");
const axios = require("axios");

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.logger = console;

const REPO_OWNER = "dawiisss";
const REPO_NAME = "DzLinux";

function isSystemInstall() {
  if (!app.isPackaged) return false;
  const appPath = app.getAppPath();
  return appPath.startsWith("/opt/") || appPath.startsWith("/usr/");
}

function isAppImage() {
  return !!process.env.APPIMAGE;
}

function compareVersions(v1, v2) {
  const parsePart = (p) => {
    const n = parseInt(p, 10);
    return isNaN(n) ? -1 : n;
  };
  const clean1 = String(v1 || "").replace(/^v/, "");
  const clean2 = String(v2 || "").replace(/^v/, "");
  const [core1, pre1] = clean1.split("-", 2);
  const [core2, pre2] = clean2.split("-", 2);
  const p1 = core1.split(".");
  const p2 = core2.split(".");
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = parsePart(p1[i] || "0");
    const n2 = parsePart(p2[i] || "0");
    if (n1 > n2) return 1;
    if (n2 > n1) return -1;
  }
  if (pre1 && !pre2) return -1;
  if (!pre1 && pre2) return 1;
  if (pre1 && pre2 && pre1 !== pre2) return pre1.localeCompare(pre2);
  return 0;
}

async function checkForUpdates() {
  try {
    const { data } = await axios.get(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      { timeout: 10000 },
    );
    const latestVersion = (data.tag_name || "").replace(/^v/, "");
    const currentVersion = app.getVersion();

    if (compareVersions(latestVersion, currentVersion) <= 0) {
      return { kind: "not-available", currentVersion };
    }

    const isApp = isAppImage();
    if (isApp) {
      const checkPromise = autoUpdater.checkForUpdates();
      if (checkPromise && typeof checkPromise.catch === "function") {
        checkPromise.catch((err) => {
          console.error("Failed to check updates via autoUpdater:", err);
        });
      }
    }

    return {
      kind: "available",
      currentVersion,
      downloadUrl: isApp ? null : data.html_url,
      updateInfo: {
        version: latestVersion,
        releaseNotes: data.body || "",
        releaseDate: data.published_at,
        downloadUrl: isApp ? null : data.html_url,
      },
    };
  } catch (err) {
    return {
      kind: "error",
      currentVersion: app.getVersion(),
      message: err.message,
    };
  }
}

function setupAutoUpdater(mainWindow) {
  autoUpdater.on("update-available", (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-available", {
        version: info.version,
        releaseNotes: Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map((n) => n.note).join("\n")
          : String(info.releaseNotes || ""),
        releaseDate: info.releaseDate,
      });
    }
  });

  autoUpdater.on("update-not-available", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-not-available");
    }
  });

  autoUpdater.on("download-progress", (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-download-progress", {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      });
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-downloaded", {
        version: info.version,
      });
    }
  });

  autoUpdater.on("error", (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-error", {
        message: err.message,
      });
    }
  });
}

module.exports = {
  autoUpdater,
  setupAutoUpdater,
  checkForUpdates,
  compareVersions,
  isSystemInstall,
  isAppImage,
};
