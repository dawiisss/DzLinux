const fs = require("node:fs");
const path = require("node:path");
const settingsManager = require("./settings");
const steamPaths = require("./steamPaths");

/**
 * Resolves the path to the hidden DayZ logs directory inside the active Proton prefix.
 *
 * @remarks
 * DayZ writes its `.rpt` logs into its Windows `AppData/Local/DayZ` folder. When running under Proton,
 * this directory is nested deeply inside Steam's `compatdata` prefix. We traverse upwards from the
 * known Mod Directory to locate it, and provide fallbacks for Flatpak or alternative Steam installations.
 *
 * @returns {string|null} The absolute path to the log directory, or null if it cannot be found.
 */
async function getLogsDirectory() {
  const settings = settingsManager.loadSettings();
  if (!settings.modDirectory) {
    return null;
  }
  const modDirExists = await fs.promises.access(settings.modDirectory).then(() => true).catch(() => false);
  if (!modDirExists) {
    return null;
  }

  // Typical structure: steamapps/workshop/content/221100
  // We want: steamapps/compatdata/221100/pfx/drive_c/users/steamuser/AppData/Local/DayZ
  // Traverse up 3 levels to get to steamapps
  const steamappsPath = path.resolve(settings.modDirectory, "..", "..", "..");
  const dayzPrefixPath = path.join(
    steamappsPath,
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

  const prefixExists = await fs.promises.access(dayzPrefixPath).then(() => true).catch(() => false);
  if (prefixExists) {
    return dayzPrefixPath;
  }

  const searchPaths = steamPaths.getDayzLogsCandidatePaths();

  for (const p of searchPaths) {
    const exists = await fs.promises.access(p).then(() => true).catch(() => false);
    if (exists) return p;
  }

  return null;
}

/**
 * Retrieves and sorts the 15 most recent log files from the Proton prefix.
 *
 * @remarks
 * Filters for `.log`, `.rpt` (DayZ standard text logs), and `.mdmp` (Minidump) files.
 * Each file is automatically analyzed for common crash signatures before being returned.
 *
 * @returns {Promise<Array<Object>>} An array of analyzed log objects, sorted newest to oldest.
 */
async function getRecentLogs() {
  const logsDir = await getLogsDirectory();
  if (!logsDir) return [];

  try {
    const files = await fs.promises.readdir(logsDir);
    const logFiles = files.filter(
      (f) =>
        f.toLowerCase().endsWith(".log") ||
        f.toLowerCase().endsWith(".rpt") ||
        f.toLowerCase().endsWith(".mdmp"),
    );

    const fileDetails = await Promise.all(
      logFiles.map(async (file) => {
        const filePath = path.join(logsDir, file);
        try {
          const stat = await fs.promises.stat(filePath);
          return {
            name: file,
            path: filePath,
            mtime: stat.mtimeMs,
            date: stat.mtime,
          };
        } catch {
          return null;
        }
      })
    );

    const validDetails = fileDetails.filter((d) => d !== null);

    // Sort descending by time
    validDetails.sort((a, b) => b.mtime - a.mtime);

    // Take the top 15 logs
    const recentLogs = validDetails.slice(0, 15);

    // Analyze each log in parallel
    return Promise.all(recentLogs.map((log) => analyzeLog(log)));
  } catch (e) {
    console.error("Failed to read logs directory:", e);
    return [];
  }
}

/**
 * Analyzes a single log file to detect errors, warnings, and crash signatures.
 *
 * @remarks
 * To maintain performance on large `.rpt` files, it primarily scans the last 50KB for known
 * Regular Expression patterns indicating common failures (e.g., Access Violations, Missing Addons).
 * It translates these technical faults into a structured diagnostic object with a plain-English `suggestedFix`.
 *
 * @param {Object} log - The basic file details object (path, name, mtime).
 * @returns {Promise<Object>} A structured diagnostic object containing the `status` ('CLEAN', 'WARNING', or 'CRASH') and a `suggestedFix`.
 */
async function analyzeLog(log) {
  const result = {
    ...log,
    status: "CLEAN",
    snippet: "",
    playtime: "0m",
    connectionDrops: 0,
    suggestedFix: "",
  };

  if (log.name.toLowerCase().endsWith(".mdmp")) {
    result.status = "CRASH";
    result.snippet =
      "Minidump generated - Hard Crash (Segmentation Fault / Access Violation)";
    return result;
  }

  let handle = null;
  try {
    // Only read the last few KB of the file if it's large, or read entirely if small
    const stat = await fs.promises.stat(log.path);
    const MAX_BYTES = 50 * 1024; // 50kb
    let startPos = stat.size > MAX_BYTES ? stat.size - MAX_BYTES : 0;

    handle = await fs.promises.open(log.path, "r");

    // Find safe UTF-8 boundary: align to next newline after startPos to avoid splitting multi-byte chars
    if (startPos > 0) {
      const probeBuf = Buffer.alloc(Math.min(stat.size - startPos, 256));
      await handle.read(probeBuf, 0, probeBuf.length, startPos);
      const newlineOffset = probeBuf.indexOf(10); // 10 = '\n'
      if (newlineOffset !== -1) {
        startPos += newlineOffset + 1;
      }
    }

    const readSize = Math.min(MAX_BYTES, stat.size - startPos);
    const buffer = Buffer.alloc(readSize);
    await handle.read(buffer, 0, buffer.length, startPos);

    // Also read first 1KB to get start time if file is large
    const startBuffer = Buffer.alloc(Math.min(stat.size, 1024));
    await handle.read(startBuffer, 0, startBuffer.length, 0);

    if (handle) {
      await handle.close();
      handle = null;
    }

    // Calculate playtime if possible
    const timeRegex = /^(\d{2}:\d{2}:\d{2})/;
    let startTimeStr = null;
    const startLines = startBuffer.toString("utf8").split("\n");
    for (const l of startLines) {
      const m = l.trim().match(timeRegex);
      if (m) {
        startTimeStr = m[1];
        break;
      }
    }

    const content = buffer.toString("utf8").split("\n");

    let endTimeStr = null;
    for (let i = content.length - 1; i >= 0; i--) {
      const l = content[i].trim();
      const m = l.match(timeRegex);
      if (m && !endTimeStr) {
        endTimeStr = m[1];
      }
    }

    if (startTimeStr && endTimeStr) {
      const parseTime = (str) => {
        const parts = str.split(":");
        return (
          parseInt(parts[0], 10) * 3600 +
          parseInt(parts[1], 10) * 60 +
          parseInt(parts[2], 10)
        );
      };
      let diff = parseTime(endTimeStr) - parseTime(startTimeStr);
      if (diff < 0) diff += 86400; // passed midnight
      result.playtime = `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
    }

    const diagnosticsMap = [
      {
        pattern: /segmentation fault/i,
        status: "CRASH",
        description:
          "The game engine crashed due to a severe memory access violation. Often caused by an incompatible Proton version or broken mod framework.",
        suggestedFix:
          "Try switching to a different Proton version in Settings > Launch Presets. If using custom Proton, revert to Steam Default. Also verify mod compatibility.",
      },
      {
        pattern: /access violation|c0000005/i,
        status: "CRASH",
        description:
          "Memory Access Violation (0xC0000005): Often caused by missing Mod Dependencies, corrupted memory, or a bad Proton prefix.",
        suggestedFix:
          "Force the system allocator in Settings > Performance Tuning (-malloc=system). Increase your maxMem setting. Verify all mod dependencies are installed.",
      },
      {
        pattern: /out of (?:virtual )?memory|bad allocation/i,
        status: "CRASH",
        description:
          "Out of Memory: The engine failed to allocate memory. Try forcing the system allocator (-malloc=system) or increasing your swap file.",
        suggestedFix:
          'Enable "Force System Allocator" in Settings > Performance. Increase maxMem setting (try 32000). Add more swap space: sudo fallocate -l 8G /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile.',
      },
      {
        pattern: /unhandled exception|fatal exception|exception caught/i,
        status: "CRASH",
        description:
          "Unhandled Exception: A fatal error occurred in the engine or scripts. Could point to severe mod errors or corrupted data.",
        suggestedFix:
          'Remove recently added mods and verify game files via Steam. If using Proton, try "Disable Proton Esync" in Settings > Performance.',
      },
      {
        pattern: /missing addon|requires addon/i,
        status: "WARNING",
        description:
          "Missing Dependency: The game attempted to load content from a missing mod. Verify all required mods are installed.",
        suggestedFix:
          'Use the Mod Manager\'s "Check Dependencies" feature to find missing transitive mods. Subscribe to all required mods via the Workshop.',
      },
      {
        pattern: /cannot load texture/i,
        status: "WARNING",
        description:
          "Missing Visual Asset: A mod failed to load a texture. Often harmless but may indicate a corrupted mod download.",
        suggestedFix:
          "Re-subscribe to the affected mod via the Workshop to force a re-download of its assets.",
      },
      {
        pattern: /compile error/i,
        status: "WARNING",
        description:
          "Script Compilation Error: Almost always caused by an outdated mod conflicting with the current DayZ version.",
        suggestedFix:
          'Check the Mod Manager for outdated mods (look for amber "MISMATCH" warnings). Update all outdated mods via the "UPDATE ALL" button.',
      },
      {
        pattern: /failed to initialize/i,
        status: "WARNING",
        description:
          "Initialization Failure: A core component or mod framework failed to start properly.",
        suggestedFix:
          "Verify that Community Framework (CF) and other core mods are installed and up to date. Re-subscribe to the failed framework mod.",
      },
      {
        pattern: /stack overflow|call stack depth/i,
        status: "CRASH",
        description:
          "Stack Overflow: The call stack exceeded its maximum depth. Often a runaway script recursion.",
        suggestedFix:
          "Increase -maxMem in Settings > Launch Presets. Remove recently added mods that may contain buggy script loops.",
      },
      {
        pattern: /proton.*crash|wine.*crash|wine.*fatal/i,
        status: "CRASH",
        description:
          "Proton/Wine Crash: The compatibility layer encountered a fatal error.",
        suggestedFix:
          'Try a different Proton version in Settings > Launch Presets. Enable "Disable Proton Esync" and/or "Disable PROTON_LOG".',
      },
      {
        pattern:
          /d3d.*device.*(?:removed|lost|loss)|d3d.*reset|direct3d.*device.*(?:removed|lost|loss)|direct3d.*reset/i,
        status: "CRASH",
        description:
          "Direct3D Device Removed: Your GPU driver crashed or timed out.",
        suggestedFix:
          'Enable DXVK Async in Settings > Performance. Reduce graphics settings. Update GPU drivers. If using NVIDIA, try "nvidia_drm.modeset=1" kernel parameter.',
      },
      {
        pattern: /vk.*error|vulkan.*fail|vulkan.*device.*lost/i,
        status: "CRASH",
        description:
          "Vulkan Error: A Vulkan API call failed. Could indicate driver issues or incompatible Proton version.",
        suggestedFix:
          "Update GPU drivers to latest version supporting Vulkan. Try Proton Experimental or GE-Proton. Disable MangoHud if enabled.",
      },
      {
        pattern: /sigsegv|sigabrt|sigfpe/i,
        status: "CRASH",
        description:
          "Fatal Signal: The game process was terminated by the operating system (SIGSEGV/SIGABRT).",
        suggestedFix:
          'Usually caused by memory corruption. Enable "Force System Allocator" and increase maxMem. Try different Proton version.',
      },
    ];

    // Look for errors from bottom to top
    let foundIssue = false;
    for (let i = content.length - 1; i >= 0; i--) {
      const line = content[i].trim();
      if (!line) continue;

      const lowerLine = line.toLowerCase();

      if (
        lowerLine.includes("disconnecting from server") ||
        lowerLine.includes("connection lost")
      ) {
        result.connectionDrops++;
      }

      if (!foundIssue) {
        for (const diag of diagnosticsMap) {
          if (diag.pattern.test(lowerLine)) {
            if (diag.status === "CRASH") {
              result.status = "CRASH";
              result.snippet =
                line.length > 150 ? line.substring(0, 147) + "..." : line;
              result.description = diag.description;
              result.suggestedFix = diag.suggestedFix || "";
              foundIssue = true;
              break;
            } else if (result.status !== "CRASH") {
              result.status = "WARNING";
              if (!result.snippet) {
                result.snippet =
                  line.length > 150 ? line.substring(0, 147) + "..." : line;
                result.description = diag.description;
                result.suggestedFix = diag.suggestedFix || "";
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.error(`Failed to analyze log ${log.name}`, e);
    result.snippet = "Failed to read log file.";
  } finally {
    if (handle) {
      await handle.close();
    }
  }

  return result;
}

/**
 * Aggregates high-level telemetry and health metrics from all recently stored game logs.
 *
 * @remarks
 * Calculates total playtime, crash frequency, and connection drops by parsing timestamps and statuses
 * across the latest logs. Useful for generating a "System Health" or "Session History" overview.
 *
 * @returns {Promise<Object>} An object summarizing playtime, crash counts, and average session length.
 */
async function getSessionSummary() {
  const logs = await getRecentLogs();
  if (!logs || logs.length === 0) {
    return {
      totalSessions: 0,
      totalPlaytime: "0h 0m",
      totalCrashes: 0,
      totalWarnings: 0,
      totalDrops: 0,
      averageSessionLength: "0m",
      newestLog: null,
    };
  }

  let totalPlaytimeSeconds = 0;
  let totalCrashes = 0;
  let totalWarnings = 0;
  let totalDrops = 0;
  let newestLog = null;
  let sessionsWithTime = 0;

  for (const log of logs) {
    if (log.status === "CRASH") totalCrashes++;
    if (log.status === "WARNING") totalWarnings++;
    totalDrops += log.connectionDrops || 0;

    if (log.playtime && log.playtime !== "0m") {
      const hMatch = log.playtime.match(/(\d+)h/);
      const mMatch = log.playtime.match(/(\d+)m(?!\s*h)/);
      const hours = hMatch ? parseInt(hMatch[1]) : 0;
      const mins = mMatch ? parseInt(mMatch[1]) : 0;
      totalPlaytimeSeconds += hours * 3600 + mins * 60;
      sessionsWithTime++;
    }

    if (!newestLog || log.mtime > newestLog.mtime) {
      newestLog = log;
    }
  }

  const avgSeconds =
    sessionsWithTime > 0
      ? Math.round(totalPlaytimeSeconds / sessionsWithTime)
      : 0;
  const avgHours = Math.floor(avgSeconds / 3600);
  const avgMins = Math.floor((avgSeconds % 3600) / 60);

  const totalHours = Math.floor(totalPlaytimeSeconds / 3600);
  const totalMins = Math.floor((totalPlaytimeSeconds % 3600) / 60);

  return {
    totalSessions: logs.length,
    totalPlaytime: `${totalHours}h ${totalMins}m`,
    totalCrashes,
    totalWarnings,
    totalDrops,
    averageSessionLength:
      avgHours > 0 ? `${avgHours}h ${avgMins}m` : `${avgMins}m`,
    newestLog: newestLog
      ? {
          name: newestLog.name,
          date: newestLog.date,
          status: newestLog.status,
        }
      : null,
  };
}

module.exports = {
  getRecentLogs,
  getSessionSummary,
};
