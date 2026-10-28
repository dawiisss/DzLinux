const _fs = require("fs");
const _path = require("path");
const _os = require("os");

describe("servers", () => {
  beforeEach(() => {
    jest.resetModules();
    _fs.rmSync("/tmp/dzlinux-test-data", { recursive: true, force: true });

    jest.doMock(
      "electron",
      () => ({
        app: { getPath: jest.fn(() => "/tmp/dzlinux-test-data") },
      }),
      { virtual: true },
    );
  });

  describe("axiosGetWithRetry", () => {
    test("returns data on first attempt", async () => {
      const mockAxios = { get: jest.fn().mockResolvedValue({ data: "ok" }) };
      jest.doMock("axios", () => mockAxios);

      const servers = require("../../src/main/servers");
      const result = await servers.axiosGetWithRetry("https://example.com");
      expect(result.data).toBe("ok");
      expect(mockAxios.get).toHaveBeenCalledTimes(1);
    });

    test("retries on failure and succeeds", async () => {
      const mockAxios = {
        get: jest
          .fn()
          .mockRejectedValueOnce(new Error("timeout"))
          .mockResolvedValueOnce({ data: "ok" }),
      };
      jest.doMock("axios", () => mockAxios);

      const servers = require("../../src/main/servers");
      const result = await servers.axiosGetWithRetry(
        "https://example.com",
        {},
        2,
      );
      expect(result.data).toBe("ok");
      expect(mockAxios.get).toHaveBeenCalledTimes(2);
    });

    test("throws after all retries exhausted", async () => {
      const mockAxios = {
        get: jest.fn().mockRejectedValue(new Error("timeout")),
      };
      jest.doMock("axios", () => mockAxios);

      const servers = require("../../src/main/servers");
      await expect(
        servers.axiosGetWithRetry("https://example.com", {}, 2),
      ).rejects.toThrow("timeout");
      expect(mockAxios.get).toHaveBeenCalledTimes(2);
    });
  });

  describe("fetchDayZServers", () => {
    test.each([
      ["a null entry", [null], 0],
      ["a non-array string", "invalid favorites", 0],
      ["a non-array object", { length: 1 }, 0],
      ["mixed valid and invalid entries", [null, {}, false, { ip: "bad address", port: 2302 }, { ip: "3.4.5.6", port: true }, { ip: "4.5.6.7", port: 2302, queryPort: "bad" }, { ip: "3.4.5.6", port: 2302 }], 1],
      ["mixed legacy entries", [null, "3.4.5.6:2302", "invalid"], 1],
      ["duplicate entries", [null, { ip: "3.4.5.6", port: 2302 }, "3.4.5.6:2302"], 1],
    ])("keeps hosted and custom servers when Favorites contains %s", async (_label, favorites, placeholderCount) => {
      const directory = "/tmp/dzlinux-test-data";
      _fs.mkdirSync(directory, { recursive: true });
      const settingsFile = _path.join(directory, "settings.json");
      const original = JSON.stringify({ favorites, modDirectory: "/workshop", enableTrustScore: false });
      _fs.writeFileSync(settingsFile, original);
      _fs.writeFileSync(_path.join(directory, "custom_servers.json"), JSON.stringify([{ ip: "2.3.4.5", port: 2302, name: "Local server" }]));
      jest.doMock("axios", () => ({ get: jest.fn(async url => ({
        data: url.endsWith("hosted_servers.json") ? [{ ip: "1.2.3.4", port: 2302, name: "Hosted server" }] : [],
      })) }));

      const servers = require("../../src/main/servers");
      const batch = jest.fn();
      const result = await servers.fetchDayZServers(batch);
      expect(result).toHaveLength(2 + placeholderCount);
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ ip: "1.2.3.4", name: "Hosted server" }),
        expect.objectContaining({ ip: "2.3.4.5", name: "Local server" }),
      ]));
      expect(batch).toHaveBeenCalledWith(result, undefined);
      expect(_fs.readFileSync(settingsFile, "utf8")).toBe(original);
      const cached = await servers.fetchDayZServers();
      const measurements = entries => entries.map(({ ip, port, name, reportedPlayers, reportedCapacity }) => ({ ip, port, name, reportedPlayers, reportedCapacity }));
      expect(measurements(cached)).toEqual(measurements(result));
      expect(cached.filter(entry => entry.isFavoritePlaceholder)).toHaveLength(placeholderCount);
      expect(result.every(entry => entry.reportedPlayers === null && entry.reportedCapacity === null)).toBe(true);
    });

    test.each([
      ["old display-only cache", {}, null, null],
      ["explicit unknown values", { reportedPlayers: null, reportedCapacity: null }, null, null],
      ["a reported empty server", { reportedPlayers: 0, reportedCapacity: 60 }, 0, 60],
      ["reported values differing from display defaults", { reportedPlayers: 17, reportedCapacity: 80 }, 17, 80],
    ])("retains measurement provenance in %s", async (_label, reported, reportedPlayers, reportedCapacity) => {
      const directory = "/tmp/dzlinux-test-data";
      _fs.mkdirSync(directory, { recursive: true });
      _fs.writeFileSync(_path.join(directory, "server_cache.json"), JSON.stringify({
        schemaVersion: 2, timestamp: Date.now(),
        servers: [{ ip: "1.2.3.4", port: 2302, name: "Cached server", players: 0, maxPlayers: 60, ...reported }],
      }));
      const result = await require("../../src/main/servers").fetchDayZServers();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ players: 0, maxPlayers: 60, reportedPlayers, reportedCapacity });
    });

    test("returns empty array when both CDNs fail", async () => {
      const mockAxios = { get: jest.fn().mockRejectedValue(new Error("fail")) };
      jest.doMock("axios", () => mockAxios);

      const servers = require("../../src/main/servers");
      const result = await servers.fetchDayZServers();
      expect(result).toEqual([]);
      await new Promise((r) => setTimeout(r, 100));
    });

    test("fetches servers from primary CDN", async () => {
      const mockServers = [{ ip: "1.2.3.4", port: 2302, name: "Test Server" }];
      const mockAxios = {
        get: jest
          .fn()
          .mockResolvedValueOnce({ data: mockServers })
          .mockResolvedValueOnce({ data: "<html></html>" }),
      };
      jest.doMock("axios", () => mockAxios);

      const servers = require("../../src/main/servers");
      const batchSpy = jest.fn();
      const result = await servers.fetchDayZServers(batchSpy);

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(batchSpy).toHaveBeenCalled();
      await new Promise((r) => setTimeout(r, 100));
    });

    test("falls back to GitHub CDN when primary fails", async () => {
      const mockServers = [
        { ip: "5.6.7.8", port: 2302, name: "Fallback Server" },
      ];
      const mockAxios = {
        get: jest
          .fn()
          .mockRejectedValueOnce(new Error("CDN fail"))
          .mockRejectedValueOnce(new Error("CDN fail"))
          .mockResolvedValueOnce({ data: mockServers })
          .mockResolvedValueOnce({ data: "<html></html>" }),
      };
      jest.doMock("axios", () => mockAxios);

      const servers = require("../../src/main/servers");
      const result = await servers.fetchDayZServers();
      expect(result.length).toBeGreaterThanOrEqual(1);
      await new Promise((r) => setTimeout(r, 100));
    });

    test("R09: warm cache reflects favorite additions/removals and trust score toggles without refetching hosted list", async () => {
      const directory = "/tmp/dzlinux-test-data";
      _fs.mkdirSync(directory, { recursive: true });
      const settingsFile = _path.join(directory, "settings.json");
      const cacheFile = _path.join(directory, "server_cache.json");

      _fs.writeFileSync(
        settingsFile,
        JSON.stringify({
          favorites: [{ ip: "9.9.9.9", port: 2302, name: "Fav One" }],
          modDirectory: "/workshop",
          enableTrustScore: false,
        }),
      );
      _fs.writeFileSync(
        _path.join(directory, "custom_servers.json"),
        JSON.stringify([{ ip: "2.3.4.5", port: 2302, name: "Local server" }]),
      );

      const mockGet = jest.fn(async (url) => {
        if (url.endsWith("hosted_servers.json")) {
          return {
            data: [{ ip: "1.2.3.4", port: 2302, name: "Hosted server" }],
          };
        }
        if (url.endsWith("monetized_ips.json")) {
          return { data: ["1.2.3.4:2302", "9.9.9.9:2302", "8.8.8.8:2402"] };
        }
        if (url.endsWith("verified_ips.json")) {
          return {
            data: {
              verified_servers: [
                { ip: "1.2.3.4", port: 2302, community: "DayOne" },
              ],
            },
          };
        }
        return { data: [] };
      });
      jest.doMock("axios", () => ({ get: mockGet }));

      const settingsManager = require("../../src/main/settings");
      const servers = require("../../src/main/servers");

      // 1. Cold fetch: 1 hosted + 1 local + 1 fav placeholder, trust score disabled
      const first = await servers.fetchDayZServers(1);
      expect(first).toHaveLength(3);
      expect(first.filter((s) => s.isFavoritePlaceholder)).toHaveLength(1);
      expect(first.find((s) => s.ip === "9.9.9.9").name).toBe("Fav One");
      expect(first.find((s) => s.ip === "1.2.3.4").verifiedCommunity).toBeUndefined();
      expect(first.find((s) => s.ip === "1.2.3.4").monetized).toBe(true);
      expect(first.find((s) => s.ip === "9.9.9.9").monetized).toBe(true);
      expect(first.find((s) => s.ip === "2.3.4.5").monetized).toBeUndefined();

      // Verify on-disk cache excludes favorite placeholders and verifiedCommunity
      const persistedCache = JSON.parse(_fs.readFileSync(cacheFile, "utf8"));
      const initialTimestamp = persistedCache.timestamp;
      expect(persistedCache.servers).toHaveLength(2);
      expect(persistedCache.servers.some((s) => s.isFavoritePlaceholder)).toBe(false);

      // 2. Warm cache: remove 9.9.9.9, add 8.8.8.8, and enable trust score
      await settingsManager.updateSettings((current) => {
        current.favorites = [{ ip: "8.8.8.8", port: 2402, name: "Fav Two" }];
        current.enableTrustScore = true;
      });
      mockGet.mockClear();

      const second = await servers.fetchDayZServers(2);
      expect(second).toHaveLength(3);
      expect(second.find((s) => s.ip === "9.9.9.9")).toBeUndefined();
      expect(second.find((s) => s.ip === "8.8.8.8")).toMatchObject({
        isFavoritePlaceholder: true,
        name: "Fav Two",
        port: 2402,
        monetized: true,
      });
      expect(second.find((s) => s.ip === "1.2.3.4").verifiedCommunity).toBe("DayOne");
      // Hosted list was NOT refetched on warm cache hit
      expect(
        mockGet.mock.calls.some(([url]) => url.endsWith("hosted_servers.json")),
      ).toBe(false);
      expect(
        mockGet.mock.calls.some(([url]) => url.endsWith("monetized_ips.json")),
      ).toBe(false);
      // Source cache timestamp was NOT refreshed on warm cache hit
      const afterSecondCache = JSON.parse(_fs.readFileSync(cacheFile, "utf8"));
      expect(afterSecondCache.timestamp).toBe(initialTimestamp);

      // 3. Warm cache: disable trust score again and clear favorites
      await settingsManager.updateSettings((current) => {
        current.favorites = [];
        current.enableTrustScore = false;
      });
      mockGet.mockClear();

      const third = await servers.fetchDayZServers(3);
      expect(third).toHaveLength(2);
      expect(third.some((s) => s.isFavoritePlaceholder)).toBe(false);
      expect(third.find((s) => s.ip === "1.2.3.4").verifiedCommunity).toBeUndefined();
      expect(mockGet).not.toHaveBeenCalled();
    });

    test("R09: strips legacy persisted favorite placeholders from v2 cache while preserving real customList servers", async () => {
      const directory = "/tmp/dzlinux-test-data";
      _fs.mkdirSync(directory, { recursive: true });
      _fs.writeFileSync(
        _path.join(directory, "settings.json"),
        JSON.stringify({
          favorites: [],
          modDirectory: "/workshop",
          enableTrustScore: false,
        }),
      );
      _fs.writeFileSync(
        _path.join(directory, "server_cache.json"),
        JSON.stringify({
          schemaVersion: 2,
          timestamp: Date.now(),
          servers: [
            {
              ip: "9.9.9.9",
              port: 2302,
              name: "Old Cached Favorite",
              isFavoritePlaceholder: true,
              customList: true,
            },
            {
              ip: "1.2.3.4",
              port: 2302,
              name: "Real Hosted Server",
              customList: true,
              verifiedCommunity: "StaleCommunity",
            },
          ],
        }),
      );

      const servers = require("../../src/main/servers");
      const result = await servers.fetchDayZServers(1);
      expect(result).toHaveLength(1);
      expect(result[0].ip).toBe("1.2.3.4");
      expect(result[0].verifiedCommunity).toBeUndefined();
    });
  });
});
