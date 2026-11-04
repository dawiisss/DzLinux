const { spawn } = require("node:child_process");
const steamworksManager = require("../steamworksManager");

// Signals that mean the process was asked to stop rather than crashing.
const SHUTDOWN_SIGNALS = new Set(["SIGTERM", "SIGINT", "SIGHUP"]);

function exitError(code, signal) {
  if (code !== 0 && code !== null) {
    const error = new Error(`Process exited with code ${code}`);
    error.code = code;
    return error;
  }
  if (signal && !SHUTDOWN_SIGNALS.has(signal)) {
    const error = new Error(`Process was killed by ${signal}`);
    error.code = signal;
    return error;
  }
  return null;
}

/**
 * Resolves once the child has spawned and releases the Steamworks launch lock
 * exactly once, whether the child fails to spawn, exits, or both events fire.
 *
 * By default the lock is held until the child exits. Pass `holdLock` when the
 * child's lifetime is not the game's: it receives the release function once
 * the child has spawned.
 */
function watchLaunchedProcess(child, label, handleGameExit, { holdLock } = {}) {
  const startedAt = Date.now();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    steamworksManager.unlockForLaunch();
  };

  return new Promise((resolve, reject) => {
    child.once("spawn", () => {
      if (holdLock) holdLock(release);
      resolve();
    });
    child.once("error", (err) => {
      release();
      reject(err);
    });
    child.once("exit", (code, signal) => {
      if (!holdLock) release();
      const error = exitError(code, signal);
      if (error) {
        error.startedAt = startedAt;
        console.log(`${label} process ended abnormally: ${error.message}`);
        handleGameExit(error);
      } else {
        console.log(`${label} process exited cleanly.`);
      }
    });
  });
}

/**
 * Takes the Steamworks launch lock, then spawns and watches the process. The
 * lock is released if the launch is cancelled or the spawn fails at any stage.
 */
async function spawnWithLaunchLock({
  command,
  args,
  options,
  label,
  handleGameExit,
  assertCurrent = () => {},
  holdLock,
}) {
  await steamworksManager.lockAndDelayForLaunch();

  let child;
  try {
    assertCurrent();
    // spawn() throws synchronously for an empty command or a NUL byte.
    child = spawn(command, args, options);
  } catch (error) {
    steamworksManager.unlockForLaunch();
    throw error;
  }

  if (options && options.detached) child.unref();
  return watchLaunchedProcess(child, label, handleGameExit, { holdLock });
}

module.exports = {
  exitError,
  spawnWithLaunchLock,
  watchLaunchedProcess,
};
