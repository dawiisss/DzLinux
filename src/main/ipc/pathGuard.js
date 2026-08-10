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

async function isAllowedPath(filePath) {
  if (typeof filePath !== "string") return false;
  let resolved;
  try {
    resolved = await fs.promises.realpath(filePath);
  } catch {
    resolved = path.resolve(filePath);
  }
  const prefixes = [...getAllowedPathPrefixes()];
  try {
    const currentSettings = await settingsManager.loadSettingsAsync();
    if (currentSettings && currentSettings.modDirectory) {
      prefixes.push(path.resolve(currentSettings.modDirectory));
    }
  } catch {
    // Fallback if settings fail to load
  }
  return prefixes.some((prefix) => {
    if (resolved === prefix) return true;
    const boundaryPrefix = prefix.endsWith(path.sep) ? prefix : prefix + path.sep;
    return resolved.startsWith(boundaryPrefix);
  });
}

module.exports = {
  getAllowedPathPrefixes,
  isAllowedPath,
};
