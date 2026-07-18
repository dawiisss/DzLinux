const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

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

const fsPromises = fs.promises;

async function existsAsync(p) {
  try {
    await fsPromises.access(p);
    return true;
  } catch {
    return false;
  }
}

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
  const steamPath = await getSteamInstallPathAsync();

  if (steamPath && await existsAsync(steamPath)) {
    const vdfPath = path.join(steamPath, "steamapps", "libraryfolders.vdf");
    if (await existsAsync(vdfPath)) {
      const vdfContent = await fsPromises.readFile(vdfPath, "utf8");
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
        if (await existsAsync(workshopPath)) {
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
    if (await existsAsync(mainWorkshopPath)) {
      cachedDayzWorkshopFolder = mainWorkshopPath;
      return mainWorkshopPath;
    }
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
  findDayzWorkshopFolder,
  findDayzWorkshopFolderAsync,
  getDayzLogsCandidatePaths,
  _clearCache: () => {
    cachedSteamInstallPath = null;
    cachedDayzWorkshopFolder = null;
  },
};
