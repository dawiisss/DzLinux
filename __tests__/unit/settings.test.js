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
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  test("loadSettings returns defaults when no file exists", () => {
    const { loadSettings } = require("../../src/main/settings");
    const settings = loadSettings();
    expect(settings.launchParams).toBe("");
    expect(settings.theme).toBe("tactical-dark");
    expect(settings.audioFeedback).toBe(true);
  });

  test("saveSettings then loadSettings round-trips correctly", () => {
    const { loadSettings, saveSettings } = require("../../src/main/settings");
    const toSave = {
      launchParams: "-nosplash",
      theme: "toxic",
      audioFeedback: false,
      favorites: [{ ip: "1.2.3.4", port: 2302, queryPort: null, name: "" }],
    };
    const success = saveSettings(toSave);
    expect(success).toBe(true);
    expect(fs.existsSync(settingsPath)).toBe(true);

    const loaded = loadSettings();
    expect(loaded.launchParams).toBe("-nosplash");
    expect(loaded.theme).toBe("toxic");
    expect(loaded.audioFeedback).toBe(false);
    expect(loaded.favorites).toEqual([
      { ip: "1.2.3.4", port: 2302, queryPort: null, name: "" },
    ]);
  });

  test("loadSettings ignores unknown keys (prototype pollution guard)", () => {
    const malicious = {
      __proto__: { polluted: true },
      constructor: { prototype: { polluted: true } },
      theme: "toxic",
    };
    fs.writeFileSync(settingsPath, JSON.stringify(malicious), "utf8");

    const { loadSettings } = require("../../src/main/settings");
    const settings = loadSettings();
    expect(settings.theme).toBe("toxic");
    expect(settings.polluted).toBeUndefined();
  });

  test("saveSettings strips steamPassword", () => {
    const { saveSettings } = require("../../src/main/settings");
    const toSave = {
      theme: "toxic",
      steamPassword: "secret123",
    };
    saveSettings(toSave);

    const raw = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    expect(raw.steamPassword).toBeUndefined();
    expect(raw.theme).toBe("toxic");
  });

  test("loadSettings merges defaults for missing fields", () => {
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ theme: "vampire" }),
      "utf8",
    );
    const { loadSettings } = require("../../src/main/settings");
    const settings = loadSettings();
    expect(settings.theme).toBe("vampire");
    expect(settings.audioFeedback).toBe(true);
    expect(settings.launchParams).toBe("");
  });

  test("saveSettings returns boolean", () => {
    const { saveSettings } = require("../../src/main/settings");
    const result = saveSettings({ theme: "toxic" });
    expect(typeof result).toBe("boolean");
    expect(result).toBe(true);
  });

  test("saveSettings returns false when fs.writeFileSync throws", () => {
    const { saveSettings } = require("../../src/main/settings");

    // Suppress console.error for this test so it doesn't clutter output
    jest.spyOn(console, "error").mockImplementation(() => {});

    jest.spyOn(fs, "writeFileSync").mockImplementation(() => {
      throw new Error("Disk full");
    });

    const result = saveSettings({ theme: "toxic" });

    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      "Failed to save settings",
      expect.any(Error),
    );
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

    test("finds default workshop folder on linux", () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
      });

      const os = require("os");
      jest.spyOn(os, "homedir").mockReturnValue(tmpDir);

      const { loadSettings } = require("../../src/main/settings");
      const settings = loadSettings();

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

    test("finds secondary workshop folder on linux", () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
      });

      const os = require("os");
      jest.spyOn(os, "homedir").mockReturnValue(tmpDir);

      const realExistsSync = jest.requireActual("fs").existsSync;
      jest.spyOn(fs, "existsSync").mockImplementation((p) => {
        if (p === path.join(tmpDir, ".local", "share", "Steam")) return false;
        if (p === path.join(tmpDir, ".steam", "steam")) return true;
        if (
          p ===
          path.join(
            tmpDir,
            ".steam",
            "steam",
            "steamapps",
            "workshop",
            "content",
            "221100",
          )
        )
          return true;

        return realExistsSync(p);
      });

      const { loadSettings } = require("../../src/main/settings");
      const settings = loadSettings();

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

    test("finds flatpak workshop folder on linux", () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
      });

      const os = require("os");
      jest.spyOn(os, "homedir").mockReturnValue(tmpDir);

      const realExistsSync = jest.requireActual("fs").existsSync;
      jest.spyOn(fs, "existsSync").mockImplementation((p) => {
        if (p === path.join(tmpDir, ".local", "share", "Steam")) return false;
        if (p === path.join(tmpDir, ".steam", "steam")) return false;
        if (
          p ===
          path.join(
            tmpDir,
            ".var",
            "app",
            "com.valvesoftware.Steam",
            ".local",
            "share",
            "Steam",
          )
        )
          return true;
        if (
          p ===
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
          )
        )
          return true;

        return realExistsSync(p);
      });

      const { loadSettings } = require("../../src/main/settings");
      const settings = loadSettings();

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

    test("parses libraryfolders.vdf correctly", () => {
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

      const { loadSettings } = require("../../src/main/settings");
      const settings = loadSettings();

      expect(settings.modDirectory).toBe(
        path.join(fakeLibPath, "steamapps", "workshop", "content", "221100"),
      );
    });
  });
});
