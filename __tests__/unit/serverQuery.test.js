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
    try {
      const sqPath = require.resolve("../../src/main/serverQuery");
      const sq = require.cache[sqPath]?.exports;
      if (sq && typeof sq.getCacheWriteQueue === "function") {
        await sq.getCacheWriteQueue();
      }
    } catch {
      // Ignore resolution errors if module wasn't loaded
    }
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

  describe("port candidate selection", () => {
    // serverQuery chooses its cache dir via process.versions.electron, which is
    // unset under Jest — force the electron branch so tests use the mocked
    // userData path (tmpDir) instead of the real ~/.config/dzlinux.
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

    const onlineState = {
      ping: 42,
      players: [{ name: "p1" }],
      maxplayers: 60,
      name: "S",
      raw: { numplayers: 1, dayzMods: null, tags: [], rules: {} },
    };

    function loadFreshServerQuery() {
      jest.resetModules();
      const mockElectron = { app: { getPath: jest.fn(() => tmpDir) } };
      jest.doMock("electron", () => mockElectron, { virtual: true });
      const mockGameDig = { GameDig: { query: jest.fn() } };
      jest.doMock("gamedig", () => mockGameDig);
      const serverQuery = require("../../src/main/serverQuery");
      return { serverQuery, mockGameDig };
    }

    function seedCacheFile(entries) {
      fs.writeFileSync(
        path.join(tmpDir, "query_port_cache.json"),
        JSON.stringify({ timestamp: Date.now(), entries }),
      );
    }

    function triedPorts(mockGameDig) {
      return mockGameDig.GameDig.query.mock.calls.map((call) => call[0].port);
    }

    test("tries CDN queryPort before cached port and skips the offset scan", async () => {
      const { serverQuery, mockGameDig } = loadFreshServerQuery();
      seedCacheFile({
        "1.2.3.4:2302": { port: 27015, timestamp: Date.now() },
      });
      mockGameDig.GameDig.query.mockRejectedValue(new Error("timeout"));

      const result = await serverQuery.pingServer("1.2.3.4", 2302, 2303);

      expect(result).toBeNull();
      expect(triedPorts(mockGameDig)).toEqual([2303, 27015]);
    });

    test("scans game port, offsets +1/+2/+3, then 27016 when no port is known", async () => {
      const { serverQuery, mockGameDig } = loadFreshServerQuery();
      mockGameDig.GameDig.query.mockRejectedValue(new Error("timeout"));

      await serverQuery.pingServer("2.2.2.2", 2302);

      expect(triedPorts(mockGameDig)).toEqual([2302, 2303, 2304, 2305, 27016]);
    });

    test("deduplicates the 27016 fallback when it appears in the offsets", async () => {
      const { serverQuery, mockGameDig } = loadFreshServerQuery();
      mockGameDig.GameDig.query.mockRejectedValue(new Error("timeout"));

      await serverQuery.pingServer("2.2.2.2", 27015);

      expect(triedPorts(mockGameDig)).toEqual([27015, 27016, 27017, 27018]);
    });

    test("ignores out-of-range CDN queryPorts", async () => {
      const { serverQuery, mockGameDig } = loadFreshServerQuery();
      mockGameDig.GameDig.query.mockRejectedValue(new Error("timeout"));

      await serverQuery.pingServer("3.3.3.3", 2302, 70000);

      expect(triedPorts(mockGameDig)).toEqual([2302, 2303, 2304, 2305, 27016]);
    });

    test("evicts a stale cached port after failure and rescans on the next call", async () => {
      const { serverQuery, mockGameDig } = loadFreshServerQuery();
      seedCacheFile({
        "4.4.4.4:2302": { port: 27015, timestamp: Date.now() },
      });
      mockGameDig.GameDig.query.mockRejectedValue(new Error("timeout"));

      await serverQuery.pingServer("4.4.4.4", 2302);
      expect(triedPorts(mockGameDig)).toEqual([27015]);

      mockGameDig.GameDig.query.mockClear();
      await serverQuery.pingServer("4.4.4.4", 2302);
      expect(triedPorts(mockGameDig)).toEqual([2302, 2303, 2304, 2305, 27016]);
    });


    test("persists the working query port to the cache file", async () => {
      const { serverQuery, mockGameDig } = loadFreshServerQuery();
      mockGameDig.GameDig.query.mockImplementation(({ port }) =>
        port === 2303
          ? Promise.resolve(onlineState)
          : Promise.reject(new Error("timeout")),
      );

      const result = await serverQuery.pingServer("5.5.5.5", 2302, 2303);

      expect(result).toBeTruthy();
      expect(mockGameDig.GameDig.query).toHaveBeenCalledTimes(1);
      await serverQuery.getCacheWriteQueue();
      const written = JSON.parse(
        fs.readFileSync(path.join(tmpDir, "query_port_cache.json"), "utf8"),
      );
      expect(written.entries["5.5.5.5:2302"].port).toBe(2303);
    });

    test("falls back to raw.numplayers when the players array is missing", async () => {
      const { serverQuery, mockGameDig } = loadFreshServerQuery();
      mockGameDig.GameDig.query.mockResolvedValue({
        ...onlineState,
        players: null,
        raw: { numplayers: 7, dayzMods: null, tags: [], rules: {} },
      });

      const result = await serverQuery.pingServer("6.6.6.6", 2302, 2303);

      expect(result.players).toBe(7);
    });

    test("falls back to raw.rules.island when state.map is empty", async () => {
      const { serverQuery, mockGameDig } = loadFreshServerQuery();
      mockGameDig.GameDig.query.mockResolvedValue({
        ...onlineState,
        map: "",
        raw: {
          numplayers: 1,
          dayzMods: null,
          tags: [],
          rules: { island: "chernarusplus" },
        },
      });

      const result = await serverQuery.pingServer("6.6.6.6", 2302, 2303);

      expect(result.map).toBe("chernarusplus");
    });

    test("caps the cache at 5000 entries, evicting the oldest", async () => {
      const { serverQuery, mockGameDig } = loadFreshServerQuery();
      const entries = {};
      for (let i = 0; i < 5000; i++) {
        entries[`s${String(i).padStart(5, "0")}:2302`] = {
          port: 27015,
          timestamp: Date.now(),
        };
      }
      seedCacheFile(entries);
      mockGameDig.GameDig.query.mockResolvedValue(onlineState);

      await serverQuery.pingServer("newsrv", 2302);
      await serverQuery.getCacheWriteQueue();

      const written = JSON.parse(
        fs.readFileSync(path.join(tmpDir, "query_port_cache.json"), "utf8"),
      );
      expect(Object.keys(written.entries)).toHaveLength(5000);
      expect(written.entries["s00000:2302"]).toBeUndefined();
      expect(written.entries["s04999:2302"]).toBeDefined();
      expect(written.entries["newsrv:2302"].port).toBe(2302);
    });

    test("coalesces rapid cache saves into a single debounced write", async () => {
      const { serverQuery, mockGameDig } = loadFreshServerQuery();
      mockGameDig.GameDig.query.mockResolvedValue(onlineState);
      const renameSpy = jest.spyOn(fs.promises, "rename");

      try {
        await serverQuery.pingServer("7.7.7.7", 2302, 2303);
        await serverQuery.pingServer("7.7.7.8", 2302, 2303);
        await serverQuery.getCacheWriteQueue();

        expect(renameSpy).toHaveBeenCalledTimes(1);
        const written = JSON.parse(
          fs.readFileSync(path.join(tmpDir, "query_port_cache.json"), "utf8"),
        );
        expect(written.entries["7.7.7.7:2302"].port).toBe(2303);
        expect(written.entries["7.7.7.8:2302"].port).toBe(2303);
      } finally {
        renameSpy.mockRestore();
      }
    });
  });
});
