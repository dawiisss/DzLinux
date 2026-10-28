const fs = require("node:fs");
const path = require("node:path");
const { shell } = require("electron");
const { existsAsync } = require("./fileUtils");
const settingsManager = require("./settings");
const steamworksManager = require("./steamworksManager");
const logParser = require("./logParser");
const {
  checkGameMode,
  buildModString,
  buildExtraParams,
  sanitizeArg,
} = require("./game/prepareEnv");
const { launchViaProton, scanProtonVersions } = require("./game/launchProton");
const { launchViaSteam } = require("./game/launchSteam");
const { isValidIpOrHost, isValidPort } = require("./validation");

/**
 * Handles the game process exit event, particularly looking for non-zero exit codes.
 *
 * @remarks
 * If the game crashes, this function triggers the log parser to retrieve and analyze
 * the latest crash `.rpt` or `.mdmp` file from the Proton prefix. It then broadcasts
 * a 'game-crashed' IPC event to the frontend so the Diagnostics Card can be displayed.
 *
 * @param {Error|null} error - The error object returned by the child process, or null if successful exit.
 */
function handleGameExit(error) {
  if (error) {
    console.log(
      `Game exited with error or non-zero code (${error.code}). Parsing logs...`
    );
    const { BrowserWindow } = require("electron");
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      logParser
        .getRecentLogs()
        .then((logs) => {
          const latestLog = logs[0];
          if (latestLog && latestLog.status !== "CLEAN") {
            if (!windows[0].isDestroyed()) {
              windows[0].webContents.send("game-crashed", latestLog);
            }
          }
        })
        .catch((err) =>
          console.error("Failed to parse logs after crash:", err)
        );
    }
  }
}

async function isModFolderValid(modPath) {
  if (!(await existsAsync(modPath))) return false;
  try {
    const entries = await fs.promises.readdir(modPath);
    return entries.some((entry) => {
      const lower = entry.toLowerCase();
      return lower === "addons" || lower === "meta.cpp" || lower === "mod.cpp";
    });
  } catch {
    return false;
  }
}

async function checkMods(requiredMods) {
  if (!requiredMods || requiredMods.length === 0) {
    return { missingMods: [], hasAllMods: true };
  }


  const settings = await settingsManager.loadSettingsAsync();
  const hasModDir = settings.modDirectory
    ? await existsAsync(settings.modDirectory)
    : false;
  if (!hasModDir) {
    return { missingMods: requiredMods, hasAllMods: false };
  }

  const missingMods = [];
  for (const mod of requiredMods) {
    if (/^\d+$/.test(mod.id)) {
      const state = await steamworksManager.getModState(mod.id);
      if (state !== null) {
        const isInstalled = (state & 4) !== 0;
        const isDownloading = (state & 16) !== 0;
        const isDownloadPending = (state & 32) !== 0;
        const needsUpdate = (state & 8) !== 0;

        const modPath = path.join(settings.modDirectory, mod.id);
        const isValidDayZMod = await isModFolderValid(modPath);

        if (
          !isInstalled ||
          isDownloading ||
          isDownloadPending ||
          needsUpdate ||
          !isValidDayZMod
        ) {
          missingMods.push(mod);
        }
        continue;
      }
    }

    if (typeof mod.id !== "string" || !/^\d+$/.test(mod.id)) {
      missingMods.push(mod);
      continue;
    }
    const modPath = path.join(settings.modDirectory, mod.id);
    const isValidDayZMod = await isModFolderValid(modPath);
    if (!isValidDayZMod) {
      missingMods.push(mod);
    }
  }

  return { missingMods, hasAllMods: missingMods.length === 0 };
}

let gameLaunchQueue = Promise.resolve();

function launchDayZ(ip, port, mods, assertCurrent = () => {}) {
  // Serialize preparation through spawn so a cancelled request releases the
  // shared Steamworks lock before the next request starts preparing.
  const request = gameLaunchQueue.then(() => prepareLaunch(ip, port, mods, assertCurrent));
  gameLaunchQueue = request.catch(() => {});
  return request;
}

async function prepareLaunch(ip, port, mods, assertCurrent) {
  assertCurrent();
  const isOmitted = (v) => v === undefined || v === null || v === "";
  if (isOmitted(ip)) {
    if (!isOmitted(port)) {
      throw new Error("Invalid arguments");
    }
  } else {
    if (!isValidIpOrHost(ip)) {
      throw new Error("Invalid arguments");
    }
    if (!isOmitted(port) && !isValidPort(port)) {
      throw new Error("Invalid arguments");
    }
  }
  const settings = await settingsManager.loadSettingsAsync();

  if (settings.enableGameMode) {
    const gamemodeAvailable = await checkGameMode();
    if (!gamemodeAvailable) {
      console.warn(
        "GameMode is enabled but gamemoderun is not found on the system."
      );
    }
  }

  assertCurrent();
  const modString = buildModString(settings, mods);
  const extraParams = buildExtraParams(settings);

  const portStr = port !== undefined && port !== null ? String(port) : "2302";
  const args = ip
    ? [
        `-connect=${sanitizeArg(ip)}`,
        `-port=${sanitizeArg(portStr)}`,
        "-noLauncher",
      ]
    : ["-noLauncher"];

  if (modString) {
    args.push(`-mod=${sanitizeArg(modString)}`);
  }
  args.push(...extraParams);

  if (settings.protonPath && settings.protonPath !== "default") {
    await launchViaProton(args, settings, handleGameExit, assertCurrent);
  } else {
    await launchViaSteam(ip, port, modString, extraParams, handleGameExit, assertCurrent);
  }
}

function openWorkshopPage(modId) {
  if (typeof modId !== "string" && typeof modId !== "number") return;
  const cleanedId = String(modId).trim();
  if (!/^\d+$/.test(cleanedId)) {
    console.error("Invalid modId for Workshop page:", modId);
    return;
  }
  const url = `steam://url/CommunityFilePage/${cleanedId}`;
  return shell.openExternal(url).catch((err) => {
    console.error("Failed to open Workshop URL", err);
  });
}

module.exports = {
  checkMods,
  launchDayZ,
  openWorkshopPage,
  scanProtonVersions,
  checkGameMode,
};
