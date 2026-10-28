const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { existsAsync } = require("./fileUtils");

function getSteamDirCandidates() {
  const home = os.homedir();
  return [
    path.join(home, ".steam", "steam"),
    path.join(home, ".local", "share", "Steam"),
    path.join(
      home,
      ".var",
      "app",
      "com.valvesoftware.Steam",
      ".local",
      "share",
      "Steam",
    ),
  ];
}

let cachedSteamInstallPath = null;
let cachedDayzWorkshopFolder = null;

async function getSteamInstallPathAsync() {
  if (cachedSteamInstallPath !== null) {
    return cachedSteamInstallPath;
  }
  for (const dir of getSteamDirCandidates()) {
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

function getDayzLogsPathForRoot(steamDir) {
  return path.join(
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
  );
}

async function getDayzLogsCandidatePathsAsync() {
  const libraries = await getSteamLibraryPathsAsync();
  const roots = [...new Set([...libraries, ...getSteamDirCandidates()])];
  return roots.map(getDayzLogsPathForRoot);
}

module.exports = {
  getSteamInstallPathAsync,
  getSteamLibraryPathsAsync,
  findDayzWorkshopFolderAsync,
  findDayzSteamappsFolderAsync,
  getDayzLogsCandidatePathsAsync,
  _clearCache: () => {
    cachedSteamInstallPath = null;
    cachedDayzWorkshopFolder = null;
  },
};
