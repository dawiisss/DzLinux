const { execFile } = require("child_process");
const steamworksManager = require("../steamworksManager");
const { sanitizeArg } = require("./prepareEnv");

const STEAMWORKS_LAUNCH_LOCK_MS = 1500;
const STEAMWORKS_LAUNCH_TIMEOUT_MS = 15000;

async function launchViaSteam(ip, port, modString, extraParams, handleGameExit) {
  const steamArgs = ["-applaunch", "221100", "-noLauncher"];
  if (ip) {
    steamArgs.push(
      `-connect=${sanitizeArg(ip)}`,
      `-port=${sanitizeArg(port.toString())}`
    );
  }
  if (modString) {
    steamArgs.push(`-mod=${sanitizeArg(modString)}`);
  }
  steamArgs.push(...extraParams);

  console.log(`Launching DayZ via steam with args: ${steamArgs.join(" ")}`);

  await steamworksManager.lockForLaunch();
  await new Promise((r) => setTimeout(r, STEAMWORKS_LAUNCH_LOCK_MS));

  setTimeout(() => {
    steamworksManager.unlockForLaunch();
  }, STEAMWORKS_LAUNCH_TIMEOUT_MS);

  execFile("steam", steamArgs, (error, _stdout, _stderr) => {
    if (error) {
      console.error(`Error launching game: ${error.message}`);
      handleGameExit(error);
      return;
    }
    console.log("Game launched successfully.");
  });
}

module.exports = {
  launchViaSteam,
};
