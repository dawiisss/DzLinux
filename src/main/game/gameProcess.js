const fs = require("node:fs");

const GAME_EXECUTABLES = new Set(["dayz_x64.exe", "dayz_be.exe"]);
const POLL_INTERVAL_MS = 3000;
// Long enough for a cold Steam start. If the game never shows up (Steam
// update, a dialog, or a sandbox that hides other processes), stop waiting so
// the Steamworks worker is not disabled indefinitely.
const GAME_START_TIMEOUT_MS = 3 * 60 * 1000;

// Compares whole arguments, so a shell or editor that merely mentions the game
// in a longer string does not count. Arguments may be Unix or Wine paths.
function isGameCommandLine(cmdline) {
  return cmdline
    .split("\0")
    .some((arg) => GAME_EXECUTABLES.has(arg.split(/[\\/]/).pop().toLowerCase()));
}

async function isGameRunning(procDir = "/proc") {
  const entries = await fs.promises.readdir(procDir);
  const pids = entries.filter((entry) => /^\d+$/.test(entry));
  const matches = await Promise.all(
    pids.map(async (pid) => {
      try {
        const cmdline = await fs.promises.readFile(`${procDir}/${pid}/cmdline`, "latin1");
        return isGameCommandLine(cmdline);
      } catch {
        return false; // The process exited or is not readable.
      }
    }),
  );
  return matches.includes(true);
}

/**
 * Calls `onEnded` once the game has started and exited, or once it has failed
 * to appear within the start timeout. The `steam` command cannot be used for
 * this: it exits immediately when forwarding to a running client, and otherwise
 * lives as long as the client does.
 */
function waitForGameEnd(onEnded, {
  procDir = "/proc",
  pollIntervalMs = POLL_INTERVAL_MS,
  startTimeoutMs = GAME_START_TIMEOUT_MS,
} = {}) {
  const deadline = Date.now() + startTimeoutMs;
  let seen = false;

  const poll = async () => {
    let running = false;
    try {
      running = await isGameRunning(procDir);
    } catch {
      seen = true; // Process list unavailable: nothing more can be learned.
    }
    if (running) seen = true;
    if (!running && (seen || Date.now() >= deadline)) {
      onEnded();
      return;
    }
    setTimeout(poll, pollIntervalMs).unref();
  };

  setTimeout(poll, pollIntervalMs).unref();
}

module.exports = {
  isGameRunning,
  waitForGameEnd,
};
