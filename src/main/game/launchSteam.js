const { execFile } = require("node:child_process");
const steamworksManager = require("../steamworksManager");
const { sanitizeArg } = require("./prepareEnv");

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

  await steamworksManager.lockAndDelayForLaunch();

  return new Promise((resolve, reject) => {
    const child = execFile("steam", steamArgs, (error, _stdout, _stderr) => {
      if (error) {
        console.error(`Error launching game: ${error.message}`);
        handleGameExit(error);
      } else {
        console.log("Game launched successfully.");
      }
    });
    child.once("spawn", resolve);
    child.once("error", reject);
  });
}

module.exports = {
  launchViaSteam,
};
