const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const steamworksManager = require("../steamworksManager");
const { configureDxvk } = require("./configDxvk");
const { configureMangoHud } = require("./configMangohud");
const { buildEnvironment } = require("./prepareEnv");

let cachedProtonVersions = null;

async function scanProtonVersions() {
  if (cachedProtonVersions !== null) {
    return [...cachedProtonVersions];
  }
  const versions = [];
  const searchPaths = [
    path.join(os.homedir(), ".local", "share", "Steam", "compatibilitytools.d"),
    path.join(os.homedir(), ".steam", "steam", "compatibilitytools.d"),
    path.join(os.homedir(), ".local", "share", "Steam", "steamapps", "common"),
    path.join(os.homedir(), ".steam", "steam", "steamapps", "common"),
    path.join(
      os.homedir(),
      ".var",
      "app",
      "com.valvesoftware.Steam",
      ".local",
      "share",
      "Steam",
      "compatibilitytools.d"
    ),
    path.join(
      os.homedir(),
      ".var",
      "app",
      "com.valvesoftware.Steam",
      ".local",
      "share",
      "Steam",
      "steamapps",
      "common"
    ),
  ];

  for (const sp of searchPaths) {
    const exists = await fs.promises.access(sp).then(() => true).catch(() => false);
    if (!exists) continue;
    try {
      const items = await fs.promises.readdir(sp);
      for (const item of items) {
        if (item.toLowerCase().includes("proton")) {
          const fullPath = path.join(sp, item);
          const stat = await fs.promises.stat(fullPath);
          if (stat.isDirectory()) {
            const protonExe = path.join(fullPath, "proton");
            const exeExists = await fs.promises.access(protonExe).then(() => true).catch(() => false);
            if (exeExists) {
              versions.push({
                name: item,
                path: protonExe,
              });
            }
          }
        }
      }
    } catch (e) {
      console.error(`Failed to scan ${sp}`, e);
    }
  }

  const unique = [];
  const names = new Set();
  for (const v of versions) {
    if (!names.has(v.name)) {
      names.add(v.name);
      unique.push(v);
    }
  }

  cachedProtonVersions = unique;
  return unique;
}

async function launchViaProton(args, settings, handleGameExit) {
  console.log(`Launching DayZ via custom Proton: ${settings.protonPath}`);

  const existsAsync = async (p) =>
    fs.promises
      .access(p)
      .then(() => true)
      .catch(() => false);

  let steamappsPath = "";
  if (settings.modDirectory && settings.modDirectory.includes("steamapps")) {
    steamappsPath = settings.modDirectory.split("steamapps")[0] + "steamapps";
  }

  const compatDataPath = steamappsPath
    ? path.join(steamappsPath, "compatdata", "221100")
    : "";
  const dayzExe = steamappsPath
    ? path.join(steamappsPath, "common", "DayZ", "DayZ_x64.exe")
    : "";

  if (!(await existsAsync(dayzExe))) {
    console.error(
      "Cannot find DayZ_x64.exe for direct Proton launch. Ensure workshop mod path is correct."
    );
    return;
  }

  const appidFile = path.join(
    steamappsPath,
    "common",
    "DayZ",
    "steam_appid.txt"
  );
  try {
    await fs.promises.writeFile(appidFile, "221100", "utf8");
  } catch (e) {
    console.error("Failed to write steam_appid.txt", e);
  }

  const env = buildEnvironment(settings, compatDataPath);

  await configureDxvk(settings, compatDataPath, env);

  const { restoreMangoConfig } = await configureMangoHud(settings);

  const protonArgs = ["waitforexitandrun", dayzExe, ...args];
  const launchArgs = [settings.protonPath, ...protonArgs];

  if (settings.launchParams && settings.launchParams.includes("%command%")) {
    const parsedParams = (
      settings.launchParams.match(/(?:[^\s"]+|"[^"]*")+/g) || []
    ).map((p) => {
      if (p.startsWith('"') && p.endsWith('"')) {
        return p.slice(1, -1);
      }
      return p;
    });

    const execArgs = [];
    for (const token of parsedParams) {
      if (token === "%command%") {
        execArgs.push(...launchArgs);
      } else if (token.includes("%command%")) {
        const expandedToken = token.replace(
          "%command%",
          launchArgs.map((a) => `"${a}"`).join(" ")
        );
        execArgs.push(
          ...(expandedToken.match(/(?:[^\s"]+|"[^"]*")+/g) || []).map((p) => {
            if (p.startsWith('"') && p.endsWith('"')) {
              return p.slice(1, -1);
            }
            return p;
          })
        );
      } else {
        execArgs.push(token);
      }
    }

    console.log("Executing via execFile with %command% expansion");

    await steamworksManager.lockAndDelayForLaunch(restoreMangoConfig);

    const cmd = execArgs[0];
    const argsList = execArgs.slice(1);

    return new Promise((resolve, reject) => {
      const child = execFile(cmd, argsList, { env }, (error, _stdout, stderr) => {
        if (error) {
          console.error(
            `Error launching game via Proton shell: ${error.message}`
          );
          console.error(`stderr: ${stderr}`);
          handleGameExit(error);
        }
        console.log("Game launched successfully via custom Proton shell.");
      });
      child.once('spawn', resolve);
      child.once('error', reject);
    });
  } else {
    const prefix = [];
    if (settings.enableGameMode) prefix.push("gamemoderun");
    if (settings.mangoHudEnabled) prefix.push("mangohud");

    const wrappedArgs = [...prefix, settings.protonPath, ...protonArgs];

    console.log(`Executing: ${wrappedArgs.join(" ")}`);

    await steamworksManager.lockAndDelayForLaunch(restoreMangoConfig);

    return new Promise((resolve, reject) => {
      const child = execFile(
        wrappedArgs[0],
        wrappedArgs.slice(1),
        { env },
        (error, _stdout, stderr) => {
          if (error) {
            console.error(`Error launching game via Proton: ${error.message}`);
            if (stderr) console.error(`stderr: ${stderr}`);
            handleGameExit(error);
          }
          console.log("Game launched successfully via custom Proton.");
        }
      );
      child.once('spawn', resolve);
      child.once('error', reject);
    });
  }
}

module.exports = {
  scanProtonVersions,
  launchViaProton,
  _clearCache: () => {
    cachedProtonVersions = null;
  },
};
