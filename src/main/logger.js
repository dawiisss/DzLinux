const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const LOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const LOG_DIR = path.join(app.getPath("userData"), "logs");
const LOG_FILE = path.join(LOG_DIR, "dzlinux.log");

let logStream = null;

function getTimestamp() {
  return new Date().toISOString();
}

function formatArgs(args) {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a, null, 2);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

/**
 * Prune log entries older than LOG_MAX_AGE_MS.
 * Reads the log file, filters lines by timestamp, and rewrites it.
 */
async function pruneOldEntries() {
  try {
    await fs.promises.access(LOG_FILE);
  } catch {
    return; // File doesn't exist yet
  }

  try {
    const content = await fs.promises.readFile(LOG_FILE, "utf-8");
    const cutoff = Date.now() - LOG_MAX_AGE_MS;
    const lines = content.split("\n");
    const kept = [];
    let lastLineWasKept = false;

    for (const line of lines) {
      if (!line.trim()) continue;
      // Lines are formatted as: [2026-07-03T04:00:00.000Z] [LEVEL] message
      const match = line.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\]/);
      if (match) {
        const ts = new Date(match[1]).getTime();
        if (ts >= cutoff) {
          kept.push(line);
          lastLineWasKept = true;
        } else {
          lastLineWasKept = false;
        }
      } else {
        // Continuation line (stack trace, multi-line output) — keep if parent entry was kept
        if (lastLineWasKept) {
          kept.push(line);
        }
      }
    }

    await fs.promises.writeFile(LOG_FILE, kept.join("\n") + (kept.length ? "\n" : ""), "utf-8");
  } catch (err) {
    // Don't let pruning failures break startup
    process.stderr.write(`[logger] Failed to prune old log entries: ${err.message}\n`);
  }
}

/**
 * Initialize the file logger. Intercepts console.log, console.warn, and console.error
 * and writes timestamped entries to the log file.
 */
async function initLogger() {
  try {
    await fs.promises.mkdir(LOG_DIR, { recursive: true });
  } catch {
    // Directory likely already exists
  }

  await pruneOldEntries();

  logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });

  const originalLog = console.log.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.log = (...args) => {
    originalLog(...args);
    if (logStream) {
      logStream.write(`[${getTimestamp()}] [INFO] ${formatArgs(args)}\n`);
    }
  };

  console.warn = (...args) => {
    originalWarn(...args);
    if (logStream) {
      logStream.write(`[${getTimestamp()}] [WARN] ${formatArgs(args)}\n`);
    }
  };

  console.error = (...args) => {
    originalError(...args);
    if (logStream) {
      logStream.write(`[${getTimestamp()}] [ERROR] ${formatArgs(args)}\n`);
    }
  };

  console.log("Logger initialized, log file:", LOG_FILE);
}

function getLogFilePath() {
  return LOG_FILE;
}

function closeLogger() {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}

module.exports = { initLogger, getLogFilePath, closeLogger };
