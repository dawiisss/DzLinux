const path = require("path");
const { execFile } = require("child_process");
const steamPaths = require("../steamPaths");

function sanitizeArg(arg) {
  return String(arg).replace(/"/g, "");
}

function checkGameMode() {
  return new Promise((resolve) => {
    execFile("gamemoded", ["-t"], (error, _stdout) => {
      if (error) {
        execFile("which", ["gamemoderun"], (err2, stdout2) => {
          resolve(!err2 && stdout2.trim().length > 0);
        });
      } else {
        resolve(true);
      }
    });
  });
}

function buildModString(settings, mods) {
  if (!mods) return "";
  return mods
    .map((m) => {
      let p = path.join(settings.modDirectory, m.id);
      if (p.startsWith("/")) {
        p = "Z:" + p.replace(/\//g, "\\");
      }
      return p;
    })
    .join(";");
}

function buildEnvironment(settings, compatDataPath) {
  const clientInstallPath = steamPaths.getSteamInstallPath();
  const env = Object.assign({}, process.env, {
    STEAM_COMPAT_DATA_PATH: compatDataPath,
    STEAM_COMPAT_CLIENT_INSTALL_PATH: clientInstallPath,
    SteamAppId: "221100",
    SteamGameId: "221100",
  });

  if (settings.mallocTrim) {
    env.MALLOC_TRIM_THRESHOLD_ = "0";
  }

  if (settings.noEsync) {
    env.PROTON_NO_ESYNC = "1";
  }

  if (settings.disableProtonLogs) {
    env.PROTON_LOG = "0";
  }

  return env;
}

function buildExtraParams(settings) {
  let extraParams = [];

  if (settings.launchParams) {
    if (!settings.launchParams.includes("%command%")) {
      extraParams = (
        settings.launchParams.match(/(?:[^\s"]+|"[^"]*")+/g) || []
      ).map((p) => {
        if (p.startsWith('"') && p.endsWith('"'))
          return p.substring(1, p.length - 1);
        return p;
      });
    }
  }

  if (settings.mallocSystem) {
    extraParams.push("-malloc=system");
  }
  if (settings.maxMem && settings.maxMem.trim() !== "") {
    extraParams.push(`-maxMem=${sanitizeArg(settings.maxMem.trim())}`);
  }

  return extraParams;
}

module.exports = {
  sanitizeArg,
  checkGameMode,
  buildModString,
  buildEnvironment,
  buildExtraParams,
};
