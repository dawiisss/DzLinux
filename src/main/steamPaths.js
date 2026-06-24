const fs = require("fs");
const path = require("path");
const os = require("os");

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

function getSteamInstallPath() {
  for (const dir of STEAM_DIR_CANDIDATES) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return path.join(os.homedir(), ".local", "share", "Steam"); // Default fallback
}

function findDayzWorkshopFolder() {
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
  findDayzWorkshopFolder,
  getDayzLogsCandidatePaths,
};
