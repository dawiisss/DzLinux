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
  });
});
