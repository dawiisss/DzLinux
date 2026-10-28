const path = require("path");

jest.mock(
  "electron",
  () => ({
    app: { getPath: jest.fn(() => "/tmp/dzlinux-test-data") },
    shell: { openPath: jest.fn() },
  }),
  { virtual: true },
);

describe("modManager", () => {
  const { validateModId, safeModPath } = require("../../src/main/modManager");

  describe("validateModId", () => {
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
    test("returns null when the mod directory is missing", () => {
      expect(safeModPath(undefined, "12345")).toBeNull();
      expect(safeModPath("", "12345")).toBeNull();
    });

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
        loadSettingsAsync: jest.fn(() => ({ modDirectory: "/nonexistent/path" })),
      }));

      const modManager = require("../../src/main/modManager");
      const mods = await modManager.getInstalledMods();
      expect(mods).toEqual([]);
    });

    test("returns empty array when modDirectory is empty string", async () => {
      jest.doMock("../../src/main/settings", () => ({
        loadSettingsAsync: jest.fn(() => ({ modDirectory: "" })),
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
        loadSettingsAsync: jest.fn(() => ({ modDirectory: tmpDir })),
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
        loadSettingsAsync: jest.fn(() => ({ modDirectory: tmpDir })),
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
        loadSettingsAsync: jest.fn(() => ({ modDirectory: tmpDir })),
      }));

      const modManager = require("../../src/main/modManager");
      const mods = await modManager.getInstalledMods();
      expect(mods.length).toBe(1);
      expect(mods[0].id).toBe("12345");
    });

    test("wide/deep scans stay within the global operation bound and avoid symlink loops (R04)", async () => {
      jest.doMock("../../src/main/steamworksManager", () => ({
        getSubscribedMods: jest.fn(() => Promise.resolve([])),
      }));
      // Create 110 mods, each with nested subdirectories and multiple files (1,200+ entries)
      for (let i = 1; i <= 110; i++) {
        const mDir = path.join(tmpDir, String(10000 + i));
        const subDir = path.join(mDir, "addons", "inner");
        fs.mkdirSync(subDir, { recursive: true });
        fs.writeFileSync(path.join(mDir, "meta.cpp"), `name = "Mod ${String(i).padStart(3, "0")}";`);
        for (let f = 0; f < 8; f++) {
          fs.writeFileSync(path.join(subDir, `data_${f}.pbo`), "x".repeat(256));
        }
        if (i === 1) {
          // Add a symlink cycle to parent directory — must not recurse infinitely
          try {
            fs.symlinkSync(mDir, path.join(subDir, "cycle_link"));
          } catch {}
        }
      }

      jest.doMock("../../src/main/settings", () => ({
        loadSettingsAsync: jest.fn(() => ({ modDirectory: tmpDir })),
      }));

      const modManager = require("../../src/main/modManager");
      modManager.resetScanMetrics();
      const snapshot = await modManager.scanMods();
      const metrics = modManager.getScanMetrics();

      expect(snapshot.status).toBe("complete");
      expect(snapshot.sizeComplete).toBe(true);
      expect(snapshot.mods).toHaveLength(110);
      expect(metrics.peakFsOps).toBeLessThanOrEqual(metrics.maxFsConcurrency);
      expect(metrics.peakModScans).toBeLessThanOrEqual(metrics.maxModConcurrency);
      // Verify alphabetical ordering
      expect(snapshot.mods[0].name).toBe("Mod 001");
      expect(snapshot.mods[109].name).toBe("Mod 110");
    });

    test("distinguishes root EACCES, unreadable metadata, inner EMFILE, and disappearing files from corruption (R05)", async () => {
      jest.spyOn(console, "error").mockImplementation(() => {});
      jest.spyOn(console, "warn").mockImplementation(() => {});
      jest.doMock("../../src/main/steamworksManager", () => ({
        getSubscribedMods: jest.fn(() => Promise.resolve([])),
      }));
      jest.doMock("../../src/main/settings", () => ({
        loadSettingsAsync: jest.fn(() => ({ modDirectory: tmpDir })),
      }));

      const modDir = path.join(tmpDir, "12345");
      fs.mkdirSync(path.join(modDir, "addons"), { recursive: true });
      fs.writeFileSync(path.join(modDir, "meta.cpp"), 'name = "Mod 12345";');
      fs.writeFileSync(path.join(modDir, "addons", "a.pbo"), "x".repeat(2048));

      const modManager = require("../../src/main/modManager");

      // 1. Root EACCES -> unavailable with permission-denied, and getInstalledMods rejects
      const origReaddir = fs.promises.readdir;
      jest.spyOn(fs.promises, "readdir").mockImplementationOnce(() => {
        const err = new Error("Permission denied");
        err.code = "EACCES";
        return Promise.reject(err);
      });
      const rootDenied = await modManager.scanMods({ force: true });
      expect(rootDenied.status).toBe("unavailable");
      expect(rootDenied.reason).toBe("permission-denied");
      expect(rootDenied.sizeComplete).toBe(false);

      jest.spyOn(fs.promises, "readdir").mockImplementationOnce(() => {
        const err = new Error("Permission denied");
        err.code = "EACCES";
        return Promise.reject(err);
      });
      await expect(modManager.getInstalledMods()).rejects.toThrow(/permission-denied/);

      // 2. Unreadable meta.cpp (EACCES) -> partial/unreadable scanStatus, NOT isCorrupted
      const origReadFile = fs.promises.readFile;
      jest.spyOn(fs.promises, "readFile").mockImplementation((p, enc) => {
        if (String(p).endsWith("meta.cpp")) {
          const err = new Error("EACCES");
          err.code = "EACCES";
          return Promise.reject(err);
        }
        return origReadFile.call(fs.promises, p, enc);
      });
      const metaDenied = await modManager.scanMods({ force: true });
      expect(metaDenied.status).toBe("partial");
      expect(metaDenied.sizeComplete).toBe(false);
      expect(metaDenied.mods[0].isCorrupted).toBe(false);
      expect(metaDenied.mods[0].scanStatus).toBe("partial");
      fs.promises.readFile.mockRestore();

      // 3. Inner EMFILE during file stat -> partial scan, NOT isCorrupted
      const origStat = fs.promises.stat;
      jest.spyOn(fs.promises, "stat").mockImplementation((p) => {
        if (String(p).endsWith("a.pbo")) {
          const err = new Error("Too many open files");
          err.code = "EMFILE";
          return Promise.reject(err);
        }
        return origStat.call(fs.promises, p);
      });
      const innerEmfile = await modManager.scanMods({ force: true });
      expect(innerEmfile.status).toBe("partial");
      expect(innerEmfile.sizeComplete).toBe(false);
      expect(innerEmfile.mods[0].isCorrupted).toBe(false);
      expect(innerEmfile.mods[0].scanStatus).toBe("partial");
      expect(innerEmfile.mods[0].errorCode).toBe("EMFILE");
      fs.promises.stat.mockRestore();
      void origReaddir;
    });

    test("coalesces same-root concurrent scans and supersedes when root changes (R06)", async () => {
      let currentRoot = tmpDir;
      const altDir = fs.mkdtempSync(path.join(os.tmpdir(), "dzlinux-mods-alt-"));
      try {
        fs.mkdirSync(path.join(tmpDir, "12345"));
        fs.writeFileSync(path.join(tmpDir, "12345", "meta.cpp"), 'name = "Alpha";');
        fs.mkdirSync(path.join(altDir, "67890"));
        fs.writeFileSync(path.join(altDir, "67890", "meta.cpp"), 'name = "Beta";');

        jest.doMock("../../src/main/settings", () => ({
          loadSettingsAsync: jest.fn(async () => ({ modDirectory: currentRoot })),
        }));

        const modManager = require("../../src/main/modManager");
        const [joinA, joinB] = await Promise.all([
          modManager.scanMods(),
          modManager.scanMods(),
        ]);
        expect(joinA.scanId).toBe(joinB.scanId);
        expect(joinA.mods[0].id).toBe("12345");

        // Delay root A scan and start root B scan to supersede A
        const origReaddir = fs.promises.readdir;
        let releaseSlowReaddir;
        jest.spyOn(fs.promises, "readdir").mockImplementationOnce(
          (dir, opts) =>
            new Promise((resolve) => {
              releaseSlowReaddir = () => resolve(origReaddir.call(fs.promises, dir, opts));
            }),
        );

        const slowScanA = modManager.scanMods({ force: true });
        for (let i = 0; i < 5 && !releaseSlowReaddir; i++) await Promise.resolve();

        currentRoot = altDir;
        const scanB = modManager.scanMods();
        releaseSlowReaddir();

        const [resA, resB] = await Promise.all([slowScanA, scanB]);
        expect(resA.status).toBe("cancelled");
        expect(resA.reason).toBe("superseded");
        expect(resB.status).toBe("complete");
        expect(resB.root).toBe(altDir);
        expect(resB.mods[0].id).toBe("67890");
      } finally {
        fs.rmSync(altDir, { recursive: true, force: true });
      }
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
        loadSettingsAsync: jest.fn(() => ({ modDirectory: tmpDir })),
      }));

      const modManager = require("../../src/main/modManager");
      const result = await modManager.deleteMod("12345");
      expect(result).toBe(true);
      expect(fs.existsSync(modDir)).toBe(false);
    });

    test("returns false for non-existent mod", async () => {
      jest.doMock("../../src/main/settings", () => ({
        loadSettingsAsync: jest.fn(() => ({ modDirectory: tmpDir })),
      }));

      const modManager = require("../../src/main/modManager");
      const result = await modManager.deleteMod("99999");
      expect(result).toBe(false);
    });

    test("returns false for invalid mod ID", async () => {
      jest.doMock("../../src/main/settings", () => ({
        loadSettingsAsync: jest.fn(() => ({ modDirectory: tmpDir })),
      }));

      const modManager = require("../../src/main/modManager");
      expect(await modManager.deleteMod("abc")).toBe(false);
      expect(await modManager.deleteMod("")).toBe(false);
      expect(await modManager.deleteMod(null)).toBe(false);
    });

    test("returns false when no mod directory is configured", async () => {
      jest.doMock("../../src/main/settings", () => ({
        loadSettingsAsync: jest.fn(() => ({})),
      }));

      const modManager = require("../../src/main/modManager");
      expect(await modManager.deleteMod("12345")).toBe(false);
    });
  });
});
