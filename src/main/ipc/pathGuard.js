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
  const logical = path.resolve(filePath);

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

  const allowedPrefixes = new Set();
  await Promise.all(
    rawPrefixes.map(async (raw) => {
      const resolvedPrefix = path.resolve(raw);
      allowedPrefixes.add(resolvedPrefix);
      try {
        const real = await fs.promises.realpath(resolvedPrefix);
        allowedPrefixes.add(real);
      } catch {
        // Path might not exist on disk, ignore
      }
    }),
  );

  return Array.from(allowedPrefixes).some((prefix) => {
    for (const target of [resolved, logical]) {
      if (target === prefix) return true;
      const boundaryPrefix = prefix.endsWith(path.sep)
        ? prefix
        : prefix + path.sep;
      if (target.startsWith(boundaryPrefix)) return true;
    }
    return false;
  });
}

module.exports = {
  getAllowedPathPrefixes,
  isAllowedPath,
};
