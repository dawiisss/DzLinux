const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const steamPaths = require("./steamPaths");
const settingsManager = require("./settings");
const { scanProtonVersions } = require("./game/launchProton");
const { checkGameMode } = require("./game/prepareEnv");

function execFilePromise(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, (error, stdout, stderr) => {
      resolve({ error, stdout: stdout || "", stderr: stderr || "" });
    });
  });
}

async function checkSteamStatus() {
  const installPath = await steamPaths.getSteamInstallPathAsync();
  let exists = false;
  if (installPath) {
    try {
      await fs.promises.access(installPath);
      exists = true;
    } catch {
      exists = false;
    }
  }

  const pgrepResult = await execFilePromise("pgrep", ["-x", "steam"]);
  const isRunning = !pgrepResult.error && pgrepResult.stdout.trim().length > 0;

  if (exists) {
    return {
      id: "steam",
      category: "Steam Environment",
      label: "Steam Installation & Status",
      status: "pass",
      details: `Steam directory found at ${installPath}${isRunning ? " (Steam process is running)" : ""}.`,
      fixSuggestion: null,
    };
  }

  return {
    id: "steam",
    category: "Steam Environment",
    label: "Steam Installation & Status",
    status: "error",
    details: "Steam installation directory could not be located on your Linux system.",
    fixSuggestion: "Ensure Steam for Linux is installed via your package manager, Flatpak, or Snap, and launch Steam at least once.",
  };
}

async function checkProtonStatus() {
  const versions = await scanProtonVersions();
  if (versions && versions.length > 0) {
    const list = versions.map((v) => v.name).join(", ");
    return {
      id: "proton",
      category: "Proton Compatibility",
      label: "Proton Versions Installed",
      status: "pass",
      details: `Found ${versions.length} Proton installation(s): ${list}.`,
      fixSuggestion: null,
    };
  }

  return {
    id: "proton",
    category: "Proton Compatibility",
    label: "Proton Versions Installed",
    status: "error",
    details: "No custom or Valve Proton compatibility layers were detected in standard Steam paths.",
    fixSuggestion: "Install GE-Proton via ProtonUp-Qt or enable Steam Play for all titles in Steam Settings -> Compatibility.",
  };
}

async function checkDiskSpaceAndPermissions() {
  const settings = await settingsManager.loadSettingsAsync();
  const modDir = settings.modDirectory;

  if (!modDir) {
    return {
      id: "storage",
      category: "Storage & Workshop",
      label: "Workshop Directory & Disk Space",
      status: "warn",
      details: "DayZ Workshop mod directory is not configured in Settings.",
      fixSuggestion: "Set your DayZ Workshop directory in Settings (typically ~/.steam/steam/steamapps/workshop/content/221100).",
    };
  }

  try {
    await fs.promises.access(modDir, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    return {
      id: "storage",
      category: "Storage & Workshop",
      label: "Workshop Directory & Disk Space",
      status: "error",
      details: `Workshop directory exists at ${modDir} but is not writable by the current user.`,
      fixSuggestion: `Fix ownership or permissions with: chmod -R u+rw "${modDir}"`,
    };
  }

  const dfRes = await execFilePromise("df", ["-k", modDir]);
  if (!dfRes.error) {
    const lines = dfRes.stdout.trim().split("\n");
    if (lines.length > 1) {
      const parts = lines[1].trim().split(/\s+/);
      if (parts.length >= 4) {
        const freeKb = parseInt(parts[3], 10);
        if (!isNaN(freeKb)) {
          const freeGb = (freeKb / (1024 * 1024)).toFixed(1);
          if (freeKb < 2 * 1024 * 1024) {
            return {
              id: "storage",
              category: "Storage & Workshop",
              label: "Workshop Directory & Disk Space",
              status: "error",
              details: `Critical low disk space on Workshop drive: only ${freeGb} GB available (minimum 10 GB recommended for DayZ mods).`,
              fixSuggestion: "Free up disk space on the partition containing your Steam Workshop folder.",
            };
          }
          if (freeKb < 10 * 1024 * 1024) {
            return {
              id: "storage",
              category: "Storage & Workshop",
              label: "Workshop Directory & Disk Space",
              status: "warn",
              details: `Low disk space on Workshop drive: ${freeGb} GB available (${modDir}).`,
              fixSuggestion: "Consider freeing up additional disk space for large server mod downloads.",
            };
          }
          return {
            id: "storage",
            category: "Storage & Workshop",
            label: "Workshop Directory & Disk Space",
            status: "pass",
            details: `Workshop directory writable with ${freeGb} GB available free space (${modDir}).`,
            fixSuggestion: null,
          };
        }
      }
    }
  }

  return {
    id: "storage",
    category: "Storage & Workshop",
    label: "Workshop Directory & Disk Space",
    status: "pass",
    details: `Workshop directory is accessible and writable (${modDir}).`,
    fixSuggestion: null,
  };
}

async function checkGameModeStatus() {
  const isAvailable = await checkGameMode();
  if (isAvailable) {
    return {
      id: "gamemode",
      category: "System Performance",
      label: "Feral GameMode Daemon",
      status: "pass",
      details: "GameMode daemon/executable is available on system PATH.",
      fixSuggestion: null,
    };
  }

  return {
    id: "gamemode",
    category: "System Performance",
    label: "Feral GameMode Daemon",
    status: "warn",
    details: "GameMode binary (`gamemoded` / `gamemoderun`) was not found on system PATH.",
    fixSuggestion: "Install `gamemode` via your Linux package manager (e.g. `sudo apt install gamemode` or `sudo pacman -S gamemode`) for automatic CPU governor tuning during gameplay.",
  };
}

async function checkMangoHudStatus() {
  const res = await execFilePromise("which", ["mangohud"]);
  if (!res.error && res.stdout.trim().length > 0) {
    return {
      id: "mangohud",
      category: "System Performance",
      label: "MangoHud Performance Overlay",
      status: "pass",
      details: `MangoHud overlay binary found at ${res.stdout.trim()}.`,
      fixSuggestion: null,
    };
  }

  return {
    id: "mangohud",
    category: "System Performance",
    label: "MangoHud Performance Overlay",
    status: "warn",
    details: "MangoHud executable was not found on system PATH.",
    fixSuggestion: "Install `mangohud` via your package manager or Flatpak if you wish to use HUD performance overlays in DayZ.",
  };
}

async function checkVulkanStatus() {
  const icdPaths = [
    "/usr/share/vulkan/icd.d",
    "/usr/local/share/vulkan/icd.d",
    "/etc/vulkan/icd.d",
  ];

  const foundIcds = [];
  for (const dir of icdPaths) {
    try {
      const files = await fs.promises.readdir(dir);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));
      if (jsonFiles.length > 0) {
        foundIcds.push(...jsonFiles.map((f) => path.join(dir, f)));
      }
    } catch {
      // Directory doesn't exist
    }
  }

  if (foundIcds.length > 0) {
    return {
      id: "vulkan",
      category: "Graphics & Drivers",
      label: "Vulkan GPU Driver Configuration",
      status: "pass",
      details: `Detected ${foundIcds.length} Vulkan ICD driver manifest(s) (e.g., ${path.basename(foundIcds[0])}).`,
      fixSuggestion: null,
    };
  }

  const vkRes = await execFilePromise("which", ["vulkaninfo"]);
  if (!vkRes.error && vkRes.stdout.trim().length > 0) {
    return {
      id: "vulkan",
      category: "Graphics & Drivers",
      label: "Vulkan GPU Driver Configuration",
      status: "pass",
      details: "vulkaninfo utility found on system PATH.",
      fixSuggestion: null,
    };
  }

  return {
    id: "vulkan",
    category: "Graphics & Drivers",
    label: "Vulkan GPU Driver Configuration",
    status: "warn",
    details: "No Vulkan ICD driver manifests were detected in standard /usr/share/vulkan/icd.d paths.",
    fixSuggestion: "Ensure your graphics drivers (Mesa Vulkan, NVIDIA proprietary, or RADV) are properly installed.",
  };
}

async function runSystemCheck() {
  const results = await Promise.all([
    checkSteamStatus(),
    checkProtonStatus(),
    checkDiskSpaceAndPermissions(),
    checkGameModeStatus(),
    checkMangoHudStatus(),
    checkVulkanStatus(),
  ]);

  return results;
}

module.exports = {
  runSystemCheck,
  checkSteamStatus,
  checkProtonStatus,
  checkDiskSpaceAndPermissions,
  checkGameModeStatus,
  checkMangoHudStatus,
  checkVulkanStatus,
};
