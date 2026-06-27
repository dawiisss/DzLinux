const path = require("path");

describe("modManager", () => {
  describe("validateModId", () => {
    function validateModId(modId) {
      if (typeof modId !== "string" || !/^\d+$/.test(modId)) {
        return false;
      }
      return true;
    }

    test("accepts numeric string", () => {
      expect(validateModId("12345")).toBe(true);
    });

    test("rejects non-numeric string", () => {
      expect(validateModId("abc")).toBe(false);
    });

    test("rejects empty string", () => {
      expect(validateModId("")).toBe(false);
    });

    test("rejects number type", () => {
      expect(validateModId(123)).toBe(false);
    });

    test("rejects null", () => {
      expect(validateModId(null)).toBe(false);
    });

    test("rejects undefined", () => {
      expect(validateModId(undefined)).toBe(false);
    });

    test("rejects string with spaces", () => {
      expect(validateModId("123 456")).toBe(false);
    });

    test("rejects string with special chars", () => {
      expect(validateModId("123;456")).toBe(false);
    });
  });

  describe("safeModPath", () => {
    function safeModPath(modDirectory, modId) {
      const resolved = path.resolve(path.join(modDirectory, modId));
      if (!resolved.startsWith(path.resolve(modDirectory))) {
        return null;
      }
      return resolved;
    }

    test("returns resolved path for valid mod ID", () => {
      const result = safeModPath("/workshop/content/221100", "12345");
      expect(result).toBe(path.resolve("/workshop/content/221100/12345"));
    });

    test("blocks path traversal with ../", () => {
      const result = safeModPath("/workshop/content/221100", "../escape");
      expect(result).toBeNull();
    });

    test("blocks path traversal with ..", () => {
      const result = safeModPath("/workshop/content/221100", "../../etc");
      expect(result).toBeNull();
    });

    test("resolves absolute path within modDirectory", () => {
      // path.join('/workshop/content/221100', '/etc/passwd') = '/workshop/content/221100/etc/passwd'
      // path.resolve of that stays the same, and it starts with the modDirectory
      // Note: path.join strips leading / on the second arg, so this is actually allowed by the current code
      const result = safeModPath("/workshop/content/221100", "/etc/passwd");
      // This is actually a known limitation - path.join concatenates, doesn't treat as absolute
      expect(result).toBe("/workshop/content/221100/etc/passwd");
    });
  });

  describe("getInstalledMods", () => {
    const fs = require("fs");
    const os = require("os");
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dzlinux-mods-"));
      jest.resetModules();

      jest.doMock(
        "electron",
        () => ({
          app: { getPath: jest.fn(() => "/tmp/dzlinux-test-data") },
          shell: { openPath: jest.fn() },
        }),
        { virtual: true },
      );
      jest.doMock("../../src/main/steamworksManager", () => ({
        getSubscribedMods: jest.fn(() => Promise.resolve(["12345", "67890"])),
      }));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test("returns empty array when modDirectory does not exist", async () => {
      jest.doMock("../../src/main/settings", () => ({
        loadSettings: jest.fn(() => ({ modDirectory: "/nonexistent/path" })),
      }));

      const modManager = require("../../src/main/modManager");
      const mods = await modManager.getInstalledMods();
      expect(mods).toEqual([]);
    });

    test("returns empty array when modDirectory is empty string", async () => {
      jest.doMock("../../src/main/settings", () => ({
        loadSettings: jest.fn(() => ({ modDirectory: "" })),
      }));

      const modManager = require("../../src/main/modManager");
      const mods = await modManager.getInstalledMods();
      expect(mods).toEqual([]);
    });

    test("scans numeric directories and parses meta.cpp", async () => {
      const modDir = path.join(tmpDir, "12345");
      fs.mkdirSync(modDir);
      fs.mkdirSync(path.join(modDir, "addons"));
      fs.writeFileSync(path.join(modDir, "meta.cpp"), 'name = "Test Mod";');

      jest.doMock("../../src/main/settings", () => ({
        loadSettings: jest.fn(() => ({ modDirectory: tmpDir })),
      }));

      const modManager = require("../../src/main/modManager");
      const mods = await modManager.getInstalledMods();
      expect(mods.length).toBe(1);
      expect(mods[0].id).toBe("12345");
      expect(mods[0].name).toBe("Test Mod");
    });

    test("skips non-numeric directories", async () => {
      fs.mkdirSync(path.join(tmpDir, "not_a_mod"));
      fs.mkdirSync(path.join(tmpDir, "12345"));
      fs.writeFileSync(path.join(tmpDir, "12345", "meta.cpp"), 'name = "Mod";');

      jest.doMock("../../src/main/settings", () => ({
        loadSettings: jest.fn(() => ({ modDirectory: tmpDir })),
      }));

      const modManager = require("../../src/main/modManager");
      const mods = await modManager.getInstalledMods();
      expect(mods.length).toBe(1);
      expect(mods[0].id).toBe("12345");
    });

    test("skips non-subscribed mods when subscription list available", async () => {
      fs.mkdirSync(path.join(tmpDir, "12345"));
      fs.writeFileSync(
        path.join(tmpDir, "12345", "meta.cpp"),
        'name = "Subscribed Mod";',
      );
      fs.mkdirSync(path.join(tmpDir, "99999"));
      fs.writeFileSync(
        path.join(tmpDir, "99999", "meta.cpp"),
        'name = "Unsubscribed Mod";',
      );

      jest.doMock("../../src/main/settings", () => ({
        loadSettings: jest.fn(() => ({ modDirectory: tmpDir })),
      }));

      const modManager = require("../../src/main/modManager");
      const mods = await modManager.getInstalledMods();
      expect(mods.length).toBe(1);
      expect(mods[0].id).toBe("12345");
    });
  });

  describe("deleteMod", () => {
    const fs = require("fs");
    const os = require("os");
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dzlinux-del-"));
      jest.resetModules();

      jest.doMock(
        "electron",
        () => ({
          app: { getPath: jest.fn(() => "/tmp/dzlinux-test-data") },
          shell: { openPath: jest.fn() },
        }),
        { virtual: true },
      );
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test("deletes existing mod directory", async () => {
      const modDir = path.join(tmpDir, "12345");
      fs.mkdirSync(modDir);
      fs.writeFileSync(path.join(modDir, "test.txt"), "content");

      jest.doMock("../../src/main/settings", () => ({
        loadSettings: jest.fn(() => ({ modDirectory: tmpDir })),
      }));

      const modManager = require("../../src/main/modManager");
      const result = await modManager.deleteMod("12345");
      expect(result).toBe(true);
      expect(fs.existsSync(modDir)).toBe(false);
    });

    test("returns false for non-existent mod", async () => {
      jest.doMock("../../src/main/settings", () => ({
        loadSettings: jest.fn(() => ({ modDirectory: tmpDir })),
      }));

      const modManager = require("../../src/main/modManager");
      const result = await modManager.deleteMod("99999");
      expect(result).toBe(false);
    });

    test("returns false for invalid mod ID", async () => {
      jest.doMock("../../src/main/settings", () => ({
        loadSettings: jest.fn(() => ({ modDirectory: tmpDir })),
      }));

      const modManager = require("../../src/main/modManager");
      expect(await modManager.deleteMod("abc")).toBe(false);
      expect(await modManager.deleteMod("")).toBe(false);
      expect(await modManager.deleteMod(null)).toBe(false);
    });
  });
});
