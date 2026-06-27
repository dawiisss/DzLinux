const fs = require("fs");
const path = require("path");
const os = require("os");

describe("serverQuery", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dzlinux-query-"));
    jest.resetModules();

    jest.mock(
      "electron",
      () => ({
        app: { getPath: jest.fn(() => "/tmp/dzlinux-query-test") },
      }),
      { virtual: true },
    );

    jest.mock("gamedig", () => ({
      GameDig: { query: jest.fn() },
    }));
  });

  afterEach(async () => {
    // Wait for any pending cache writes to finish before deleting the temp directory
    await new Promise((r) => setTimeout(r, 20));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("pingServer", () => {
    test("returns server info on success", async () => {
      const { GameDig } = require("gamedig");
      GameDig.query.mockResolvedValueOnce({
        ping: 50,
        players: [{ name: "player1" }, { name: "player2" }],
        maxplayers: 60,
        name: "Test Server",
        password: true,
        raw: {
          numplayers: 2,
          dayzMods: [{ workshopId: "12345", title: "Test Mod" }],
          tags: ["mod", "3rd"],
          rules: { island: "chernarusplus" },
        },
      });

      const serverQuery = require("../../src/main/serverQuery");
      const result = await serverQuery.pingServer("1.2.3.4", 2302, 2303);
      expect(result).toBeTruthy();
      expect(result.ping).toBe(50);
      expect(result.players).toBe(2);
      expect(result.maxPlayers).toBe(60);
      expect(result.name).toBe("Test Server");
      expect(result.status).toBe("online");
      expect(result.password).toBe(true);
    });

    test("returns null when all ports fail", async () => {
      const { GameDig } = require("gamedig");
      GameDig.query.mockRejectedValue(new Error("timeout"));

      const serverQuery = require("../../src/main/serverQuery");
      const result = await serverQuery.pingServer("1.2.3.4", 2302, 2303);
      expect(result).toBeNull();
    });

    test("extracts mods from dayzMods", async () => {
      const { GameDig } = require("gamedig");
      GameDig.query.mockResolvedValueOnce({
        ping: 30,
        players: [],
        maxplayers: 60,
        name: "Modded Server",
        raw: {
          numplayers: 0,
          dayzMods: [
            { workshopId: "111", title: "Mod A" },
            { workshopId: "222", title: "Mod B" },
          ],
          tags: ["mod"],
          rules: {},
        },
      });

      const serverQuery = require("../../src/main/serverQuery");
      const result = await serverQuery.pingServer("1.2.3.4", 2302, 2303);
      expect(result.mods).toHaveLength(2);
      expect(result.mods[0]).toEqual({ id: "111", name: "Mod A" });
      expect(result.mods[1]).toEqual({ id: "222", name: "Mod B" });
    });

    test("detects third person setting from tags", async () => {
      const { GameDig } = require("gamedig");
      GameDig.query.mockResolvedValueOnce({
        ping: 30,
        players: [],
        maxplayers: 60,
        name: "Server",
        raw: { numplayers: 0, dayzMods: null, tags: ["no3rd"], rules: {} },
      });

      const serverQuery = require("../../src/main/serverQuery");
      const result = await serverQuery.pingServer("1.2.3.4", 2302, 2303);
      expect(result.thirdPerson).toBe(false);
    });

    test("detects modded from tags", async () => {
      const { GameDig } = require("gamedig");
      GameDig.query.mockResolvedValueOnce({
        ping: 30,
        players: [],
        maxplayers: 60,
        name: "Server",
        raw: { numplayers: 0, dayzMods: null, tags: ["mod"], rules: {} },
      });

      const serverQuery = require("../../src/main/serverQuery");
      const result = await serverQuery.pingServer("1.2.3.4", 2302, 2303);
      expect(result.modded).toBe(true);
    });

    test("extracts time from tags", async () => {
      const { GameDig } = require("gamedig");
      GameDig.query.mockResolvedValueOnce({
        ping: 30,
        players: [],
        maxplayers: 60,
        name: "Server",
        raw: {
          numplayers: 0,
          dayzMods: null,
          tags: ["12:30", "mod"],
          rules: {},
        },
      });

      const serverQuery = require("../../src/main/serverQuery");
      const result = await serverQuery.pingServer("1.2.3.4", 2302, 2303);
      expect(result.time).toBe("12:30");
    });
  });

  describe("cache operations (error states)", () => {
    let originalElectronVersion;

    beforeEach(() => {
      originalElectronVersion = process.versions.electron;
      Object.defineProperty(process.versions, "electron", {
        value: "1.0.0",
        configurable: true,
      });
    });

    afterEach(() => {
      if (originalElectronVersion === undefined) {
        delete process.versions.electron;
      } else {
        Object.defineProperty(process.versions, "electron", {
          value: originalElectronVersion,
          configurable: true,
        });
      }
    });

    test("recovers from corrupt cache file on load", () => {
      jest.resetModules();

      const mockElectron = { app: { getPath: jest.fn(() => tmpDir) } };
      jest.doMock("electron", () => mockElectron, { virtual: true });

      const cacheFile = require("path").join(tmpDir, "query_port_cache.json");
      fs.writeFileSync(cacheFile, "invalid json");

      const serverQuery = require("../../src/main/serverQuery");
      expect(serverQuery).toBeDefined();
    });

    test("gracefully ignores cache write failures on permission denied", async () => {
      jest.resetModules();

      const mockElectron = { app: { getPath: jest.fn(() => tmpDir) } };
      jest.doMock("electron", () => mockElectron, { virtual: true });

      const mockGameDig = { GameDig: { query: jest.fn() } };
      jest.doMock("gamedig", () => mockGameDig);

      const serverQuery = require("../../src/main/serverQuery");

      mockGameDig.GameDig.query.mockResolvedValueOnce({
        ping: 50,
        players: [],
        maxplayers: 60,
        name: "S",
        raw: { numplayers: 0, dayzMods: null, tags: [], rules: {} },
      });

      const writeSpy = jest
        .spyOn(fs.promises, "writeFile")
        .mockRejectedValue(new Error("EACCES"));

      try {
        const result = await serverQuery.pingServer("6.6.6.6", 2302, 2303);
        expect(result).toBeTruthy();

        await serverQuery.getCacheWriteQueue();
        expect(writeSpy).toHaveBeenCalled();
      } finally {
        writeSpy.mockRestore();
      }
    });

    test("gracefully ignores cache delete failures on permission denied", async () => {
      jest.resetModules();

      const mockElectron = { app: { getPath: jest.fn(() => tmpDir) } };
      jest.doMock("electron", () => mockElectron, { virtual: true });

      const mockGameDig = { GameDig: { query: jest.fn() } };
      jest.doMock("gamedig", () => mockGameDig);

      const serverQuery = require("../../src/main/serverQuery");

      mockGameDig.GameDig.query.mockResolvedValueOnce({
        ping: 50,
        players: [],
        maxplayers: 60,
        name: "S",
        raw: { numplayers: 0, dayzMods: null, tags: [], rules: {} },
      });

      await serverQuery.pingServer("6.6.6.6", 2302, 2303);

      await serverQuery.getCacheWriteQueue();

      mockGameDig.GameDig.query.mockRejectedValue(new Error("timeout"));
      const writeSpy = jest
        .spyOn(fs.promises, "writeFile")
        .mockRejectedValue(new Error("EACCES"));

      try {
        await serverQuery.pingServer("6.6.6.6", 2302);

        await serverQuery.getCacheWriteQueue();
        expect(writeSpy).toHaveBeenCalled();
      } finally {
        writeSpy.mockRestore();
      }
    });

    test("evicts stale cache entries correctly and uses valid ones", async () => {
      jest.resetModules();

      const mockElectron = { app: { getPath: jest.fn(() => tmpDir) } };
      jest.doMock("electron", () => mockElectron, { virtual: true });

      const mockGameDig = { GameDig: { query: jest.fn() } };
      jest.doMock("gamedig", () => mockGameDig);

      const cacheFile = require("path").join(tmpDir, "query_port_cache.json");
      const now = Date.now();
      fs.writeFileSync(
        cacheFile,
        JSON.stringify({
          timestamp: now,
          entries: {
            "7.7.7.7:2302": {
              port: 27015,
              timestamp: now - 31 * 24 * 60 * 60 * 1000,
            }, // Stale
            "8.8.8.8:2302": { port: 27016, timestamp: now - 1000 }, // Valid
          },
        }),
      );

      const serverQuery = require("../../src/main/serverQuery");

      mockGameDig.GameDig.query.mockRejectedValue(new Error("timeout"));
      await serverQuery.pingServer("7.7.7.7", 2302);
      expect(mockGameDig.GameDig.query).not.toHaveBeenCalledWith(
        expect.objectContaining({ port: 27015 }),
      );

      mockGameDig.GameDig.query.mockClear();
      mockGameDig.GameDig.query.mockRejectedValue(new Error("timeout"));

      await serverQuery.pingServer("8.8.8.8", 2302);
      expect(mockGameDig.GameDig.query).toHaveBeenCalledWith(
        expect.objectContaining({ port: 27016 }),
      );
    });
  });
});
