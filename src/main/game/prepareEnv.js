const path = require("node:path");
const { execFile } = require("node:child_process");
const steamPaths = require("../steamPaths");
const { normalizeModId, normalizeMaxMem } = require("../validation");

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
  if (!Array.isArray(mods)) {
    throw new Error("Invalid mod IDs");
  }
  if (mods.length === 0) return "";
  const normalizedIds = mods.map((m) => {
    const id = normalizeModId(m);
    if (id === null) {
      throw new Error("Invalid mod IDs");
    }
    return id;
  });
  const modDir =
    settings && typeof settings.modDirectory === "string"
      ? settings.modDirectory.trim()
      : "";
  if (!modDir) {
    throw new Error(
      "Workshop mod directory is not configured. Please set the Workshop path in Settings.",
    );
  }
  return normalizedIds
    .map((id) => {
      let p = path.join(modDir, id);
      if (p.startsWith("/")) {
        p = "Z:" + p.replace(/\//g, "\\");
      }
      return p;
    })
    .join(";");
}

async function buildEnvironment(settings, compatDataPath) {
  const clientInstallPath = await steamPaths.getSteamInstallPathAsync();
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

  if (settings.nativeWayland) {
    env.PROTON_ENABLE_WAYLAND = "1";
  }

  if (settings.mangoHudEnabled) {
    env.MANGOHUD = "1";
    if (settings.mangoHudConfig) {
      env.MANGOHUD_CONFIG = settings.mangoHudConfig;
    }
  }

  return env;
}

function buildExtraParams(settings) {
  if (!settings || typeof settings !== "object") return [];
  let extraParams = [];

  if (typeof settings.launchParams === "string" && settings.launchParams) {
    const rawTokens = (
      settings.launchParams.match(/(?:[^\s"]+|"[^"]*")+/g) || []
    ).map((p) => {
      if (p.startsWith('"') && p.endsWith('"'))
        return p.substring(1, p.length - 1);
      return p;
    });

    if (!settings.launchParams.includes("%command%")) {
      extraParams = rawTokens;
    } else {
      const cmdIndex = rawTokens.findIndex((t) => t.includes("%command%"));
      if (cmdIndex !== -1) {
        extraParams = rawTokens
          .slice(cmdIndex + 1)
          .filter((t) => t.startsWith("-"));
      }
    }
  }

  if (settings.mallocSystem) {
    extraParams.push("-malloc=system");
  }
  const maxMem = normalizeMaxMem(settings.maxMem);
  if (maxMem !== "") {
    extraParams.push(`-maxMem=${sanitizeArg(maxMem)}`);
  }
  if (
    typeof settings.playerName === "string" &&
    settings.playerName.trim() !== ""
  ) {
    extraParams.push(`-name=${sanitizeArg(settings.playerName.trim())}`);
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
