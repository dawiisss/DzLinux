const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { existsAsync } = require("./fileUtils");

const STEAM_DIR_CANDIDATES = [
  path.join(os.homedir(), ".steam", "steam"),
  path.join(os.homedir(), ".local", "share", "Steam"),
  path.join(
    os.homedir(),
    ".var",
    "app",
    "com.valvesoftware.Steam",
    ".local",
    "share",
    "Steam",
  ),
];

let cachedSteamInstallPath = null;
let cachedDayzWorkshopFolder = null;
/**
 * @deprecated Use getSteamInstallPathAsync() to prevent blocking the event loop (Rule 13).
 */
function getSteamInstallPath() {
  if (cachedSteamInstallPath !== null) {
    return cachedSteamInstallPath;
  }
  for (const dir of STEAM_DIR_CANDIDATES) {
    if (fs.existsSync(dir)) {
      cachedSteamInstallPath = dir;
      return dir;
    }
  }
  return path.join(os.homedir(), ".local", "share", "Steam");
}

async function getSteamInstallPathAsync() {
  if (cachedSteamInstallPath !== null) {
    return cachedSteamInstallPath;
  }
  for (const dir of STEAM_DIR_CANDIDATES) {
    if (await existsAsync(dir)) {
      cachedSteamInstallPath = dir;
      return dir;
    }
  }
  return path.join(os.homedir(), ".local", "share", "Steam");
}

// Enumerate every configured library, with the install root as a fallback.
async function getSteamLibraryPathsAsync() {
  const steamPath = await getSteamInstallPathAsync();
  const libraries = [];
  try {
    const content = await fs.promises.readFile(
      path.join(steamPath, "steamapps", "libraryfolders.vdf"), "utf8",
    );
    for (const match of content.matchAll(/"path"\s+"([^"]+)"/g)) {
      libraries.push(match[1].replace(/\\\\/g, "\\"));
    }
  } catch (err) {
    if (err.code !== "ENOENT") console.warn("Could not read Steam libraries:", err.message);
  }
  return [...new Set([...libraries, steamPath])];
}

/**
 * @deprecated Use findDayzWorkshopFolderAsync() to prevent blocking the event loop (Rule 13).
 */
function findDayzWorkshopFolder() {
  if (cachedDayzWorkshopFolder !== null) {
    return cachedDayzWorkshopFolder;
  }
  const steamPath = getSteamInstallPath();

  if (steamPath && fs.existsSync(steamPath)) {
    const vdfPath = path.join(steamPath, "steamapps", "libraryfolders.vdf");
    if (fs.existsSync(vdfPath)) {
      const vdfContent = fs.readFileSync(vdfPath, "utf8");
      const pathRegex = /"path"\s+"([^"]+)"/g;
      let match;
      while ((match = pathRegex.exec(vdfContent)) !== null) {
        const libPath = match[1];
        const workshopPath = path.join(
          libPath,
          "steamapps",
          "workshop",
          "content",
          "221100",
        );
        if (fs.existsSync(workshopPath)) {
          cachedDayzWorkshopFolder = workshopPath;
          return workshopPath;
        }
      }
    }

    // Fallback to default steam install location
    const mainWorkshopPath = path.join(
      steamPath,
      "steamapps",
      "workshop",
      "content",
      "221100",
    );
    if (fs.existsSync(mainWorkshopPath)) {
      cachedDayzWorkshopFolder = mainWorkshopPath;
      return mainWorkshopPath;
    }
  }
  return "";
}

async function findDayzWorkshopFolderAsync() {
  if (cachedDayzWorkshopFolder !== null) {
    return cachedDayzWorkshopFolder;
  }
  for (const library of await getSteamLibraryPathsAsync()) {
    const workshopPath = path.join(library, "steamapps", "workshop", "content", "221100");
    if (await existsAsync(workshopPath)) {
      cachedDayzWorkshopFolder = workshopPath;
      return workshopPath;
    }
  }
  return "";
}

async function findDayzSteamappsFolderAsync(modDirectory) {
  if (modDirectory && modDirectory.includes("steamapps")) {
    const candidate = modDirectory.split("steamapps")[0] + "steamapps";
    const dayzExe = path.join(candidate, "common", "DayZ", "DayZ_x64.exe");
    if (await existsAsync(dayzExe)) {
      return candidate;
    }
  }

  for (const library of await getSteamLibraryPathsAsync()) {
    const candidate = path.join(library, "steamapps");
    if (await existsAsync(path.join(candidate, "common", "DayZ", "DayZ_x64.exe"))) {
      return candidate;
    }
  }

  // Fallback: if modDirectory contains steamapps, return that even if dayzExe wasn't verified
  if (modDirectory && modDirectory.includes("steamapps")) {
    return modDirectory.split("steamapps")[0] + "steamapps";
  }

  return "";
}

function getDayzLogsCandidatePaths() {
  return STEAM_DIR_CANDIDATES.map((steamDir) =>
    path.join(
      steamDir,
      "steamapps",
      "compatdata",
      "221100",
      "pfx",
      "drive_c",
      "users",
      "steamuser",
      "AppData",
      "Local",
      "DayZ",
    )
  );
}

module.exports = {
  getSteamInstallPath,
  getSteamInstallPathAsync,
  getSteamLibraryPathsAsync,
  findDayzWorkshopFolder,
  findDayzWorkshopFolderAsync,
  findDayzSteamappsFolderAsync,
  getDayzLogsCandidatePaths,
  _clearCache: () => {
    cachedSteamInstallPath = null;
    cachedDayzWorkshopFolder = null;
  },
};
