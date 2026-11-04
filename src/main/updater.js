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

function splitVersion(version) {
  const clean = String(version || "").replace(/^v/, "").split("+", 1)[0];
  const dash = clean.indexOf("-");
  return dash === -1
    ? [clean, ""]
    : [clean.slice(0, dash), clean.slice(dash + 1)];
}

// Semver precedence for pre-release tags: numeric identifiers compare
// numerically, numeric sorts before alphanumeric, and a longer set of equal
// leading identifiers wins (so beta.10 > beta.9 and rc.1 > rc).
function comparePrerelease(pre1, pre2) {
  const ids1 = pre1.split(".");
  const ids2 = pre2.split(".");
  for (let i = 0; i < Math.max(ids1.length, ids2.length); i++) {
    if (ids1[i] === undefined) return -1;
    if (ids2[i] === undefined) return 1;
    const num1 = /^\d+$/.test(ids1[i]);
    const num2 = /^\d+$/.test(ids2[i]);
    if (num1 && num2) {
      const diff = Number(ids1[i]) - Number(ids2[i]);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    } else if (num1 !== num2) {
      return num1 ? -1 : 1;
    } else if (ids1[i] !== ids2[i]) {
      return ids1[i] < ids2[i] ? -1 : 1;
    }
  }
  return 0;
}

function compareVersions(v1, v2) {
  const parsePart = (p) => {
    const n = parseInt(p, 10);
    return isNaN(n) ? -1 : n;
  };
  const [core1, pre1] = splitVersion(v1);
  const [core2, pre2] = splitVersion(v2);
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
  if (pre1 && pre2) return comparePrerelease(pre1, pre2);
  return 0;
}

async function checkForUpdates() {
  try {
    const { data } = await axios.get(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      { timeout: 10000 },
    );
    let latestVersion = (data.tag_name || "").replace(/^v/, "");
    const currentVersion = app.getVersion();

    if (compareVersions(latestVersion, currentVersion) <= 0) {
      return { kind: "not-available", currentVersion };
    }

    const isApp = isAppImage();
    let appImageInfo;
    if (isApp) {
      const checked = await autoUpdater.checkForUpdates();
      appImageInfo = checked?.updateInfo;
      if (!appImageInfo || compareVersions(appImageInfo.version, currentVersion) <= 0) {
        return { kind: "not-available", currentVersion };
      }
      latestVersion = appImageInfo.version;
    }

    return {
      kind: "available",
      currentVersion,
      downloadUrl: isApp ? null : data.html_url,
      updateInfo: {
        version: latestVersion,
        releaseNotes: appImageInfo ? normalizeReleaseNotes(appImageInfo.releaseNotes) : data.body || "",
        releaseDate: appImageInfo?.releaseDate || data.published_at,
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

function normalizeReleaseNotes(notes) {
  return Array.isArray(notes)
    ? notes.map(n => n.note).join("\n") : String(notes || "");
}

function setupAutoUpdater(mainWindow) {
  // Availability is returned by checkForUpdates only after metadata is ready.
  // electron-updater emits update-available before its check promise settles.

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
