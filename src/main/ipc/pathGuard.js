// Shared path-traversal guard for IPC handlers that touch the filesystem.
// Paths are only allowed under Steam install locations, system dirs, the user
// home, or the configured mod directory.

const { app } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const settingsManager = require("../settings");

let allowedPathPrefixes = null;
function getAllowedPathPrefixes() {
  if (!allowedPathPrefixes) {
    allowedPathPrefixes = [
      path.join(app.getPath("home"), ".steam"),
      path.join(app.getPath("home"), ".local", "share", "Steam"),
      path.join(app.getPath("home"), ".var", "app", "com.valvesoftware.Steam"),
      "/usr",
      "/opt",
      "/snap",
      app.getPath("home"),
    ];
  }
  return allowedPathPrefixes;
}

async function resolveAllowedPath(filePath) {
  if (typeof filePath !== "string" || !filePath) return null;
  const target = await fs.promises.realpath(filePath).catch(() => null);
  if (!target) return null;

  const rawPrefixes = [...getAllowedPathPrefixes()];
  try {
    const currentSettings = await settingsManager.loadSettingsAsync();
    if (
      currentSettings &&
      typeof currentSettings.modDirectory === "string" &&
      currentSettings.modDirectory.trim().length > 0
    ) {
      rawPrefixes.push(currentSettings.modDirectory);
    }
  } catch {
    // Fallback if settings fail to load
  }

  const allowedPrefixes = await Promise.all(
    rawPrefixes.map((root) => fs.promises.realpath(root).catch(() => null)),
  );

  const allowed = allowedPrefixes.some((root) => {
    if (!root) return false;
    const relative = path.relative(root, target);
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  });
  return allowed ? target : null;
}

module.exports = {
  getAllowedPathPrefixes,
  resolveAllowedPath,
};
