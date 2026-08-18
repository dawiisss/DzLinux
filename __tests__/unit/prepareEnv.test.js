describe("prepareEnv", () => {
  let originalPlatform;

  beforeEach(() => {
    jest.resetModules();
    originalPlatform = process.platform;

    jest.doMock(
      "electron",
      () => ({
        app: { getPath: jest.fn(() => "/tmp/dzlinux-test") },
      }),
      { virtual: true },
    );

    jest.doMock("../../src/main/steamPaths", () => ({
      getSteamInstallPathAsync: jest.fn(() =>
        Promise.resolve("/home/user/.steam/steam"),
      ),
    }));
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    jest.restoreAllMocks();
  });

  describe("sanitizeArg", () => {
    const { sanitizeArg } = require("../../src/main/game/prepareEnv");

    test("removes double quotes", () => {
      expect(sanitizeArg('test"value')).toBe("testvalue");
    });

    test("converts non-string to string", () => {
      expect(sanitizeArg(123)).toBe("123");
    });

    test("handles empty string", () => {
      expect(sanitizeArg("")).toBe("");
    });

    test("removes multiple quotes", () => {
      expect(sanitizeArg('"hello"')).toBe("hello");
    });
  });

  describe("buildModString", () => {
    const { buildModString } = require("../../src/main/game/prepareEnv");

    test("returns empty string for null mods", () => {
      expect(buildModString({ modDirectory: "/mods" }, null)).toBe("");
    });

    test("returns empty string for empty mods array", () => {
      expect(buildModString({ modDirectory: "/mods" }, [])).toBe("");
    });

    test("builds semicolon-separated mod paths", () => {
      const result = buildModString({ modDirectory: "/home/user/mods" }, [
        { id: "123" },
        { id: "456" },
      ]);
      expect(result).toBe(
        "Z:\\home\\user\\mods\\123;Z:\\home\\user\\mods\\456",
      );
    });

    test("converts forward slashes to backslashes for Windows paths", () => {
      const result = buildModString({ modDirectory: "/home/user/mods" }, [
        { id: "123" },
      ]);
      expect(result).toBe("Z:\\home\\user\\mods\\123");
    });

    test("handles single mod", () => {
      const result = buildModString({ modDirectory: "/mods" }, [
        { id: "99999" },
      ]);
      expect(result).toBe("Z:\\mods\\99999");
    });
  });

  describe("buildEnvironment", () => {
    const { buildEnvironment } = require("../../src/main/game/prepareEnv");

    test("sets STEAM_COMPAT_DATA_PATH from compatDataPath", async () => {
      const env = await buildEnvironment({}, "/compat/data/221100");
      expect(env.STEAM_COMPAT_DATA_PATH).toBe("/compat/data/221100");
    });

    test("sets SteamAppId and SteamGameId to 221100", async () => {
      const env = await buildEnvironment({}, "");
      expect(env.SteamAppId).toBe("221100");
      expect(env.SteamGameId).toBe("221100");
    });

    test("sets MALLOC_TRIM_THRESHOLD_ when mallocTrim enabled", async () => {
      const env = await buildEnvironment({ mallocTrim: true }, "");
      expect(env.MALLOC_TRIM_THRESHOLD_).toBe("0");
    });

    test("does not set MALLOC_TRIM_THRESHOLD_ when mallocTrim disabled", async () => {
      const env = await buildEnvironment({ mallocTrim: false }, "");
      expect(env.MALLOC_TRIM_THRESHOLD_).toBeUndefined();
    });

    test("sets PROTON_NO_ESYNC when noEsync enabled", async () => {
      const env = await buildEnvironment({ noEsync: true }, "");
      expect(env.PROTON_NO_ESYNC).toBe("1");
    });

    test("sets PROTON_LOG to 0 when disableProtonLogs enabled", async () => {
      const env = await buildEnvironment({ disableProtonLogs: true }, "");
      expect(env.PROTON_LOG).toBe("0");
    });

    test("sets MANGOHUD and MANGOHUD_CONFIG when mangoHud enabled with config", async () => {
      const env = await buildEnvironment(
        { mangoHudEnabled: true, mangoHudConfig: "cpu_stats,gpu_stats" },
        "",
      );
      expect(env.MANGOHUD).toBe("1");
      expect(env.MANGOHUD_CONFIG).toBe("cpu_stats,gpu_stats");
    });

    test("does not set MANGOHUD or MANGOHUD_CONFIG when mangoHud disabled", async () => {
      const env = await buildEnvironment(
        { mangoHudEnabled: false, mangoHudConfig: "cpu_stats" },
        "",
      );
      expect(env.MANGOHUD).toBeUndefined();
      expect(env.MANGOHUD_CONFIG).toBeUndefined();
    });

    test("sets MANGOHUD but not MANGOHUD_CONFIG when config is empty", async () => {
      const env = await buildEnvironment(
        { mangoHudEnabled: true, mangoHudConfig: "" },
        "",
      );
      expect(env.MANGOHUD).toBe("1");
      expect(env.MANGOHUD_CONFIG).toBeUndefined();
    });

    test("inherits process.env values", async () => {
      process.env.TEST_VAR = "testvalue";
      try {
        const env = await buildEnvironment({}, "");
        expect(env.TEST_VAR).toBe("testvalue");
      } finally {
        delete process.env.TEST_VAR;
      }
    });
  });

  describe("buildExtraParams", () => {
    const { buildExtraParams } = require("../../src/main/game/prepareEnv");

    test("returns empty array for no launch params", () => {
      expect(buildExtraParams({})).toEqual([]);
    });

    test("parses simple launch params without %command%", () => {
      const result = buildExtraParams({ launchParams: "-nosplash -skipintro" });
      expect(result).toEqual(["-nosplash", "-skipintro"]);
    });

    test("returns empty array when launchParams contains %command%", () => {
      const result = buildExtraParams({
        launchParams: "-nosplash %command% -skipintro",
      });
      expect(result).toEqual([]);
    });

    test("parses quoted launch params", () => {
      const result = buildExtraParams({
        launchParams: '-name="My Name" -nosplash',
      });
      // The regex captures -name="My Name" as a single token; quotes are only
      // stripped when the entire token is wrapped in quotes (e.g. "My Name"),
      // not when embedded mid-token. So inner quotes are preserved.
      expect(result).toEqual(['-name="My Name"', "-nosplash"]);
    });

    test("adds -malloc=system when mallocSystem enabled", () => {
      const result = buildExtraParams({ mallocSystem: true });
      expect(result).toContain("-malloc=system");
    });

    test("adds -maxMem when set", () => {
      const result = buildExtraParams({ maxMem: "4096" });
      expect(result).toContain("-maxMem=4096");
    });

    test("does not add -maxMem when empty", () => {
      const result = buildExtraParams({ maxMem: "" });
      expect(result).not.toContain(expect.stringContaining("-maxMem"));
    });

    test("adds -name when set", () => {
      const result = buildExtraParams({ playerName: "Player1" });
      expect(result).toContain("-name=Player1");
    });

    test("sanitizes playerName (removes quotes)", () => {
      const result = buildExtraParams({ playerName: 'Player"Bad' });
      expect(result).toContain("-name=PlayerBad");
    });

    test("combines all params in order", () => {
      const result = buildExtraParams({
        launchParams: "-nosplash",
        mallocSystem: true,
        maxMem: "2048",
        playerName: "Test",
      });
      expect(result).toEqual([
        "-nosplash",
        "-malloc=system",
        "-maxMem=2048",
        "-name=Test",
      ]);
    });
  });
});
