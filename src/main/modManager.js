const fs = require("fs");
const path = require("path");
const { shell } = require("electron");
const settingsManager = require("./settings");
const axios = require("axios");
const steamworksManager = require("./steamworksManager");

const MOD_UPDATE_TOLERANCE_SECONDS = 3600; // 1 hour buffer for timezone/download delay edges

// Scans the modDirectory, finds all workshop mod folders, parses meta.cpp for names and returns mod details
async function getInstalledMods() {
  const settings = settingsManager.loadSettings();
  const modDir = settings.modDirectory;

  if (!modDir) {
    return [];
  }
  const dirExists = await fs.promises.access(modDir).then(() => true).catch(() => false);
  if (!dirExists) {
    return [];
  }

  try {
    const folders = await fs.promises.readdir(modDir);
    const mods = [];

    const subscribedItems = await steamworksManager.getSubscribedMods();
    const subscribedSet =
      subscribedItems && subscribedItems.length > 0
        ? new Set(subscribedItems)
        : null;

    const modPromises = folders.map(async (folder) => {
      const folderPath = path.join(modDir, folder);
      let stat;
      try {
        stat = await fs.promises.stat(folderPath);
      } catch {
        return null;
      }

      // Workshop mods are directories and usually numeric ID folders
      if (stat.isDirectory() && /^\d+$/.test(folder)) {
        // If we successfully got the subscribed list, and this folder isn't in it, skip it!
        if (subscribedSet && !subscribedSet.has(folder)) {
          return null;
        }
        let name = `Workshop Mod ${folder}`;
        let author = "Unknown";
        let version = "Unknown";
        let overview = "";

        const metaPath = path.join(folderPath, "meta.cpp");
        const modInfoPath = path.join(folderPath, "mod.cpp");

        // Try parsing the real name from meta.cpp
        let metaContent = null;
        try {
          metaContent = await fs.promises.readFile(metaPath, "utf8");
          const nameMatch = metaContent.match(/name\s*=\s*"([^"]+)"/i);
          if (nameMatch && nameMatch[1]) {
            name = nameMatch[1];
          }
        } catch (err) {
          if (err.code !== "ENOENT") {
            console.error(
              `Failed to parse meta.cpp for mod ${folder}`,
              err.message,
            );
          }
        }

        let infoContent = null;
        try {
          infoContent = await fs.promises.readFile(modInfoPath, "utf8");
          const nameMatch = infoContent.match(/name\s*=\s*"([^"]+)"/i);
          if (nameMatch) name = nameMatch[1];

          const authorMatch = infoContent.match(/author\s*=\s*"([^"]+)"/i);
          if (authorMatch) author = authorMatch[1];

          const versionMatch = infoContent.match(/version\s*=\s*"([^"]+)"/i);
          if (versionMatch) version = versionMatch[1];

          const overviewMatch = infoContent.match(
            /overview\s*=\s*"([\s\S]*?)"/i,
          );
          if (overviewMatch)
            overview = overviewMatch[1].replace(/\r?\n/g, " ").trim();
        } catch {}

        // Estimate folder size in MB recursively (asynchronous)
        let sizeBytes = 0;
        try {
          sizeBytes = await getFolderSize(folderPath);
        } catch {
          // Ignore size read errors
        }

        // Integrity Check: A valid mod should at least have a meta.cpp and not be empty
        const isCorrupted = metaContent === null || sizeBytes < 1024;

        return {
          id: folder,
          name: name,
          author: author,
          version: version,
          overview: overview,
          path: folderPath,
          sizeMB: Math.round((sizeBytes / (1024 * 1024)) * 10) / 10,
          lastModified: stat.mtime,
          isCorrupted: isCorrupted,
        };
      }
      return null;
    });

    const resolvedMods = await Promise.all(modPromises);
    for (const m of resolvedMods) {
      if (m) mods.push(m);
    }

    // Sort mods by name alphabetically
    mods.sort((a, b) => a.name.localeCompare(b.name));
    return mods;
  } catch (e) {
    console.error("Failed to scan installed mods", e.message);
    return [];
  }
}

const fsPromises = require("fs").promises;

// Asynchronous iterative folder size calculator
async function getFolderSize(dirPath) {
  let size = 0;
  const queue = [dirPath];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    try {
      const files = await fsPromises.readdir(currentDir, {
        withFileTypes: true,
      });

      // ⚡ Bolt: Collect stat promises to execute them concurrently instead of blocking sequentially
      const statPromises = [];

      for (const file of files) {
        const filePath = path.join(currentDir, file.name);
        if (file.isDirectory()) {
          queue.push(filePath);
        } else {
          statPromises.push(
            fsPromises
              .stat(filePath)
              .then((stat) => stat.size)
              .catch(() => 0), // Ignore individual file stat errors
          );
        }
      }

      if (statPromises.length > 0) {
        const sizes = await Promise.all(statPromises);
        size += sizes.reduce((acc, curr) => acc + curr, 0);
      }
    } catch {
      // Ignore directory read errors
    }
  }
  return size;
}

function validateModId(modId) {
  if (typeof modId !== "string" || !/^\d+$/.test(modId)) {
    return false;
  }
  return true;
}

function safeModPath(modDirectory, modId) {
  const resolved = path.resolve(path.join(modDirectory, modId));
  if (!resolved.startsWith(path.resolve(modDirectory))) {
    return null;
  }
  return resolved;
}

// Open folder in system file explorer
async function openModFolder(modId) {
  if (!validateModId(modId)) return false;
  const settings = settingsManager.loadSettings();
  const modPath = safeModPath(settings.modDirectory, modId);
  if (!modPath) return false;
  const pathExists = await fs.promises.access(modPath).then(() => true).catch(() => false);
  if (!pathExists) return false;
  shell.openPath(modPath).catch(console.error);
  return true;
}

// Safely delete a mod folder recursively
async function deleteMod(modId) {
  if (!validateModId(modId)) return false;
  const settings = settingsManager.loadSettings();
  const modPath = safeModPath(settings.modDirectory, modId);
  if (!modPath) return false;
  const pathExists = await fs.promises.access(modPath).then(() => true).catch(() => false);
  if (!pathExists) return false;
  try {
    await fs.promises.rm(modPath, { recursive: true, force: true });
    return true;
  } catch (e) {
    console.error(`Failed to delete mod ${modId}`, e.message);
    return false;
  }
}

// Query Steam Web API to check if mods are outdated
async function checkModUpdates(mods, detailed = false) {
  if (!mods || mods.length === 0) {
    return detailed ? { outdatedMods: [], totalChecked: 0 } : [];
  }

  const modsMap = new Map(mods.map((m) => [m.id, m]));

  // We can only query a batch of mods at once. Steam usually allows ~100.
  // For simplicity, we process them in chunks of 50.
  const chunkSize = 50;
  const outdatedMods = [];
  const settings = settingsManager.loadSettings();
  let totalChecked = 0;

  for (let i = 0; i < mods.length; i += chunkSize) {
    const chunk = mods.slice(i, i + chunkSize);
    const formData = new URLSearchParams();
    formData.append("itemcount", chunk.length.toString());
    chunk.forEach((mod, index) => {
      formData.append(`publishedfileids[${index}]`, mod.id);
    });

    try {
      const response = await axios.post(
        "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
        formData.toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 5000,
        },
      );

      if (
        response.data &&
        response.data.response &&
        response.data.response.publishedfiledetails
      ) {
        for (const detail of response.data.response.publishedfiledetails) {
          if (detail.result === 1) {
            totalChecked++;
            const modId = detail.publishedfileid;
            const timeUpdated = detail.time_updated; // Unix timestamp in seconds

            // Compare with local mod's meta.cpp or folder mtime
            const metaPath = path.join(
              settings.modDirectory,
              modId,
              "meta.cpp",
            );
            try {
              const stat = await fs.promises.stat(metaPath);
              const localTime = Math.floor(stat.mtimeMs / 1000);

              // If workshop time is newer than local time by more than 1 hour, flag it
              // (Gives a buffer for timezone/download delay edges)
              if (timeUpdated > localTime + MOD_UPDATE_TOLERANCE_SECONDS) {
                if (detailed) {
                  const localMod = modsMap.get(modId);
                  outdatedMods.push({
                    id: modId,
                    name: localMod ? localMod.name : `Mod ${modId}`,
                    localTimestamp: localTime,
                    remoteTimestamp: timeUpdated,
                    daysOutdated: Math.round((timeUpdated - localTime) / 86400),
                  });
                } else {
                  outdatedMods.push(modId);
                }
              }
            } catch {
              // Ignore if file doesn't exist
            }
          }
        }
      }
    } catch (e) {
      console.error(
        `Failed to fetch ${detailed ? "detailed " : ""}mod updates from Steam API`,
        e.message,
      );
    }
  }

  return detailed ? { outdatedMods, totalChecked } : outdatedMods;
}

// Detailed mod update check with rich metadata
async function checkModUpdatesDetailed(mods) {
  return await checkModUpdates(mods, true);
}

module.exports = {
  getInstalledMods,
  openModFolder,
  deleteMod,
  checkModUpdates,
  checkModUpdatesDetailed,
};
