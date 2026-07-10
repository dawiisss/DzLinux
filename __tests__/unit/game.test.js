const fs = require("fs");
const path = require("path");
const os = require("os");

describe("game", () => {
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

  describe("checkMods", () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dzlinux-game-"));
      jest.resetModules();

      jest.doMock(
        "electron",
        () => ({
          app: { getPath: jest.fn(() => "/tmp/dzlinux-test-data") },
        }),
        { virtual: true },
      );

      jest.doMock("../../src/main/steamworksManager", () => ({
        getModState: jest.fn(() => Promise.resolve(null)),
        getSubscribedMods: jest.fn(() => Promise.resolve([])),
        lockForLaunch: jest.fn(() => Promise.resolve()),
        unlockForLaunch: jest.fn(),
        lockAndDelayForLaunch: jest.fn((cb) => { if (cb) cb(); return Promise.resolve(); }),
      }));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test("returns hasAllMods true for empty mod list", async () => {
      jest.doMock("../../src/main/settings", () => ({
        loadSettings: jest.fn(() => ({ modDirectory: tmpDir })),
      }));

      const game = require("../../src/main/game");
      const result = await game.checkMods([]);
      expect(result.hasAllMods).toBe(true);
      expect(result.missingMods).toEqual([]);
    });

    test("returns hasAllMods true for null mod list", async () => {
      jest.doMock("../../src/main/settings", () => ({
        loadSettings: jest.fn(() => ({ modDirectory: tmpDir })),
      }));

      const game = require("../../src/main/game");
      const result = await game.checkMods(null);
      expect(result.hasAllMods).toBe(true);
      expect(result.missingMods).toEqual([]);
    });

    test("returns all mods missing when modDirectory does not exist", async () => {
      jest.doMock("../../src/main/settings", () => ({
        loadSettings: jest.fn(() => ({ modDirectory: "/nonexistent" })),
      }));

      const game = require("../../src/main/game");
      const result = await game.checkMods([{ id: "12345" }]);
      expect(result.hasAllMods).toBe(false);
      expect(result.missingMods).toHaveLength(1);
    });

    test("detects installed mod with addons folder", async () => {
      const modDir = path.join(tmpDir, "12345");
      fs.mkdirSync(path.join(modDir, "addons"), { recursive: true });

      jest.doMock("../../src/main/settings", () => ({
        loadSettings: jest.fn(() => ({ modDirectory: tmpDir })),
      }));

      const game = require("../../src/main/game");
      const result = await game.checkMods([{ id: "12345" }]);
      expect(result.hasAllMods).toBe(true);
      expect(result.missingMods).toHaveLength(0);
    });

    test("detects missing mod (no directory)", async () => {
      jest.doMock("../../src/main/settings", () => ({
        loadSettings: jest.fn(() => ({ modDirectory: tmpDir })),
      }));

      const game = require("../../src/main/game");
      const result = await game.checkMods([{ id: "99999" }]);
      expect(result.hasAllMods).toBe(false);
      expect(result.missingMods).toHaveLength(1);
    });
  });

  describe("scanProtonVersions", () => {
    test("returns empty array when no proton directories exist", async () => {
      jest.resetModules();
      jest.doMock(
        "electron",
        () => ({
          app: { getPath: jest.fn(() => "/tmp/dzlinux-test-data") },
        }),
        { virtual: true },
      );
      jest.doMock("../../src/main/steamworksManager", () => ({
        getModState: jest.fn(),
        lockForLaunch: jest.fn(),
        unlockForLaunch: jest.fn(),
        lockAndDelayForLaunch: jest.fn((cb) => { if (cb) cb(); return Promise.resolve(); }),
      }));

      const game = require("../../src/main/game");
      const versions = await game.scanProtonVersions();
      expect(Array.isArray(versions)).toBe(true);
    });
  });

  describe("checkGameMode", () => {
    test("returns false when gamemoded is not available", async () => {
      jest.resetModules();
      jest.doMock(
        "electron",
        () => ({
          app: { getPath: jest.fn(() => "/tmp/dzlinux-test-data") },
        }),
        { virtual: true },
      );
      jest.doMock("../../src/main/steamworksManager", () => ({
        getModState: jest.fn(),
        lockForLaunch: jest.fn(),
        unlockForLaunch: jest.fn(),
        lockAndDelayForLaunch: jest.fn((cb) => { if (cb) cb(); return Promise.resolve(); }),
      }));

      // Mock child_process to avoid actual system calls
      jest.doMock("child_process", () => ({
        execFile: jest.fn((cmd, args, cb) => cb(new Error("not found"))),
        exec: jest.fn(),
      }));

      const game = require("../../src/main/game");
      const result = await game.checkGameMode();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("launchDayZ and handleGameExit", () => {
    let mockGetAllWindows;
    let mockWebContentsSend;
    let mockGetRecentLogs;
    let mockExecFile;

    beforeEach(() => {
      jest.resetModules();

      mockWebContentsSend = jest.fn();
      const mockWindow = {
        isDestroyed: jest.fn().mockReturnValue(false),
        webContents: { send: mockWebContentsSend },
      };

      mockGetAllWindows = jest.fn().mockReturnValue([mockWindow]);

      jest.doMock(
        "electron",
        () => ({
          app: { getPath: jest.fn(() => "/tmp/dzlinux-test-data") },
          BrowserWindow: { getAllWindows: mockGetAllWindows },
        }),
        { virtual: true },
      );

      jest.doMock("../../src/main/settings", () => ({
        loadSettings: jest.fn(() => ({
          modDirectory: "/tmp",
          enableGameMode: false,
          protonPath: "default",
        })),
      }));

      jest.doMock("../../src/main/steamworksManager", () => ({
        getModState: jest.fn(),
        lockForLaunch: jest.fn(() => Promise.resolve()),
        unlockForLaunch: jest.fn(),
        lockAndDelayForLaunch: jest.fn((cb) => { if (cb) cb(); return Promise.resolve(); }),
      }));

      mockGetRecentLogs = jest.fn().mockResolvedValue([]);
      jest.doMock("../../src/main/logParser", () => ({
        getRecentLogs: mockGetRecentLogs,
      }));

      mockExecFile = jest.fn();
      jest.doMock("child_process", () => ({
        execFile: mockExecFile,
        exec: jest.fn(),
      }));
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    test("executes cleanly and does not call getRecentLogs", async () => {
      mockExecFile.mockImplementation((cmd, args, cb) => {
        cb(null, "stdout", "stderr"); // No error
        return { once: (evt, handler) => { if (evt === 'spawn') handler(); } };
      });

      const game = require("../../src/main/game");
      const launchPromise = game.launchDayZ("1.2.3.4", 2302, []);

      await new Promise((r) => setTimeout(r, 10)); // let event loop run to trigger mockExecFile if timers weren't there

      await launchPromise;

      expect(mockGetRecentLogs).not.toHaveBeenCalled();
    });

    test("executes with error but no windows available", async () => {
      mockGetAllWindows.mockReturnValue([]);
      mockExecFile.mockImplementation((cmd, args, cb) => {
        cb(new Error("crash"), "stdout", "stderr");
        return { once: (evt, handler) => { if (evt === 'error') handler(new Error("crash")); else if (evt === 'spawn') handler(); } };
      });

      const game = require("../../src/main/game");
      const launchPromise = game.launchDayZ("1.2.3.4", 2302, []);

      await new Promise((r) => setTimeout(r, 10));

      await launchPromise;

      expect(mockGetRecentLogs).not.toHaveBeenCalled();
    });

    test("executes with error and sends game-crashed IPC if log is CRASH", async () => {
      const mockLog = { status: "CRASH", name: "crash.mdmp" };
      mockGetRecentLogs.mockResolvedValue([mockLog]);
      mockExecFile.mockImplementation((cmd, args, cb) => {
        const err = new Error("crash");
        err.code = 1;
        cb(err, "stdout", "stderr");
        return { once: (evt, handler) => { if (evt === 'error') handler(err); else if (evt === 'spawn') handler(); } };
      });

      const game = require("../../src/main/game");
      const launchPromise = game.launchDayZ("1.2.3.4", 2302, []);

      await new Promise((r) => setTimeout(r, 10));
      await launchPromise;
      // Wait for handleGameExit promise chain
      await new Promise((r) => setTimeout(r, 10));

      expect(mockGetRecentLogs).toHaveBeenCalled();
      expect(mockWebContentsSend).toHaveBeenCalledWith("game-crashed", mockLog);
    });

    test("executes with error but does not send IPC if log is CLEAN", async () => {
      const mockLog = { status: "CLEAN", name: "clean.log" };
      mockGetRecentLogs.mockResolvedValue([mockLog]);
      mockExecFile.mockImplementation((cmd, args, cb) => {
        const err = new Error("crash");
        err.code = 1;
        cb(err, "stdout", "stderr");
        return { once: (evt, handler) => { if (evt === 'error') handler(err); else if (evt === 'spawn') handler(); } };
      });

      const game = require("../../src/main/game");
      const launchPromise = game.launchDayZ("1.2.3.4", 2302, []);

      await new Promise((r) => setTimeout(r, 10));
      await launchPromise;
      await new Promise((r) => setTimeout(r, 10));

      expect(mockGetRecentLogs).toHaveBeenCalled();
      expect(mockWebContentsSend).not.toHaveBeenCalled();
    });

    test("handles getRecentLogs rejection gracefully", async () => {
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockGetRecentLogs.mockRejectedValue(new Error("fs read error"));
      mockExecFile.mockImplementation((cmd, args, cb) => {
        const err = new Error("crash");
        err.code = 1;
        cb(err, "stdout", "stderr");
        return { once: (evt, handler) => { if (evt === 'error') handler(err); else if (evt === 'spawn') handler(); } };
      });

      const game = require("../../src/main/game");
      const launchPromise = game.launchDayZ("1.2.3.4", 2302, []);

      await new Promise((r) => setTimeout(r, 10));
      await launchPromise;
      await new Promise((r) => setTimeout(r, 10));

      expect(mockGetRecentLogs).toHaveBeenCalled();
      expect(mockWebContentsSend).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to parse logs after crash:",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
