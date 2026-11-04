const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { existsAsync } = require("../fileUtils");
const { configureDxvk } = require("./configDxvk");
const { buildEnvironment, parseLaunchTokens, LAUNCH_ENV_ASSIGNMENT } = require("./prepareEnv");
const { spawnWithLaunchLock } = require("./processExit");
const steamPaths = require("../steamPaths");

let cachedProtonVersions = null;

async function scanProtonVersions(refresh = false) {
  if (refresh) cachedProtonVersions = null;
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
      "compatibilitytools.d",
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
      "common",
    ),
    "/usr/share/steam/compatibilitytools.d",
    ...(await steamPaths.getSteamLibraryPathsAsync()).map(
      library => path.join(library, "steamapps", "common"),
    ),
  ];

  for (const sp of new Set(searchPaths)) {
    const exists = await fs.promises
      .access(sp)
      .then(() => true)
      .catch(() => false);
    if (!exists) continue;
    try {
      const items = await fs.promises.readdir(sp);
      for (const item of items) {
        if (item.toLowerCase().includes("proton")) {
          const fullPath = path.join(sp, item);
          const stat = await fs.promises.stat(fullPath);
          if (stat.isDirectory()) {
            const protonExe = path.join(fullPath, "proton");
            const exeExists = await fs.promises
              .access(protonExe)
              .then(() => true)
              .catch(() => false);
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

async function launchViaProton(args, settings, handleGameExit, assertCurrent = () => {}) {
  if (!settings.protonPath || typeof settings.protonPath !== "string") {
    throw new Error(
      "No Proton path configured. Set a custom Proton version in Settings.",
    );
  }

  console.log(`Launching DayZ via custom Proton: ${settings.protonPath}`);


  if (!(await existsAsync(settings.protonPath))) {
    throw new Error(`Proton executable not found at: ${settings.protonPath}`);
  }

  const steamappsPath = await steamPaths.findDayzSteamappsFolderAsync(
    settings.modDirectory,
  );

  const compatDataPath = steamappsPath
    ? path.join(steamappsPath, "compatdata", "221100")
    : "";
  const dayzExe = steamappsPath
    ? path.join(steamappsPath, "common", "DayZ", "DayZ_x64.exe")
    : "";

  if (!(await existsAsync(dayzExe))) {
    throw new Error(
      "Cannot find DayZ_x64.exe for direct Proton launch. Ensure your Steam library and Workshop mod paths are correct.",
    );
  }

  const appidFile = path.join(
    steamappsPath,
    "common",
    "DayZ",
    "steam_appid.txt",
  );
  try {
    await fs.promises.writeFile(appidFile, "221100", "utf8");
  } catch (e) {
    console.error("Failed to write steam_appid.txt", e);
  }

  const env = await buildEnvironment(settings, compatDataPath);
  await configureDxvk(settings, compatDataPath, env);

  const prefix = [];
  const launchParamsStr = settings.launchParams || "";
  const hasGameMode = /\bgamemoderun\b/.test(launchParamsStr);
  const hasMangoHud = /\bmangohud\b/.test(launchParamsStr);

  if (settings.enableGameMode && !hasGameMode) {
    prefix.push("gamemoderun");
  }
  if (settings.mangoHudEnabled && !hasMangoHud) {
    prefix.push("mangohud");
  }

  const protonArgs = ["waitforexitandrun", dayzExe, ...args];
  const launchArgs = [...prefix, settings.protonPath, ...protonArgs];
  let commandLine = launchArgs;

  if (settings.launchParams && settings.launchParams.includes("%command%")) {
    // Parse custom launch parameters with %command% replacement
    const parsedParams = parseLaunchTokens(settings.launchParams);

    const execArgs = [];
    let seenCommand = false;
    for (const token of parsedParams) {
      if (token === "%command%") {
        execArgs.push(...launchArgs);
        seenCommand = true;
      } else if (token.includes("%command%")) {
        const expandedToken = token.replace(
          "%command%",
          launchArgs.map((a) => `"${a}"`).join(" "),
        );
        execArgs.push(...parseLaunchTokens(expandedToken));
        seenCommand = true;
      } else {
        if (seenCommand && launchArgs.includes(token)) {
          continue;
        }
        execArgs.push(token);
      }
    }

    while (execArgs.length > 0 && LAUNCH_ENV_ASSIGNMENT.test(execArgs[0])) {
      const match = execArgs[0].match(LAUNCH_ENV_ASSIGNMENT);
      env[match[1]] = match[2];
      execArgs.shift();
    }

    if (execArgs.length === 0) {
      execArgs.push(...launchArgs);
    }

    console.log("Executing via spawn with %command% expansion");
    commandLine = execArgs;
  } else {
    console.log(`Executing: ${launchArgs.join(" ")}`);
  }

  return spawnWithLaunchLock({
    command: commandLine[0],
    args: commandLine.slice(1),
    options: { env, stdio: "ignore" },
    label: "Proton",
    handleGameExit,
    assertCurrent,
  });
}

module.exports = {
  scanProtonVersions,
  launchViaProton,
  _clearCache: () => {
    cachedProtonVersions = null;
  },
};
