const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
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

async function checkMods(requiredMods) {
  if (!requiredMods || requiredMods.length === 0) {
    return { missingMods: [], hasAllMods: true };
  }

  const settings = settingsManager.loadSettings();
  if (!settings.modDirectory || !fs.existsSync(settings.modDirectory)) {
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
        let isValidDayZMod = false;
        if (fs.existsSync(modPath)) {
          const addonsPath = path.join(modPath, "addons");
          const addonsUpperPath = path.join(modPath, "Addons");
          if (fs.existsSync(addonsPath) || fs.existsSync(addonsUpperPath)) {
            isValidDayZMod = true;
          }
        }

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

    const modPath = path.join(settings.modDirectory, mod.id);
    const addonsPath = path.join(modPath, "addons");
    const addonsUpperPath = path.join(modPath, "Addons");
    if (
      !fs.existsSync(modPath) ||
      (!fs.existsSync(addonsPath) && !fs.existsSync(addonsUpperPath))
    ) {
      missingMods.push(mod);
    }
  }

  return { missingMods, hasAllMods: missingMods.length === 0 };
}

async function launchDayZ(ip, port, mods) {
  const settings = settingsManager.loadSettings();

  if (settings.enableGameMode) {
    const gamemodeAvailable = await checkGameMode();
    if (!gamemodeAvailable) {
      console.warn(
        "GameMode is enabled but gamemoderun is not found on the system."
      );
    }
  }

  const modString = buildModString(settings, mods);
  const extraParams = buildExtraParams(settings);

  const args = ip
    ? ["-connect", ip, "-port", port.toString(), "-noLauncher"]
    : ["-noLauncher"];

  if (modString) {
    args.push(`-mod=${sanitizeArg(modString)}`);
  }
  args.push(...extraParams);

  if (settings.protonPath && settings.protonPath !== "default") {
    await launchViaProton(args, settings, handleGameExit);
  } else {
    await launchViaSteam(ip, port, modString, extraParams, handleGameExit);
  }
}

function openWorkshopPage(modId) {
  const url = `steam://url/CommunityFilePage/${modId}`;
  execFile("xdg-open", [url], (err) => {
    if (err) {
      console.error("Failed to open Workshop URL", err);
    }
  });
}

module.exports = {
  checkMods,
  launchDayZ,
  openWorkshopPage,
  scanProtonVersions,
  checkGameMode,
};
