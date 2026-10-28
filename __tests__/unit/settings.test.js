const fs = require("fs");
const path = require("path");
const os = require("os");

describe("settings", () => {
  let tmpDir;
  let settingsPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dzlinux-test-"));
    settingsPath = path.join(tmpDir, "settings.json");
    jest.resetModules();

    // Use doMock so we can reference tmpDir at runtime
    jest.doMock(
      "electron",
      () => ({
        app: {
          getPath: jest.fn(() => tmpDir),
          getVersion: jest.fn(() => "1.0.7"),
          isPackaged: false,
          getAppPath: jest.fn(() => "/tmp/dzlinux-test"),
        },
      }),
      { virtual: true },
    );

    // Clear settings cache between tests (Must be AFTER doMock electron!)
    try {
      const { _clearCache } = require("../../src/main/settings");
      _clearCache();
    } catch {}
    try {
      const { _clearCache } = require("../../src/main/steamPaths");
      _clearCache();
    } catch {}

    // Reset modules again so that test-specific mocks (like os.homedir) apply on fresh requires
    jest.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  test("loadSettingsAsync returns defaults when no file exists", async () => {
    const { loadSettingsAsync } = require("../../src/main/settings");
    const settings = await loadSettingsAsync();
    expect(settings.launchParams).toBe("");
    expect(settings.theme).toBe("tactical-dark");
    expect(settings.audioFeedback).toBe(true);
    expect(settings.showWatchlistTab).toBe(true);
    expect(settings.showDiagnosticsTab).toBe(true);
    expect(settings.queryConcurrency).toBe(150);
  });

  test("loadSettings returns defaults synchronously when no file exists", () => {
    const { loadSettings } = require("../../src/main/settings");
    const settings = loadSettings();
    expect(settings.nativeWayland).toBe(false);
    expect(settings.theme).toBe("tactical-dark");
  });

  test("loadSettings returns parsed settings synchronously from disk", () => {
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ nativeWayland: true, theme: "toxic" }),
      "utf8",
    );
    const { loadSettings } = require("../../src/main/settings");
    const settings = loadSettings();
    expect(settings.nativeWayland).toBe(true);
    expect(settings.theme).toBe("toxic");
  });

  test("saveSettings then loadSettingsAsync round-trips correctly", async () => {
    const { loadSettingsAsync, saveSettings } = require("../../src/main/settings");
    fs.writeFileSync(settingsPath, JSON.stringify({ favorites: [{ ip: "1.2.3.4", port: 2302, queryPort: null, name: "" }] }));
    const toSave = {
      launchParams: "-nosplash",
      theme: "toxic",
      audioFeedback: false,
      showWatchlistTab: false,
      showDiagnosticsTab: false,
      favorites: [{ ip: "1.2.3.4", port: 2302, queryPort: null, name: "" }],
    };
    const success = await saveSettings(toSave);
    expect(success).toBe(true);
    expect(fs.existsSync(settingsPath)).toBe(true);

    const loaded = await loadSettingsAsync();
    expect(loaded.launchParams).toBe("-nosplash");
    expect(loaded.theme).toBe("toxic");
    expect(loaded.audioFeedback).toBe(false);
    expect(loaded.showWatchlistTab).toBe(false);
    expect(loaded.showDiagnosticsTab).toBe(false);
    expect(loaded.favorites).toEqual([
      { ip: "1.2.3.4", port: 2302, queryPort: null, name: "" },
    ]);
  });

  test("loadSettingsAsync ignores unknown keys (prototype pollution guard)", async () => {
    const malicious = {
      __proto__: { polluted: true },
      constructor: { prototype: { polluted: true } },
      theme: "toxic",
    };
    fs.writeFileSync(settingsPath, JSON.stringify(malicious), "utf8");

    const { loadSettingsAsync } = require("../../src/main/settings");
    const settings = await loadSettingsAsync();
    expect(settings.theme).toBe("toxic");
    expect(settings.polluted).toBeUndefined();
  });

  test("saveSettings strips steamPassword", async () => {
    const { saveSettings } = require("../../src/main/settings");
    const toSave = {
      theme: "toxic",
      steamPassword: "secret123",
    };
    await saveSettings(toSave);

    const raw = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    expect(raw.steamPassword).toBeUndefined();
    expect(raw.theme).toBe("toxic");
  });

  test("loadSettingsAsync merges defaults for missing fields", async () => {
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ theme: "vampire" }),
      "utf8",
    );
    const { loadSettingsAsync } = require("../../src/main/settings");
    const settings = await loadSettingsAsync();
    expect(settings.theme).toBe("vampire");
    expect(settings.audioFeedback).toBe(true);
    expect(settings.launchParams).toBe("");
  });

  test("saveSettings returns boolean", async () => {
    const { saveSettings } = require("../../src/main/settings");
    const result = await saveSettings({ theme: "toxic" });
    expect(typeof result).toBe("boolean");
    expect(result).toBe(true);
  });

  test("enforces the maximum background query concurrency", async () => {
    const { saveSettings, loadSettingsAsync } = require("../../src/main/settings");

    expect(await saveSettings({ queryConcurrency: 501 })).toBe(true);

    const settings = await loadSettingsAsync();
    expect(settings.queryConcurrency).toBe(500);
  });

  test("saveSettings returns false when fs.promises.writeFile throws", async () => {
    const { saveSettings } = require("../../src/main/settings");

    // Suppress console.error for this test so it doesn't clutter output
    jest.spyOn(console, "error").mockImplementation(() => {});

    jest.spyOn(fs.promises, "writeFile").mockImplementation(() => {
      return Promise.reject(new Error("Disk full"));
    });

    const result = await saveSettings({ theme: "toxic" });

    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      "Failed to save settings",
      expect.any(Error),
    );
  });

  test("a failed save does not replace the last persisted settings in memory", async () => {
    const { saveSettings, loadSettingsAsync } = require("../../src/main/settings");
    await saveSettings({ theme: "vampire", modDirectory: "/mods" });
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(fs.promises, "writeFile").mockRejectedValueOnce(new Error("Disk full"));
    expect(await saveSettings({ theme: "toxic", modDirectory: "/mods" })).toBe(false);
    expect((await loadSettingsAsync()).theme).toBe("vampire");
  });

  test("slow auto-discovery cannot overwrite a more recent settings save", async () => {
    await require("../../src/main/settings").loadSettingsAsync();
    const steamPaths = require("../../src/main/steamPaths");
    let finishDiscovery;
    jest.spyOn(steamPaths, "findDayzWorkshopFolderAsync").mockImplementationOnce(
      () => new Promise(resolve => { finishDiscovery = resolve; }),
    );
    const { saveSettings, loadSettingsAsync } = require("../../src/main/settings");
    const first = saveSettings({ theme: "vampire", modDirectory: "" });
    const second = saveSettings({ theme: "toxic", modDirectory: "/mods" });
    for (let turn = 0; turn < 10 && !finishDiscovery; turn++) await Promise.resolve();
    expect(finishDiscovery).toEqual(expect.any(Function));
    finishDiscovery("/discovered-mods");
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect((await loadSettingsAsync()).theme).toBe("toxic");
    expect(JSON.parse(await fs.promises.readFile(settingsPath, "utf8")).theme).toBe("toxic");
  });

  describe("findDayzWorkshopFolder", () => {
    let originalPlatform;

    beforeEach(() => {
      originalPlatform = process.platform;
      // create fake dir structure
      const fakeSteamDir = path.join(tmpDir, ".local", "share", "Steam");
      const fakeWorkshopDir = path.join(
        fakeSteamDir,
        "steamapps",
        "workshop",
        "content",
        "221100",
      );
      fs.mkdirSync(fakeWorkshopDir, { recursive: true });
    });

    afterEach(() => {
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
      });
      jest.restoreAllMocks();
      jest.resetModules();
    });

    test("finds default workshop folder on linux", async () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
      });

      const os = require("os");
      jest.spyOn(os, "homedir").mockReturnValue(tmpDir);

      const { loadSettingsAsync } = require("../../src/main/settings");
      const settings = await loadSettingsAsync();

      // Because we mock os.homedir() to tmpDir, it should look in tmpDir/.local/share/Steam/steamapps/workshop/content/221100
      expect(settings.modDirectory).toBe(
        path.join(
          tmpDir,
          ".local",
          "share",
          "Steam",
          "steamapps",
          "workshop",
          "content",
          "221100",
        ),
      );
    });

    test("finds secondary workshop folder on linux", async () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
      });

      const os = require("os");
      jest.spyOn(os, "homedir").mockReturnValue(tmpDir);

      jest.spyOn(fs.promises, "access").mockImplementation(async (p) => {
        if (p === path.join(tmpDir, ".local", "share", "Steam")) {
          throw new Error("ENOENT");
        }
        if (p === path.join(tmpDir, ".steam", "steam")) return;
        if (p === path.join(tmpDir, ".steam", "steam", "steamapps", "workshop", "content", "221100")) return;
        throw new Error("ENOENT");
      });

      const { loadSettingsAsync } = require("../../src/main/settings");
      const settings = await loadSettingsAsync();

      expect(settings.modDirectory).toBe(
        path.join(
          tmpDir,
          ".steam",
          "steam",
          "steamapps",
          "workshop",
          "content",
          "221100",
        ),
      );
    });

    test("finds flatpak workshop folder on linux", async () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
      });

      const os = require("os");
      jest.spyOn(os, "homedir").mockReturnValue(tmpDir);

      jest.spyOn(fs.promises, "access").mockImplementation(async (p) => {
        if (p === path.join(tmpDir, ".local", "share", "Steam") || p === path.join(tmpDir, ".steam", "steam")) {
          throw new Error("ENOENT");
        }
        if (p === path.join(tmpDir, ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam")) return;
        if (p === path.join(tmpDir, ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam", "steamapps", "workshop", "content", "221100")) return;
        throw new Error("ENOENT");
      });

      const { loadSettingsAsync } = require("../../src/main/settings");
      const settings = await loadSettingsAsync();

      expect(settings.modDirectory).toBe(
        path.join(
          tmpDir,
          ".var",
          "app",
          "com.valvesoftware.Steam",
          ".local",
          "share",
          "Steam",
          "steamapps",
          "workshop",
          "content",
          "221100",
        ),
      );
    });

    test("parses libraryfolders.vdf correctly", async () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
      });

      const os = require("os");
      jest.spyOn(os, "homedir").mockReturnValue(tmpDir);

      const fakeVdfPath = path.join(
        tmpDir,
        ".local",
        "share",
        "Steam",
        "steamapps",
        "libraryfolders.vdf",
      );
      const fakeLibPath = path.join(tmpDir, "CustomLib");
      const fakeVdfContent = `
"libraryfolders"
{
  "0"
  {
    "path"    "${fakeLibPath}"
    "label"   ""
  }
}`;
      fs.mkdirSync(
        path.join(fakeLibPath, "steamapps", "workshop", "content", "221100"),
        { recursive: true },
      );
      fs.writeFileSync(fakeVdfPath, fakeVdfContent, "utf8");

      const realExistsSync = jest.requireActual("fs").existsSync;
      jest.spyOn(fs, "existsSync").mockImplementation((p) => {
        if (
          p ===
          path.join(
            tmpDir,
            ".local",
            "share",
            "Steam",
            "steamapps",
            "workshop",
            "content",
            "221100",
          )
        )
          return false;
        return realExistsSync(p);
      });

      const { loadSettingsAsync } = require("../../src/main/settings");
      const settings = await loadSettingsAsync();

      expect(settings.modDirectory).toBe(
        path.join(fakeLibPath, "steamapps", "workshop", "content", "221100"),
      );
    });
  });

  describe("sanitizeSettings", () => {
    test("sanitizes boolean keys enableWatchlist, showHistoryTab, and enableHistory", async () => {
      const { saveSettings, loadSettingsAsync } = require("../../src/main/settings");
      await saveSettings({
        enableWatchlist: "not-a-boolean",
        showHistoryTab: 123,
        enableHistory: null,
      });

      const loaded = await loadSettingsAsync();
      expect(typeof loaded.enableWatchlist).toBe("boolean");
      expect(typeof loaded.showHistoryTab).toBe("boolean");
      expect(typeof loaded.enableHistory).toBe("boolean");
    });

    test("sanitizes filterMaps and filterCountries to empty arrays if invalid", async () => {
      const { saveSettings, loadSettingsAsync } = require("../../src/main/settings");
      await saveSettings({
        filterMaps: "invalid-string",
        filterCountries: { country: "US" },
      });

      const loaded = await loadSettingsAsync();
      expect(loaded.filterMaps).toEqual([]);
      expect(loaded.filterCountries).toEqual([]);
    });

    test("sanitizes modLoadouts to object and filters invalid entries", async () => {
      const { saveSettings, loadSettingsAsync } = require("../../src/main/settings");
      await saveSettings({
        modLoadouts: ["invalid", "array"],
      });

      let loaded = await loadSettingsAsync();
      expect(loaded.modLoadouts).toEqual({});

      await saveSettings({
        modLoadouts: {
          PVP: ["12345", "67890"],
          Invalid: "not-an-array",
        },
      });

      loaded = await loadSettingsAsync();
      expect(loaded.modLoadouts.PVP).toEqual(["12345", "67890"]);
      expect(loaded.modLoadouts.Invalid).toBeUndefined();
    });

    test("normalizes maxMem, filterName, enums, and dxvkThreads on async and sync loads", async () => {
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({
          maxMem: 16384,
          filterName: 123,
          filterPerspective: "invalid-persp",
          filterCategory: "invalid-cat",
          serverListMode: "invalid-mode",
          layoutMode: "invalid-layout",
          listMode: "invalid-list",
          theme: "unknown-theme",
          dxvkThreads: 16,
        }),
        "utf8",
      );

      const { loadSettings, loadSettingsAsync, saveSettings } = require("../../src/main/settings");
      const syncLoaded = loadSettings();
      expect(syncLoaded.maxMem).toBe("16384");
      expect(syncLoaded.filterName).toBe("");
      expect(syncLoaded.filterPerspective).toBe("all");
      expect(syncLoaded.filterCategory).toBe("all");
      expect(syncLoaded.serverListMode).toBe("compact");
      expect(syncLoaded.layoutMode).toBe("modern");
      expect(syncLoaded.listMode).toBe("paging");
      expect(syncLoaded.theme).toBe("tactical-dark");
      expect(syncLoaded.dxvkThreads).toBe("16");

      const asyncLoaded = await loadSettingsAsync();
      expect(asyncLoaded.maxMem).toBe("16384");
      expect(asyncLoaded.filterName).toBe("");
      expect(asyncLoaded.dxvkThreads).toBe("16");

      await saveSettings({
        maxMem: "   ",
        dxvkThreads: "not-a-number",
      });
      const afterInvalidSave = await loadSettingsAsync();
      expect(afterInvalidSave.maxMem).toBe("");
      expect(afterInvalidSave.dxvkThreads).toBe("0");
    });
  });
});
