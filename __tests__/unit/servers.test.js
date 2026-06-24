const _fs = require("fs");
const _path = require("path");
const _os = require("os");

describe("servers", () => {
  beforeEach(() => {
    jest.resetModules();

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
