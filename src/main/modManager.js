const fs = require("node:fs");
const path = require("node:path");
const { shell } = require("electron");
const settingsManager = require("./settings");
const axios = require("axios");
const steamworksManager = require("./steamworksManager");

const MOD_UPDATE_TOLERANCE_SECONDS = 3600; // 1 hour buffer for timezone/download delay edges
const MAX_ACTIVE_MODS = 4;
const MAX_ACTIVE_FS_OPS = 16;
const MAX_FILE_WORKERS_PER_MOD = 4;

let activeFsOps = 0;
let peakFsOps = 0;
let totalFsOps = 0;
let activeModScans = 0;
let peakModScans = 0;
const fsWaitQueue = [];

function acquireFsSlot() {
  if (activeFsOps < MAX_ACTIVE_FS_OPS) {
    activeFsOps++;
    totalFsOps++;
    if (activeFsOps > peakFsOps) peakFsOps = activeFsOps;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    fsWaitQueue.push(resolve);
  });
}

function releaseFsSlot() {
  const next = fsWaitQueue.shift();
  if (next) {
    totalFsOps++;
    if (activeFsOps > peakFsOps) peakFsOps = activeFsOps;
    next();
  } else {
    activeFsOps--;
  }
}

async function withFsSlot(fn) {
  await acquireFsSlot();
  try {
    return await fn();
  } finally {
    releaseFsSlot();
  }
}

function getScanMetrics() {
  return {
    activeFsOps,
    peakFsOps,
    totalFsOps,
    activeModScans,
    peakModScans,
    maxFsConcurrency: MAX_ACTIVE_FS_OPS,
    maxModConcurrency: MAX_ACTIVE_MODS,
  };
}

function resetScanMetrics() {
  peakFsOps = activeFsOps;
  totalFsOps = 0;
  peakModScans = activeModScans;
}

function classifyFsErrorReason(err) {
  const code = err && typeof err.code === "string" ? err.code : "";
  if (code === "ENOENT" || code === "ENOTDIR") return "not-found";
  if (code === "EACCES" || code === "EPERM") return "permission-denied";
  return "io-error";
}

function boundedErrorCode(err) {
  if (err && typeof err.code === "string" && err.code.length <= 32) {
    return err.code;
  }
  return "EIO";
}

let currentScan = null;
let nextScanId = 0;

async function scanSingleMod(modDir, folder, stat, shouldAbort) {
  const folderPath = path.join(modDir, folder);
  let name = `Workshop Mod ${folder}`;
  let author = "Unknown";
  let version = "Unknown";
  let overview = "";

  const metaPath = path.join(folderPath, "meta.cpp");
  const modInfoPath = path.join(folderPath, "mod.cpp");

  let metaState = "missing";
  let modErrorCode = null;

  if (shouldAbort()) return null;

  try {
    const metaContent = await withFsSlot(() =>
      fs.promises.readFile(metaPath, "utf8"),
    );
    metaState = "present";
    const nameMatch = metaContent.match(/name\s*=\s*"([^"]+)"/i);
    if (nameMatch && nameMatch[1]) {
      name = nameMatch[1];
    }
  } catch (err) {
    if (err && err.code === "ENOENT") {
      metaState = "missing";
    } else {
      metaState = "error";
      modErrorCode = boundedErrorCode(err);
      console.error(`Failed to parse meta.cpp for mod ${folder}`, err.message);
    }
  }

  if (shouldAbort()) return null;

  let modInfoError = false;
  try {
    const infoContent = await withFsSlot(() =>
      fs.promises.readFile(modInfoPath, "utf8"),
    );
    const nameMatch = infoContent.match(/name\s*=\s*"([^"]+)"/i);
    if (nameMatch) name = nameMatch[1];

    const authorMatch = infoContent.match(/author\s*=\s*"([^"]+)"/i);
    if (authorMatch) author = authorMatch[1];

    const versionMatch = infoContent.match(/version\s*=\s*"([^"]+)"/i);
    if (versionMatch) version = versionMatch[1];

    const overviewMatch = infoContent.match(/overview\s*=\s*"([\s\S]*?)"/i);
    if (overviewMatch) {
      overview = overviewMatch[1].replace(/\r?\n/g, " ").trim();
    }
  } catch (err) {
    if (!err || err.code !== "ENOENT") {
      modInfoError = true;
      modErrorCode = modErrorCode || boundedErrorCode(err);
      console.warn(
        `Failed to parse mod.cpp for mod ${folder}:`,
        err ? err.message : "unknown error",
      );
    }
  }

  if (shouldAbort()) return null;

  const sizeResult = await getFolderSizeDetailed(folderPath, shouldAbort);
  if (shouldAbort() || sizeResult.aborted) return null;

  const sizeBytes = sizeResult.sizeBytes;
  const hasReadFailure =
    metaState === "error" || modInfoError || !sizeResult.complete;

  let scanStatus = "complete";
  let isCorrupted = false;
  let errorCode = null;

  if (hasReadFailure) {
    scanStatus =
      sizeResult.rootUnreadable || (metaState === "error" && sizeBytes === 0)
        ? "unreadable"
        : "partial";
    isCorrupted = false;
    errorCode = modErrorCode || sizeResult.errorCode || "EIO";
  } else {
    scanStatus = "complete";
    isCorrupted = metaState === "missing" || sizeBytes < 1024;
  }

  return {
    id: folder,
    name,
    author,
    version,
    overview,
    path: folderPath,
    sizeBytes,
    sizeMB: Math.round((sizeBytes / (1024 * 1024)) * 10) / 10,
    lastModified: stat ? stat.mtime : new Date(0),
    isCorrupted,
    scanStatus,
    ...(errorCode ? { errorCode } : {}),
  };
}

async function executeModScan(scanId, modDir, shouldAbort) {
  if (!modDir) {
    return {
      scanId,
      root: "",
      status: "unavailable",
      reason: "not-configured",
      mods: [],
      totalSizeBytes: 0,
      sizeComplete: false,
    };
  }

  if (shouldAbort()) {
    return {
      scanId,
      root: modDir,
      status: "cancelled",
      reason: "superseded",
      mods: [],
      totalSizeBytes: 0,
      sizeComplete: false,
    };
  }

  let folders;
  try {
    folders = await withFsSlot(() => fs.promises.readdir(modDir));
  } catch (err) {
    const reason = classifyFsErrorReason(err);
    if (reason !== "not-found") {
      console.error("Failed to scan installed mods", err.message);
    }
    return {
      scanId,
      root: modDir,
      status: "unavailable",
      reason,
      mods: [],
      totalSizeBytes: 0,
      sizeComplete: false,
    };
  }

  if (shouldAbort()) {
    return {
      scanId,
      root: modDir,
      status: "cancelled",
      reason: "superseded",
      mods: [],
      totalSizeBytes: 0,
      sizeComplete: false,
    };
  }

  let subscribedItems = null;
  try {
    subscribedItems = await steamworksManager.getSubscribedMods();
  } catch {
    subscribedItems = null;
  }

  if (shouldAbort()) {
    return {
      scanId,
      root: modDir,
      status: "cancelled",
      reason: "superseded",
      mods: [],
      totalSizeBytes: 0,
      sizeComplete: false,
    };
  }

  const subscribedSet =
    subscribedItems && subscribedItems.length > 0
      ? new Set(subscribedItems)
      : null;

  const mods = [];
  let hasIncompleteEntry = false;
  let firstPartialReason = null;
  let index = 0;

  const workerCount = Math.min(MAX_ACTIVE_MODS, folders.length);
  const workers = [];

  for (let w = 0; w < workerCount; w++) {
    workers.push(
      (async () => {
        activeModScans++;
        if (activeModScans > peakModScans) peakModScans = activeModScans;
        try {
          while (index < folders.length) {
            if (shouldAbort()) break;
            const folder = folders[index++];
            const folderName =
              typeof folder === "string"
                ? folder
                : folder && typeof folder.name === "string"
                  ? folder.name
                  : String(folder);
            const isNumericId = /^\d+$/.test(folderName);
            if (isNumericId && subscribedSet && !subscribedSet.has(folderName)) {
              continue;
            }

            const folderPath = path.join(modDir, folderName);
            let stat;
            try {
              stat = await withFsSlot(() => fs.promises.stat(folderPath));
            } catch (err) {
              hasIncompleteEntry = true;
              firstPartialReason =
                firstPartialReason ||
                (err && (err.code === "EACCES" || err.code === "EPERM")
                  ? "permission-denied"
                  : "io-error");
              if (isNumericId) {
                mods.push({
                  id: folderName,
                  name: `Workshop Mod ${folderName}`,
                  author: "Unknown",
                  version: "Unknown",
                  overview: "",
                  path: folderPath,
                  sizeBytes: 0,
                  sizeMB: 0,
                  lastModified: new Date(0),
                  isCorrupted: false,
                  scanStatus: "unreadable",
                  errorCode: boundedErrorCode(err),
                });
              }
              continue;
            }

            if (shouldAbort()) break;

            if (stat && stat.isDirectory() && isNumericId) {
              const modRecord = await scanSingleMod(
                modDir,
                folderName,
                stat,
                shouldAbort,
              );
              if (shouldAbort() || !modRecord) break;
              if (modRecord.scanStatus !== "complete") {
                hasIncompleteEntry = true;
                firstPartialReason =
                  firstPartialReason ||
                  (modRecord.errorCode === "EACCES" ||
                  modRecord.errorCode === "EPERM"
                    ? "permission-denied"
                    : "io-error");
              }
              mods.push(modRecord);
            }
          }
        } finally {
          activeModScans--;
        }
      })(),
    );
  }

  await Promise.all(workers);

  if (shouldAbort()) {
    return {
      scanId,
      root: modDir,
      status: "cancelled",
      reason: "superseded",
      mods: [],
      totalSizeBytes: 0,
      sizeComplete: false,
    };
  }

  mods.sort((a, b) => a.name.localeCompare(b.name));
  const totalSizeBytes = mods.reduce((sum, m) => sum + (m.sizeBytes || 0), 0);
  const sizeComplete = !hasIncompleteEntry;

  return {
    scanId,
    root: modDir,
    status: sizeComplete ? "complete" : "partial",
    reason: sizeComplete ? null : firstPartialReason || "io-error",
    mods,
    totalSizeBytes,
    sizeComplete,
  };
}

async function scanMods(options = {}) {
  const force = Boolean(options && options.force);
  const settings = await settingsManager.loadSettingsAsync();
  const root =
    settings && typeof settings.modDirectory === "string"
      ? settings.modDirectory.trim()
      : "";

  if (!force && currentScan && !currentScan.aborted && currentScan.root === root) {
    return currentScan.promise;
  }

  if (currentScan && !currentScan.aborted) {
    currentScan.aborted = true;
  }

  const scanId = ++nextScanId;
  const scanCtx = {
    scanId,
    root,
    aborted: false,
    promise: null,
  };
  currentScan = scanCtx;
  const shouldAbort = () => scanCtx.aborted || currentScan !== scanCtx;

  scanCtx.promise = executeModScan(scanId, root, shouldAbort).finally(() => {
    if (currentScan === scanCtx) {
      currentScan = null;
    }
  });

  return scanCtx.promise;
}

// Compatibility wrapper returning installed mods array or rejecting failed/cancelled scans
async function getInstalledMods() {
  const result = await scanMods();
  if (result.status === "cancelled") {
    throw new Error("Mod scan cancelled");
  }
  if (result.status === "unavailable") {
    if (result.reason === "not-configured" || result.reason === "not-found") {
      return [];
    }
    throw new Error(`Mod scan unavailable: ${result.reason || "io-error"}`);
  }
  return result.mods;
}

const fsPromises = fs.promises;

// Asynchronous iterative folder size calculator with bounded concurrency and explicit completeness
async function getFolderSizeDetailed(dirPath, shouldAbort = () => false) {
  let sizeBytes = 0;
  let complete = true;
  let rootUnreadable = false;
  let errorCode = null;
  const dirQueue = [dirPath];

  while (dirQueue.length > 0) {
    if (shouldAbort()) {
      return { sizeBytes, complete: false, aborted: true, rootUnreadable, errorCode };
    }
    const currentDir = dirQueue.pop();
    let files;
    try {
      files = await withFsSlot(() =>
        fsPromises.readdir(currentDir, { withFileTypes: true }),
      );
    } catch (err) {
      complete = false;
      if (currentDir === dirPath) rootUnreadable = true;
      errorCode = errorCode || boundedErrorCode(err);
      continue;
    }

    if (shouldAbort()) {
      return { sizeBytes, complete: false, aborted: true, rootUnreadable, errorCode };
    }

    const filePaths = [];
    for (const file of files) {
      const entryName = typeof file === "string" ? file : file.name;
      const filePath = path.join(currentDir, entryName);
      const isSymLink =
        typeof file === "object" &&
        file !== null &&
        typeof file.isSymbolicLink === "function" &&
        file.isSymbolicLink();
      const isDir =
        typeof file === "object" &&
        file !== null &&
        typeof file.isDirectory === "function" &&
        file.isDirectory();

      if (isDir && !isSymLink) {
        dirQueue.push(filePath);
      } else {
        filePaths.push({ filePath, isSymLink });
      }
    }

    if (filePaths.length > 0) {
      let fileIndex = 0;
      const workerCount = Math.min(MAX_FILE_WORKERS_PER_MOD, filePaths.length);
      const workers = [];
      for (let w = 0; w < workerCount; w++) {
        workers.push(
          (async () => {
            while (fileIndex < filePaths.length) {
              if (shouldAbort()) break;
              const { filePath, isSymLink } = filePaths[fileIndex++];
              try {
                const st = await withFsSlot(() => fsPromises.stat(filePath));
                if (st && typeof st.isDirectory === "function" && st.isDirectory()) {
                  if (!isSymLink) {
                    dirQueue.push(filePath);
                  }
                } else if (st && typeof st.size === "number") {
                  sizeBytes += st.size;
                }
              } catch (err) {
                complete = false;
                errorCode = errorCode || boundedErrorCode(err);
              }
            }
          })(),
        );
      }
      await Promise.all(workers);
    }
  }

  return { sizeBytes, complete, aborted: false, rootUnreadable, errorCode };
}

async function getFolderSize(dirPath) {
  const result = await getFolderSizeDetailed(dirPath);
  return result.sizeBytes;
}

function validateModId(modId) {
  if (typeof modId !== "string" || !/^\d+$/.test(modId)) {
    return false;
  }
  return true;
}

function safeModPath(modDirectory, modId) {
  if (typeof modDirectory !== "string" || modDirectory.trim() === "") {
    return null;
  }
  const baseResolved = path.resolve(modDirectory);
  const resolved = path.resolve(path.join(baseResolved, modId));
  const prefix = baseResolved.endsWith(path.sep) ? baseResolved : baseResolved + path.sep;
  if (!resolved.startsWith(prefix) && resolved !== baseResolved) {
    return null;
  }
  return resolved;
}

// Open folder in system file explorer
async function openModFolder(modId) {
  if (!validateModId(modId)) return false;
  const settings = await settingsManager.loadSettingsAsync();
  const modPath = safeModPath(settings.modDirectory, modId);
  if (!modPath) return false;
  const pathExists = await fs.promises.access(modPath).then(() => true).catch(() => false);
  if (!pathExists) return false;
  shell.openPath(modPath).catch(console.error);
  return true;
}

// Safely delete a mod folder recursively
async function deleteMod(modId) {
  if (!validateModId(modId)) return false;
  const settings = await settingsManager.loadSettingsAsync();
  const modPath = safeModPath(settings.modDirectory, modId);
  if (!modPath) return false;
  const pathExists = await fs.promises.access(modPath).then(() => true).catch(() => false);
  if (!pathExists) return false;
  try {
    await fs.promises.rm(modPath, { recursive: true, force: true });
    return true;
  } catch (e) {
    console.error(`Failed to delete mod ${modId}`, e.message);
    return false;
  }
}

// Query Steam Web API to check if mods are outdated
async function checkModUpdates(mods, detailed = false) {
  if (!mods || mods.length === 0) {
    return detailed ? { outdatedMods: [], totalChecked: 0 } : [];
  }

  const modsMap = new Map(mods.map((m) => [m.id, m]));

  // We can only query a batch of mods at once. Steam usually allows ~100.
  // For simplicity, we process them in chunks of 50.
  const chunkSize = 50;
  const outdatedMods = [];
  const settings = await settingsManager.loadSettingsAsync();
  if (!settings.modDirectory) {
    return detailed ? { outdatedMods: [], totalChecked: 0 } : [];
  }
  let totalChecked = 0;

  for (let i = 0; i < mods.length; i += chunkSize) {
    const chunk = mods.slice(i, i + chunkSize);
    const formData = new URLSearchParams();
    formData.append("itemcount", chunk.length.toString());
    chunk.forEach((mod, index) => {
      formData.append(`publishedfileids[${index}]`, mod.id);
    });

    try {
      const response = await axios.post(
        "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
        formData.toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 5000,
        },
      );

      if (
        response.data &&
        response.data.response &&
        response.data.response.publishedfiledetails
      ) {
        for (const detail of response.data.response.publishedfiledetails) {
          if (detail.result === 1) {
            totalChecked++;
            const modId = detail.publishedfileid;
            const timeUpdated = detail.time_updated; // Unix timestamp in seconds

            // Compare with local mod's meta.cpp or folder mtime
            const metaPath = path.join(
              settings.modDirectory,
              modId,
              "meta.cpp",
            );
            try {
              const stat = await fs.promises.stat(metaPath);
              const localTime = Math.floor(stat.mtimeMs / 1000);

              // If workshop time is newer than local time by more than 1 hour, flag it
              // (Gives a buffer for timezone/download delay edges)
              if (timeUpdated > localTime + MOD_UPDATE_TOLERANCE_SECONDS) {
                if (detailed) {
                  const localMod = modsMap.get(modId);
                  outdatedMods.push({
                    id: modId,
                    name: localMod ? localMod.name : `Mod ${modId}`,
                    localTimestamp: localTime,
                    remoteTimestamp: timeUpdated,
                    daysOutdated: Math.round((timeUpdated - localTime) / 86400),
                  });
                } else {
                  outdatedMods.push(modId);
                }
              }
            } catch {
              // Ignore if file doesn't exist
            }
          }
        }
      }
    } catch (e) {
      console.error(
        `Failed to fetch ${detailed ? "detailed " : ""}mod updates from Steam API`,
        e.message,
      );
    }
  }

  return detailed ? { outdatedMods, totalChecked } : outdatedMods;
}

// Detailed mod update check with rich metadata
async function checkModUpdatesDetailed(mods) {
  return await checkModUpdates(mods, true);
}

module.exports = {
  scanMods,
  getInstalledMods,
  getFolderSize,
  getFolderSizeDetailed,
  getScanMetrics,
  resetScanMetrics,
  openModFolder,
  deleteMod,
  checkModUpdates,
  checkModUpdatesDetailed,
  validateModId,
  safeModPath,
};
