const path = require("path");
const os = require("os");

describe("launchProton", () => {
  let mockAccess;
  let mockStat;
  let mockReaddir;
  let mockWriteFile;
  let mockExecFile;
  let mockLockAndDelay;
  let mockBuildEnvironment;
  let mockConfigureDxvk;
  let launchProton;

  const home = os.homedir();
  const compatToolsDir = path.join(
    home,
    ".local",
    "share",
    "Steam",
    "compatibilitytools.d",
  );
  const compatToolsDirAlt = path.join(
    home,
    ".steam",
    "steam",
    "compatibilitytools.d",
  );

  const settings = {
    protonPath: "/protons/GE-Proton/proton",
    modDirectory: "/home/u/.steam/steam/steamapps/workshop/content/221100",
    launchParams: "",
    enableGameMode: false,
    mangoHudEnabled: false,
  };
  const steamappsPath = "/home/u/.steam/steam/steamapps";
  const dayzExe = path.join(steamappsPath, "common", "DayZ", "DayZ_x64.exe");
  const compatDataPath = path.join(steamappsPath, "compatdata", "221100");
  const appidFile = path.join(
    steamappsPath,
    "common",
    "DayZ",
    "steam_appid.txt",
  );

  // Fake child process: fires "spawn" (or "error" when spawnError given) on next tick.
  function makeChild(spawnError = null) {
    return {
      once: jest.fn((event, cb) => {
        if (event === "spawn" && !spawnError) process.nextTick(cb);
        if (event === "error" && spawnError) {
          process.nextTick(() => cb(spawnError));
        }
      }),
    };
  }

  // fs.access impl where only the Proton exe and DayZ exe exist
  function launchPathsExist(p) {
    if (p === settings.protonPath || p === dayzExe) return Promise.resolve();
    return Promise.reject(new Error("ENOENT"));
  }

  beforeEach(() => {
    jest.resetModules();

    mockAccess = jest.fn().mockRejectedValue(new Error("ENOENT"));
    mockStat = jest.fn().mockResolvedValue({ isDirectory: () => true });
    mockReaddir = jest.fn();
    mockWriteFile = jest.fn().mockResolvedValue();
    mockExecFile = jest.fn().mockImplementation(() => makeChild());
    mockLockAndDelay = jest.fn().mockResolvedValue();
    mockBuildEnvironment = jest.fn().mockResolvedValue({ MOCK_ENV: "1" });
    mockConfigureDxvk = jest.fn().mockResolvedValue();

    jest.doMock("fs", () => ({
      promises: {
        access: mockAccess,
        stat: mockStat,
        readdir: mockReaddir,
        writeFile: mockWriteFile,
      },
    }));
    jest.doMock("child_process", () => ({ execFile: mockExecFile }));
    jest.doMock("../../src/main/steamworksManager", () => ({
      lockAndDelayForLaunch: mockLockAndDelay,
    }));
    jest.doMock("../../src/main/game/prepareEnv", () => ({
      buildEnvironment: mockBuildEnvironment,
    }));
    jest.doMock("../../src/main/game/configDxvk", () => ({
      configureDxvk: mockConfigureDxvk,
    }));

    launchProton = require("../../src/main/game/launchProton");
    launchProton._clearCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("scanProtonVersions", () => {
    test("returns empty array when no search paths exist", async () => {
      const versions = await launchProton.scanProtonVersions();

      expect(versions).toEqual([]);
      expect(mockReaddir).not.toHaveBeenCalled();
    });

    test("finds Proton builds in compatibilitytools.d", async () => {
      const protonExe = path.join(compatToolsDir, "GE-Proton-9-5", "proton");
      mockAccess.mockImplementation((p) => {
        if (p === compatToolsDir || p === protonExe) return Promise.resolve();
        return Promise.reject(new Error("ENOENT"));
      });
      mockReaddir.mockResolvedValue(["GE-Proton-9-5", "SteamTinkerLaunch"]);

      const versions = await launchProton.scanProtonVersions();

      expect(versions).toEqual([{ name: "GE-Proton-9-5", path: protonExe }]);
    });

    test("matches the proton name case-insensitively", async () => {
      const protonExe = path.join(compatToolsDir, "PROTON Experimental", "proton");
      mockAccess.mockImplementation((p) => {
        if (p === compatToolsDir || p === protonExe) return Promise.resolve();
        return Promise.reject(new Error("ENOENT"));
      });
      mockReaddir.mockResolvedValue(["PROTON Experimental"]);

      const versions = await launchProton.scanProtonVersions();

      expect(versions).toEqual([
        { name: "PROTON Experimental", path: protonExe },
      ]);
    });

    test("skips entries without a proton executable", async () => {
      mockAccess.mockImplementation((p) => {
        if (p === compatToolsDir) return Promise.resolve();
        return Promise.reject(new Error("ENOENT")); // proton exe missing
      });
      mockReaddir.mockResolvedValue(["GE-Proton-Broken"]);

      expect(await launchProton.scanProtonVersions()).toEqual([]);
    });

    test("skips entries that are not directories", async () => {
      mockAccess.mockImplementation((p) => {
        if (p === compatToolsDir) return Promise.resolve();
        return Promise.reject(new Error("ENOENT"));
      });
      mockReaddir.mockResolvedValue(["proton-readme.txt"]);
      mockStat.mockResolvedValue({ isDirectory: () => false });

      expect(await launchProton.scanProtonVersions()).toEqual([]);
    });

    test("deduplicates versions by name across search paths", async () => {
      const exeA = path.join(compatToolsDir, "GE-Proton-9-5", "proton");
      mockAccess.mockImplementation((p) => {
        if (p === compatToolsDir || p === compatToolsDirAlt || p === exeA) {
          return Promise.resolve();
        }
        return Promise.reject(new Error("ENOENT"));
      });
      mockReaddir.mockResolvedValue(["GE-Proton-9-5"]);

      const versions = await launchProton.scanProtonVersions();

      expect(versions).toHaveLength(1);
      expect(versions[0].name).toBe("GE-Proton-9-5");
    });

    test("caches results across calls", async () => {
      const protonExe = path.join(compatToolsDir, "GE-Proton-9-5", "proton");
      mockAccess.mockImplementation((p) => {
        if (p === compatToolsDir || p === protonExe) return Promise.resolve();
        return Promise.reject(new Error("ENOENT"));
      });
      mockReaddir.mockResolvedValue(["GE-Proton-9-5"]);

      const first = await launchProton.scanProtonVersions();
      const second = await launchProton.scanProtonVersions();

      expect(second).toEqual(first);
      expect(mockReaddir).toHaveBeenCalledTimes(1);
    });

    test("tolerates readdir failures and continues", async () => {
      mockAccess.mockImplementation((p) => {
        if (p === compatToolsDir) return Promise.resolve();
        return Promise.reject(new Error("ENOENT"));
      });
      mockReaddir.mockRejectedValue(new Error("EACCES"));
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const versions = await launchProton.scanProtonVersions();

      expect(versions).toEqual([]);
      expect(errorSpy).toHaveBeenCalled();
    });
  });


  describe("launchViaProton", () => {
    test("throws when no Proton path is configured", async () => {
      await expect(
        launchProton.launchViaProton([], { ...settings, protonPath: "" }, jest.fn()),
      ).rejects.toThrow("No Proton path configured");
      await expect(
        launchProton.launchViaProton([], { ...settings, protonPath: 42 }, jest.fn()),
      ).rejects.toThrow("No Proton path configured");
    });

    test("throws when the Proton executable is missing", async () => {
      mockAccess.mockRejectedValue(new Error("ENOENT"));

      await expect(
        launchProton.launchViaProton([], settings, jest.fn()),
      ).rejects.toThrow("Proton executable not found");
    });

    test("throws when DayZ_x64.exe cannot be found", async () => {
      mockAccess.mockImplementation((p) => {
        if (p === settings.protonPath) return Promise.resolve();
        return Promise.reject(new Error("ENOENT"));
      });

      await expect(
        launchProton.launchViaProton([], settings, jest.fn()),
      ).rejects.toThrow("Cannot find DayZ_x64.exe");
    });

    test("launches directly with Proton and prepares env, dxvk and appid file", async () => {
      mockAccess.mockImplementation(launchPathsExist);
      const handleGameExit = jest.fn();
      const args = ["-connect", "1.2.3.4"];

      await launchProton.launchViaProton(args, settings, handleGameExit);

      expect(mockWriteFile).toHaveBeenCalledWith(appidFile, "221100", "utf8");
      expect(mockBuildEnvironment).toHaveBeenCalledWith(
        settings,
        compatDataPath,
      );
      expect(mockConfigureDxvk).toHaveBeenCalledWith(
        settings,
        compatDataPath,
        { MOCK_ENV: "1" },
      );
      expect(mockExecFile).toHaveBeenCalledWith(
        settings.protonPath,
        ["waitforexitandrun", dayzExe, "-connect", "1.2.3.4"],
        { env: { MOCK_ENV: "1" } },
        expect.any(Function),
      );
      expect(mockLockAndDelay).toHaveBeenCalled();
      // Steam singleton lock must happen before the process is spawned
      expect(mockLockAndDelay.mock.invocationCallOrder[0]).toBeLessThan(
        mockExecFile.mock.invocationCallOrder[0],
      );
    });

    test("prefixes with gamemoderun and mangohud when enabled", async () => {
      mockAccess.mockImplementation(launchPathsExist);
      const wrappedSettings = {
        ...settings,
        enableGameMode: true,
        mangoHudEnabled: true,
      };

      await launchProton.launchViaProton([], wrappedSettings, jest.fn());

      const [cmd, args] = mockExecFile.mock.calls[0];
      expect(cmd).toBe("gamemoderun");
      expect(args[0]).toBe("mangohud");
      expect(args[1]).toBe(settings.protonPath);
      expect(args[2]).toBe("waitforexitandrun");
    });

    test("expands the %command% placeholder in launch params", async () => {
      mockAccess.mockImplementation(launchPathsExist);
      const expandedSettings = {
        ...settings,
        launchParams: "gamemoderun %command%",
      };

      await launchProton.launchViaProton(
        ["-connect", "1.2.3.4"],
        expandedSettings,
        jest.fn(),
      );

      const [cmd, args] = mockExecFile.mock.calls[0];
      expect(cmd).toBe("gamemoderun");
      expect(args).toEqual([
        settings.protonPath,
        "waitforexitandrun",
        dayzExe,
        "-connect",
        "1.2.3.4",
      ]);
      expect(args.some((a) => a.includes("%command%"))).toBe(false);
    });


    test("expands tokens with %command% embedded in them", async () => {
      mockAccess.mockImplementation(launchPathsExist);
      const expandedSettings = {
        ...settings,
        launchParams: "env --exec=%command%",
      };

      await launchProton.launchViaProton([], expandedSettings, jest.fn());

      const [cmd, args] = mockExecFile.mock.calls[0];
      expect(cmd).toBe("env");
      // Embedded expansion quotes each substituted arg; quotes inside the
      // token are kept as-is, standalone quoted args are unwrapped.
      expect(args[0]).toBe(`--exec="${settings.protonPath}"`);
      expect(args[1]).toBe("waitforexitandrun");
      expect(args[2]).toBe(dayzExe);
      expect(args.some((a) => a.includes("%command%"))).toBe(false);
    });

    test("rejects when the child process fails to spawn", async () => {
      mockAccess.mockImplementation(launchPathsExist);
      mockExecFile.mockImplementation(() =>
        makeChild(new Error("spawn failed")),
      );

      await expect(
        launchProton.launchViaProton([], settings, jest.fn()),
      ).rejects.toThrow("spawn failed");
    });

    test("reports non-zero exit through handleGameExit", async () => {
      mockAccess.mockImplementation(launchPathsExist);
      let exitCallback;
      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        exitCallback = cb;
        return makeChild();
      });
      const handleGameExit = jest.fn();

      await launchProton.launchViaProton([], settings, handleGameExit);
      const exitError = new Error("exit code 1");
      exitCallback(exitError, "", "some stderr");

      expect(handleGameExit).toHaveBeenCalledWith(exitError);
    });

    test("does not call handleGameExit on a clean exit", async () => {
      mockAccess.mockImplementation(launchPathsExist);
      let exitCallback;
      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        exitCallback = cb;
        return makeChild();
      });
      const handleGameExit = jest.fn();

      await launchProton.launchViaProton([], settings, handleGameExit);
      exitCallback(null, "", "");

      expect(handleGameExit).not.toHaveBeenCalled();
    });

    test("tolerates steam_appid.txt write failures and still launches", async () => {
      mockAccess.mockImplementation(launchPathsExist);
      mockWriteFile.mockRejectedValue(new Error("EACCES"));
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        launchProton.launchViaProton([], settings, jest.fn()),
      ).resolves.toBeUndefined();

      expect(mockExecFile).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});

