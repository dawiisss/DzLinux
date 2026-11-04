const { sanitizeArg } = require("./prepareEnv");
const { waitForGameEnd } = require("./gameProcess");
const { spawnWithLaunchLock } = require("./processExit");

async function launchViaSteam(ip, port, modString, extraParams, handleGameExit, assertCurrent = () => {}) {
  const steamArgs = ["-applaunch", "221100", "-noLauncher"];
  if (ip) {
    const portStr = port !== undefined && port !== null ? String(port) : "2302";
    steamArgs.push(
      `-connect=${sanitizeArg(ip)}`,
      `-port=${sanitizeArg(portStr)}`
    );
  }
  if (modString) {
    steamArgs.push(`-mod=${sanitizeArg(modString)}`);
  }
  steamArgs.push(...extraParams);

  console.log(`Launching DayZ via steam with args: ${steamArgs.join(" ")}`);

  // When Steam is not already running, this process becomes the Steam client
  // itself. Its output is discarded instead of buffered (execFile's maxBuffer
  // would kill the client) and it is detached so it outlives DzLinux. The
  // Steamworks lock follows the game, not this process.
  return spawnWithLaunchLock({
    command: "steam",
    args: steamArgs,
    options: { stdio: "ignore", detached: true },
    label: "Steam",
    handleGameExit,
    assertCurrent,
    holdLock: waitForGameEnd,
  });
}

module.exports = {
  launchViaSteam,
};
