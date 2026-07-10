const {
  loadWatchlist,
  saveWatchlist,
  processWatchlistChecks,
  _clearCache,
} = require("../../src/main/watchlist");
const settingsManager = require("../../src/main/settings");
const { Notification: ElectronNotification, BrowserWindow } = require("electron");
const fs = require("fs");

jest.mock("../../src/main/settings", () => ({
  loadSettings: jest.fn(),
  saveSettings: jest.fn(),
}));

jest.mock(
  "electron",
  () => {
    const mNotification = jest.fn().mockImplementation(() => ({
      show: jest.fn(),
      on: jest.fn(),
    }));
    mNotification.isSupported = jest.fn().mockReturnValue(true);
    const mBrowserWindow = {
      getAllWindows: jest.fn().mockReturnValue([]),
    };
    const mApp = {
      getPath: jest.fn().mockReturnValue("/tmp"),
    };
    return { Notification: mNotification, BrowserWindow: mBrowserWindow, app: mApp };
  },
  { virtual: true },
);

jest.mock("fs", () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  promises: {
    writeFile: jest.fn().mockImplementation(() => Promise.resolve()),
    access: jest.fn(),
    readFile: jest.fn(),
  },
}));

describe("watchlist", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ElectronNotification.isSupported.mockReturnValue(true);
    _clearCache();
  });

  describe("loadWatchlist", () => {
    test("returns empty array when no watchlist file exists and settings is empty", async () => {
      fs.promises.access.mockRejectedValue(new Error("ENOENT"));
      settingsManager.loadSettings.mockReturnValue({});
      expect(await loadWatchlist()).toEqual([]);
    });

    test("returns watchlist from standalone file if it exists", async () => {
      const mockWatchlist = [{ ip: "1.2.3.4", port: 2302, active: true }];
      fs.promises.access.mockResolvedValue();
      fs.promises.readFile.mockResolvedValue(JSON.stringify(mockWatchlist));

      expect(await loadWatchlist()).toEqual(mockWatchlist);
      expect(fs.promises.readFile).toHaveBeenCalledWith(expect.stringContaining("watchlist.json"), "utf8");
    });

    test("migrates watchlist from settings if no standalone file exists", async () => {
      const mockWatchlist = [{ ip: "1.2.3.4", port: 2302, active: true }];
      fs.promises.access.mockRejectedValue(new Error("ENOENT"));
      settingsManager.loadSettings.mockReturnValue({
        watchlist: mockWatchlist,
        theme: "dark",
      });

      expect(await loadWatchlist()).toEqual(mockWatchlist);
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("watchlist.json"),
        JSON.stringify(mockWatchlist, null, 2),
        "utf8"
      );
      expect(settingsManager.saveSettings).toHaveBeenCalledWith({
        theme: "dark",
      });
    });
  });

  describe("saveWatchlist", () => {
    test("writes watchlist to standalone file", async () => {
      const mockWatchlist = [{ ip: "1.2.3.4", port: 2302, active: true }];

      const result = await saveWatchlist(mockWatchlist);

      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("watchlist.json"),
        JSON.stringify(mockWatchlist, null, 2),
        "utf8"
      );
      expect(result).toBe(true);
    });
  });

  describe("processWatchlistChecks", () => {
    let mockServers;
    let mockWatchlist;

    beforeEach(() => {
      mockServers = [
        {
          ip: "1.2.3.4",
          port: 2302,
          players: 40,
          status: "online",
          name: "Server 1",
        },
        {
          ip: "5.6.7.8",
          port: 2302,
          players: 60,
          status: "online",
          name: "Server 2",
        },
      ];
      mockWatchlist = [
        {
          ip: "1.2.3.4",
          port: 2302,
          active: true,
          threshold: 50,
          mode: "below",
          name: "Server 1",
        },
        {
          ip: "5.6.7.8",
          port: 2302,
          active: true,
          threshold: 50,
          mode: "above",
          name: "Server 2",
        },
      ];
      // Mock loadWatchlist to return our mockWatchlist
      fs.promises.access.mockResolvedValue();
      fs.promises.readFile.mockResolvedValue(JSON.stringify(mockWatchlist));
      settingsManager.loadSettings.mockReturnValue({
        watchlistThreshold: 50,
      });
    });

    test("triggers notification when threshold is met (below mode)", async () => {
      await processWatchlistChecks(mockServers);

      expect(ElectronNotification).toHaveBeenCalled();
      const notificationInstance = ElectronNotification.mock.results[0].value;
      expect(notificationInstance.show).toHaveBeenCalled();
      expect(ElectronNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "🟢 Server Slot Available",
          body: expect.stringContaining("40 players"),
        }),
      );

      expect(fs.promises.writeFile).toHaveBeenCalled();
      const writtenData = JSON.parse(fs.promises.writeFile.mock.calls[0][1]);
      expect(writtenData[0].lastStatus).toBe("notified");
    });

    test("triggers notification when threshold is met (above mode)", async () => {
      await processWatchlistChecks(mockServers);

      expect(ElectronNotification).toHaveBeenCalledTimes(2);
      expect(ElectronNotification).toHaveBeenLastCalledWith(
        expect.objectContaining({
          title: "🎯 Population Target Reached",
          body: expect.stringContaining("60 players"),
        }),
      );

      expect(fs.promises.writeFile).toHaveBeenCalled();
      const writtenData = JSON.parse(fs.promises.writeFile.mock.calls[0][1]);
      expect(writtenData[1].lastStatus).toBe("notified");
    });

    test("does not trigger notification if already notified", async () => {
      mockWatchlist[0].lastStatus = "notified";
      fs.promises.readFile.mockResolvedValue(JSON.stringify(mockWatchlist));

      await processWatchlistChecks(mockServers);

      // Only server 2 should trigger
      expect(ElectronNotification).toHaveBeenCalledTimes(1);
      expect(ElectronNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: "🎯 Population Target Reached" }),
      );
    });

    test("resets status to idle when threshold is no longer met", async () => {
      mockWatchlist[0].lastStatus = "notified";
      fs.promises.readFile.mockResolvedValue(JSON.stringify(mockWatchlist));
      mockServers[0].players = 60; // No longer <= 50

      await processWatchlistChecks(mockServers);

      expect(fs.promises.writeFile).toHaveBeenCalled();
      const writtenData = JSON.parse(fs.promises.writeFile.mock.calls[0][1]);
      expect(writtenData[0].lastStatus).toBe("idle");
    });

    test("uses global threshold if local threshold is missing", async () => {
      delete mockWatchlist[0].threshold;
      fs.promises.readFile.mockResolvedValue(JSON.stringify(mockWatchlist));
      settingsManager.loadSettings.mockReturnValue({
        watchlistThreshold: 45,
      });

      mockServers[0].players = 45;
      await processWatchlistChecks(mockServers);

      expect(ElectronNotification).toHaveBeenCalled();
    });

    test("skips inactive watchlist items", async () => {
      mockWatchlist[0].active = false;
      fs.promises.readFile.mockResolvedValue(JSON.stringify(mockWatchlist));

      await processWatchlistChecks(mockServers);

      expect(ElectronNotification).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: "🟢 Server Slot Available" }),
      );
    });

    test("does nothing if ElectronNotification is not supported", async () => {
      ElectronNotification.isSupported.mockReturnValue(false);

      await processWatchlistChecks(mockServers);

      expect(ElectronNotification).not.toHaveBeenCalledWith(expect.any(Object));
    });

    test("handles boundary cases exactly at threshold", async () => {
      mockServers[0].players = 50; // exactly threshold (below mode: 50 <= 50 -> true)
      mockServers[1].players = 50; // exactly threshold (above mode: 50 >= 50 -> true)

      await processWatchlistChecks(mockServers);

      expect(ElectronNotification).toHaveBeenCalledTimes(2);
      expect(fs.promises.writeFile).toHaveBeenCalled();
      const writtenData = JSON.parse(fs.promises.writeFile.mock.calls[0][1]);
      expect(writtenData[0].lastStatus).toBe("notified");
      expect(writtenData[1].lastStatus).toBe("notified");
    });

    test("handles ElectronNotification.show failure gracefully", async () => {
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Re-mock ElectronNotification.show just for this test
      const mockShow = jest.fn().mockImplementation(() => {
        throw new Error("Test show error");
      });
      ElectronNotification.mockImplementationOnce(() => ({
        show: mockShow,
        on: jest.fn(),
      }));

      await processWatchlistChecks(mockServers);

      expect(mockShow).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Watchlist] Notification.show failed:",
        "Test show error",
      );

      consoleSpy.mockRestore();
    });

    test("notification click restores and focuses all windows", async () => {
      const mockWebContents = { send: jest.fn() };
      const mockWindow = {
        isMinimized: jest.fn().mockReturnValue(true),
        restore: jest.fn(),
        show: jest.fn(),
        focus: jest.fn(),
        webContents: mockWebContents,
      };
      BrowserWindow.getAllWindows.mockReturnValue([mockWindow]);

      await processWatchlistChecks(mockServers);

      const notificationInstance = ElectronNotification.mock.results[0].value;
      const clickCall = notificationInstance.on.mock.calls.find(
        (call) => call[0] === "click",
      );
      if (clickCall) {
        const clickHandler = clickCall[1];
        clickHandler();
      }

      expect(mockWindow.restore).toHaveBeenCalled();
      expect(mockWindow.show).toHaveBeenCalled();
      expect(mockWindow.focus).toHaveBeenCalled();
      expect(mockWebContents.send).toHaveBeenCalledWith("open-watchlist");
    });
  });
});
