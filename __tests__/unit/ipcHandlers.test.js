describe("ipcHandlers", () => {
  let handlers;
  let listeners;
  let mockSettings;
  let mockServers;
  let mockGame;
  let mockServerQuery;
  let mockModManager;
  let mockUpdater;
  let mockLogParser;
  let mockSteamworks;
  let mockDepResolver;
  let mockWatchlist;
  let mockSystemCheck;
  let mockRealpath;
  let mockFsAccess;
  let mockExecFile;
  let mockShell;
  let event;

  beforeEach(() => {
    jest.resetModules();
    handlers = new Map();
    listeners = new Map();

    mockSettings = {
      loadSettingsAsync: jest.fn().mockResolvedValue({ modDirectory: "/mod/dir" }),
      saveSettings: jest.fn().mockResolvedValue(true),
      getDefaultSettings: jest.fn(() => ({ theme: "tactical-dark" })),
    };
    mockServers = {
      fetchDayZServers: jest.fn().mockResolvedValue([]),
      refreshServerModCache: jest
        .fn()
        .mockResolvedValue({ mods: [{ id: "1", name: "M" }] }),
    };
    mockGame = {
      checkMods: jest.fn().mockResolvedValue({ missingMods: [], hasAllMods: true }),
      launchDayZ: jest.fn().mockResolvedValue(),
      openWorkshopPage: jest.fn(),
      scanProtonVersions: jest.fn().mockResolvedValue([]),
      checkGameMode: jest.fn().mockResolvedValue(true),
    };
    mockServerQuery = {
      pingServer: jest.fn().mockResolvedValue({ ping: 10 }),
      queryServerGameDig: jest
        .fn()
        .mockResolvedValue({ mods: [{ id: "123", name: "Mod" }] }),
    };
    mockModManager = {
      getInstalledMods: jest.fn().mockResolvedValue([{ id: "123" }]),
      checkModUpdates: jest.fn().mockResolvedValue([]),
      checkModUpdatesDetailed: jest.fn().mockResolvedValue({ outdatedMods: [] }),
      deleteMod: jest.fn().mockResolvedValue(true),
      openModFolder: jest.fn().mockResolvedValue(true),
    };
    mockUpdater = {
      autoUpdater: {
        downloadUpdate: jest.fn().mockResolvedValue(),
        quitAndInstall: jest.fn(),
      },
      checkForUpdates: jest.fn().mockResolvedValue({ kind: "none" }),
      isSystemInstall: jest.fn(() => false),
    };
    mockLogParser = {
      getRecentLogs: jest.fn().mockResolvedValue([{ status: "CLEAN" }]),
      getSessionSummary: jest.fn().mockResolvedValue({ crashes: 0 }),
    };
    mockSteamworks = {
      getUserProfile: jest.fn().mockResolvedValue({ name: "user" }),
      subscribeMod: jest.fn().mockResolvedValue(),
      unsubscribeMod: jest.fn().mockResolvedValue(),
      getDownloadProgress: jest.fn().mockResolvedValue(0.5),
      getModState: jest.fn().mockResolvedValue(4),
    };
    mockDepResolver = {
      resolveDependencies: jest.fn().mockResolvedValue({ tree: [] }),
      resolveBatchDependencies: jest.fn().mockResolvedValue({}),
    };
    mockWatchlist = {
      loadWatchlist: jest.fn().mockResolvedValue([]),
      saveWatchlist: jest.fn().mockResolvedValue(true),
      processWatchlistChecks: jest.fn().mockResolvedValue([]),
    };
    mockSystemCheck = { runSystemCheck: jest.fn().mockResolvedValue([]) };

    mockRealpath = jest.fn((p) => Promise.resolve(p));
    mockFsAccess = jest.fn().mockResolvedValue();
    mockExecFile = jest.fn();
    mockShell = {
      openExternal: jest.fn().mockResolvedValue(),
      showItemInFolder: jest.fn(),
    };

    jest.doMock(
      "electron",
      () => ({
        app: {
          getPath: jest.fn(() => "/home/test"),
          getVersion: jest.fn(() => "1.5.0"),
        },
        ipcMain: {
          handle: jest.fn((channel, fn) => handlers.set(channel, fn)),
          on: jest.fn((channel, fn) => listeners.set(channel, fn)),
        },
        shell: mockShell,
        BrowserWindow: { getFocusedWindow: jest.fn(() => null) },
      }),
      { virtual: true },
    );
    jest.doMock("fs", () => ({
      promises: { realpath: mockRealpath, access: mockFsAccess },
    }));
    jest.doMock("child_process", () => ({ execFile: mockExecFile }));
    jest.doMock("../../src/main/settings", () => mockSettings);
    jest.doMock("../../src/main/servers", () => mockServers);
    jest.doMock("../../src/main/game", () => mockGame);
    jest.doMock("../../src/main/serverQuery", () => mockServerQuery);
    jest.doMock("../../src/main/modManager", () => mockModManager);
    jest.doMock("../../src/main/updater", () => mockUpdater);
    jest.doMock("../../src/main/logParser", () => mockLogParser);
    jest.doMock("../../src/main/steamworksManager", () => mockSteamworks);
    jest.doMock("../../src/main/steamDependencyResolver", () => mockDepResolver);
    jest.doMock("../../src/main/watchlist", () => mockWatchlist);
    jest.doMock("../../src/main/systemCheck", () => mockSystemCheck);
    jest.doMock("../../src/main/logger", () => ({
      getLogFilePath: jest.fn(() => "/var/log/dzlinux.log"),
    }));

    const { registerIpcHandlers } = require("../../src/main/ipcHandlers");
    registerIpcHandlers();

    event = {
      sender: { isDestroyed: jest.fn(() => false), send: jest.fn() },
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("settings handlers", () => {
    test("get-version returns the app version", () => {
      expect(handlers.get("get-version")()).toBe("1.5.0");
    });

    test("load-settings returns settings from the async loader", async () => {
      const result = await handlers.get("load-settings")();
      expect(result).toEqual({ modDirectory: "/mod/dir" });
      expect(mockSettings.loadSettingsAsync).toHaveBeenCalled();
    });

    test("save-settings rejects non-object payloads", async () => {
      await expect(handlers.get("save-settings")(event, null)).rejects.toThrow(
        "Invalid settings payload",
      );
      await expect(handlers.get("save-settings")(event, [1, 2])).rejects.toThrow(
        "Invalid settings payload",
      );
      expect(mockSettings.saveSettings).not.toHaveBeenCalled();
    });

    test("save-settings delegates valid payloads", async () => {
      const settings = { theme: "tactical-dark" };
      await expect(
        handlers.get("save-settings")(event, settings),
      ).resolves.toBe(true);
      expect(mockSettings.saveSettings).toHaveBeenCalledWith(settings);
    });

    test("get-default-settings delegates to the settings manager", () => {
      expect(handlers.get("get-default-settings")()).toEqual({
        theme: "tactical-dark",
      });
    });

    test("save-favorites rejects invalid favorites payloads", async () => {
      await expect(
        handlers.get("save-favorites")(event, {
          favorites: [{ ip: "not an ip!!", port: 2302 }],
        }),
      ).rejects.toThrow("Invalid favorites payload");
      expect(mockSettings.saveSettings).not.toHaveBeenCalled();
    });

    test("save-favorites persists merged settings for valid payloads", async () => {
      const favorites = [{ ip: "1.2.3.4", port: 2302 }];
      await handlers.get("save-favorites")(event, { favorites });

      expect(mockSettings.saveSettings).toHaveBeenCalledWith({
        modDirectory: "/mod/dir",
        favorites,
      });
    });
  });

  describe("server query handlers", () => {
    test("fetch-servers streams batches to the sender", async () => {
      mockServers.fetchDayZServers.mockImplementation((onBatch) => {
        onBatch([{ ip: "1.1.1.1" }]);
        return Promise.resolve([{ ip: "1.1.1.1" }]);
      });

      const result = await handlers.get("fetch-servers")(event, 7);

      expect(result).toEqual([{ ip: "1.1.1.1" }]);
      expect(event.sender.send).toHaveBeenCalledWith(
        "servers-batch",
        [{ ip: "1.1.1.1" }],
        7,
      );
    });

    test("query-mods returns null for invalid addresses", async () => {
      const result = await handlers.get("query-mods")(
        event,
        "not an ip!!",
        2302,
        null,
      );
      expect(result).toBeNull();
      expect(mockServerQuery.queryServerGameDig).not.toHaveBeenCalled();
    });

    test("query-mods returns the mod list on success", async () => {
      const result = await handlers.get("query-mods")(
        event,
        "1.2.3.4",
        2302,
        2303,
      );
      expect(result).toEqual([{ id: "123", name: "Mod" }]);
      expect(mockServerQuery.queryServerGameDig).toHaveBeenCalledWith(
        "1.2.3.4",
        2302,
        2303,
      );
    });

    test("query-mods returns null when the server is unreachable", async () => {
      mockServerQuery.queryServerGameDig.mockResolvedValue(null);
      const result = await handlers.get("query-mods")(event, "1.2.3.4", 2302);
      expect(result).toBeNull();
    });

    test("refresh-mod-cache returns empty array for invalid input", async () => {
      const result = await handlers.get("refresh-mod-cache")(
        event,
        "1.2.3.4",
        99999,
        null,
      );
      expect(result).toEqual([]);
      expect(mockServers.refreshServerModCache).not.toHaveBeenCalled();
    });

    test("refresh-mod-cache returns mods for valid input", async () => {
      const result = await handlers.get("refresh-mod-cache")(
        event,
        "1.2.3.4",
        2302,
        2303,
      );
      expect(result).toEqual([{ id: "1", name: "M" }]);
    });
  });


  describe("ping cancellation", () => {
    test("ping-server returns null for invalid port", async () => {
      const result = await handlers.get("ping-server")(
        event,
        "1.2.3.4",
        70000,
        null,
        "req-1",
      );
      expect(result).toBeNull();
      expect(mockServerQuery.pingServer).not.toHaveBeenCalled();
    });

    test("ping-server without a request id delegates directly", async () => {
      const result = await handlers.get("ping-server")(event, "1.2.3.4", 2302);
      expect(result).toEqual({ ping: 10 });
      expect(mockServerQuery.pingServer).toHaveBeenCalledWith(
        "1.2.3.4",
        2302,
        undefined,
      );
    });

    test("ping-server resolves null when cancelled mid-flight", async () => {
      let resolvePing;
      mockServerQuery.pingServer.mockImplementation(
        () => new Promise((resolve) => { resolvePing = resolve; }),
      );

      const promise = handlers.get("ping-server")(
        event,
        "1.2.3.4",
        2302,
        null,
        "gen1:req1",
      );
      listeners.get("cancel-ping-request")(null, "gen1:req1");
      resolvePing({ ping: 10 });

      await expect(promise).resolves.toBeNull();
    });

    test("cancel-ping-generation only cancels its own generation", async () => {
      const resolvers = [];
      mockServerQuery.pingServer.mockImplementation(
        () => new Promise((resolve) => resolvers.push(resolve)),
      );

      const p1 = handlers.get("ping-server")(event, "1.1.1.1", 2302, null, "gen1:a");
      const p2 = handlers.get("ping-server")(event, "2.2.2.2", 2302, null, "gen2:b");
      listeners.get("cancel-ping-generation")(null, "gen1");
      resolvers.forEach((resolve) => resolve({ ping: 10 }));

      await expect(p1).resolves.toBeNull();
      await expect(p2).resolves.toEqual({ ping: 10 });
    });

    test("cancel listeners ignore malformed identifiers", () => {
      expect(() =>
        listeners.get("cancel-ping-generation")(null, {}),
      ).not.toThrow();
      expect(() =>
        listeners.get("cancel-ping-request")(null, 123),
      ).not.toThrow();
    });
  });

  describe("game handlers", () => {
    test("launch-game rejects invalid arguments", async () => {
      await expect(
        handlers.get("launch-game")(event, "bad ip!!", 2302, []),
      ).rejects.toThrow("Invalid arguments");
      await expect(
        handlers.get("launch-game")(event, "1.2.3.4", 0, []),
      ).rejects.toThrow("Invalid arguments");
      await expect(
        handlers.get("launch-game")(event, "1.2.3.4", 2302, "not-array"),
      ).rejects.toThrow("Invalid arguments");
      await expect(
        handlers.get("launch-game")(event, "1.2.3.4", 2302, [{ id: "abc" }]),
      ).rejects.toThrow("Invalid mod IDs");
      expect(mockGame.launchDayZ).not.toHaveBeenCalled();
    });

    test("launch-game delegates valid input", async () => {
      const mods = [{ id: "12345" }];
      await handlers.get("launch-game")(event, "1.2.3.4", 2302, mods);
      expect(mockGame.launchDayZ).toHaveBeenCalledWith("1.2.3.4", 2302, mods);
    });

    test("launch-game without connect info still validates mods", async () => {
      await handlers.get("launch-game")(event, null, null, []);
      expect(mockGame.launchDayZ).toHaveBeenCalledWith(null, null, []);
    });

    test("check-mods treats non-array input as empty", async () => {
      const result = await handlers.get("check-mods")(event, "junk");
      expect(result).toEqual({ missingMods: [], hasAllMods: true });
      expect(mockGame.checkMods).not.toHaveBeenCalled();
    });

    test("check-mods filters invalid mod entries", async () => {
      await handlers.get("check-mods")(event, [
        { id: "123" },
        { id: "abc" },
        null,
      ]);
      expect(mockGame.checkMods).toHaveBeenCalledWith([{ id: "123" }]);
    });

    test("open-workshop delegates to the game manager", () => {
      handlers.get("open-workshop")(event, "12345");
      expect(mockGame.openWorkshopPage).toHaveBeenCalledWith("12345");
    });

    test("check-gamemode and scan-proton-versions delegate", async () => {
      await expect(handlers.get("check-gamemode")()).resolves.toBe(true);
      await expect(handlers.get("scan-proton-versions")()).resolves.toEqual([]);
    });
  });


  describe("mod handlers", () => {
    test("subscribe-mod rejects invalid mod ids", async () => {
      await expect(
        handlers.get("subscribe-mod")(event, "abc;drop"),
      ).rejects.toThrow("Invalid modId");
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    test("subscribe-mod opens the Steam workshop URL for valid ids", async () => {
      await handlers.get("subscribe-mod")(event, "12345");
      expect(mockShell.openExternal).toHaveBeenCalledWith(
        expect.stringContaining("id=12345"),
      );
    });

    test("get-installed-mods delegates", async () => {
      await expect(handlers.get("get-installed-mods")()).resolves.toEqual([
        { id: "123" },
      ]);
    });

    test("check-mod-updates filters invalid entries", async () => {
      await handlers.get("check-mod-updates")(event, [
        { id: "123" },
        { id: "x" },
        null,
      ]);
      expect(mockModManager.checkModUpdates).toHaveBeenCalledWith([
        { id: "123" },
      ]);
    });

    test("check-mod-updates-detailed filters invalid entries", async () => {
      await handlers.get("check-mod-updates-detailed")(event, [
        { id: "123" },
        {},
      ]);
      expect(mockModManager.checkModUpdatesDetailed).toHaveBeenCalledWith([
        { id: "123" },
      ]);
    });

    test("delete-mod and open-mod-folder delegate", async () => {
      await expect(handlers.get("delete-mod")(event, "123")).resolves.toBe(true);
      expect(mockModManager.deleteMod).toHaveBeenCalledWith("123");
      await handlers.get("open-mod-folder")(event, "456");
      expect(mockModManager.openModFolder).toHaveBeenCalledWith("456");
    });

    test("resolve-mod-dependencies rejects invalid ids", async () => {
      await expect(
        handlers.get("resolve-mod-dependencies")(event, "bad"),
      ).rejects.toThrow("Invalid modId");
      expect(mockDepResolver.resolveDependencies).not.toHaveBeenCalled();
    });

    test("resolve-mod-dependencies delegates valid ids as strings", async () => {
      await handlers.get("resolve-mod-dependencies")(event, 12345);
      expect(mockDepResolver.resolveDependencies).toHaveBeenCalledWith("12345");
    });

    test("resolve-mod-dependencies-batch filters invalid ids and caps at 1000", async () => {
      const ids = Array.from({ length: 1005 }, (_, i) => String(i + 1));
      ids.push("bad", null);
      await handlers.get("resolve-mod-dependencies-batch")(event, ids);

      const calledWith = mockDepResolver.resolveBatchDependencies.mock.calls[0][0];
      expect(calledWith).toHaveLength(1000);
      expect(calledWith.every((id) => typeof id === "string")).toBe(true);
      expect(calledWith).not.toContain("bad");
    });
  });

  describe("watchlist handlers", () => {
    test("load-watchlist delegates", async () => {
      await expect(handlers.get("load-watchlist")()).resolves.toEqual([]);
    });

    test("save-watchlist rejects invalid payloads", async () => {
      await expect(
        handlers.get("save-watchlist")(event, [{ ip: "bad!!", active: true }]),
      ).rejects.toThrow("Invalid watchlist payload");
      expect(mockWatchlist.saveWatchlist).not.toHaveBeenCalled();
    });

    test("save-watchlist persists valid payloads", async () => {
      const watchlist = [{ ip: "1.2.3.4", port: 2302, active: true }];
      await handlers.get("save-watchlist")(event, watchlist);
      expect(mockWatchlist.saveWatchlist).toHaveBeenCalledWith(watchlist);
    });

    test("check-watchlist-thresholds returns empty for invalid payloads", async () => {
      const result = await handlers.get("check-watchlist-thresholds")(
        event,
        [{ ip: "bad!!", port: 2302 }],
      );
      expect(result).toEqual([]);
      expect(mockWatchlist.processWatchlistChecks).not.toHaveBeenCalled();
    });

    test("check-watchlist-thresholds notifies the sender when triggered", async () => {
      const servers = [
        { ip: "1.2.3.4", port: 2302, status: "online", name: "Srv", players: 5 },
      ];
      const triggered = [{ ip: "1.2.3.4", port: 2302, players: 5 }];
      mockWatchlist.processWatchlistChecks.mockResolvedValue(triggered);

      const result = await handlers.get("check-watchlist-thresholds")(
        event,
        servers,
      );

      expect(result).toEqual(triggered);
      expect(event.sender.send).toHaveBeenCalledWith(
        "watchlist-notify",
        triggered,
      );
    });
  });


  describe("steamworks handlers", () => {
    test("steamworks mod endpoints reject invalid mod ids", async () => {
      await expect(
        handlers.get("steamworks-subscribe")(event, "bad"),
      ).rejects.toThrow("Invalid modId");
      await expect(
        handlers.get("steamworks-unsubscribe")(event, "bad"),
      ).rejects.toThrow("Invalid modId");
      await expect(
        handlers.get("steamworks-download-info")(event, "bad"),
      ).rejects.toThrow("Invalid modId");
      await expect(
        handlers.get("steamworks-mod-state")(event, "bad"),
      ).rejects.toThrow("Invalid modId");
      expect(mockSteamworks.subscribeMod).not.toHaveBeenCalled();
    });

    test("steamworks-user-info delegates", async () => {
      await expect(handlers.get("steamworks-user-info")()).resolves.toEqual({
        name: "user",
      });
    });

    test("steamworks endpoints pass string ids to the manager", async () => {
      await handlers.get("steamworks-subscribe")(event, 123);
      expect(mockSteamworks.subscribeMod).toHaveBeenCalledWith("123");
      await handlers.get("steamworks-mod-state")(event, "456");
      expect(mockSteamworks.getModState).toHaveBeenCalledWith("456");
    });
  });

  describe("updater handlers", () => {
    test("check-for-updates passes through non-available results", async () => {
      await expect(handlers.get("check-for-updates")()).resolves.toEqual({
        kind: "none",
      });
    });

    test("check-for-updates rewrites available updates on system installs", async () => {
      mockUpdater.checkForUpdates.mockResolvedValue({
        kind: "available",
        currentVersion: "1.5.0",
        updateInfo: { downloadUrl: "https://example.com/dl" },
      });
      mockUpdater.isSystemInstall.mockReturnValue(true);

      const result = await handlers.get("check-for-updates")();

      expect(result).toEqual({
        kind: "system-package",
        currentVersion: "1.5.0",
        releaseUrl: "https://example.com/dl",
      });
    });

    test("download-update resolves true on success and false on failure", async () => {
      await expect(handlers.get("download-update")()).resolves.toBe(true);
      mockUpdater.autoUpdater.downloadUpdate.mockRejectedValue(
        new Error("network"),
      );
      const logSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      await expect(handlers.get("download-update")()).resolves.toBe(false);
      logSpy.mockRestore();
    });

    test("install-update calls quitAndInstall", () => {
      handlers.get("install-update")();
      expect(mockUpdater.autoUpdater.quitAndInstall).toHaveBeenCalled();
    });
  });

  describe("system and path handlers", () => {
    test("open-external rejects non-http schemes", async () => {
      await expect(
        handlers.get("open-external")(event, "file:///etc/passwd"),
      ).rejects.toThrow("Invalid URL scheme");
      await expect(
        handlers.get("open-external")(event, "steam://openurl/x"),
      ).rejects.toThrow("Invalid URL scheme");
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    test("open-external allows http and https URLs", async () => {
      await handlers.get("open-external")(event, "https://example.com");
      expect(mockShell.openExternal).toHaveBeenCalledWith("https://example.com");
    });


    test("check-path-exists allows paths under the home directory", async () => {
      const result = await handlers.get("check-path-exists")(
        event,
        "/home/test/docs/file.txt",
      );
      expect(result).toBe(true);
    });

    test("check-path-exists rejects paths outside allowed prefixes", async () => {
      const result = await handlers.get("check-path-exists")(event, "/etc/passwd");
      expect(result).toBe(false);
      expect(mockFsAccess).not.toHaveBeenCalled();
    });

    test("check-path-exists allows the configured mod directory", async () => {
      const result = await handlers.get("check-path-exists")(
        event,
        "/mod/dir/12345",
      );
      expect(result).toBe(true);
    });

    test("check-path-exists returns false when the file is missing", async () => {
      mockFsAccess.mockRejectedValue(new Error("ENOENT"));
      const result = await handlers.get("check-path-exists")(
        event,
        "/home/test/missing",
      );
      expect(result).toBe(false);
    });

    test("get-disk-space returns null for disallowed paths", async () => {
      const result = await handlers.get("get-disk-space")(event, "/etc");
      expect(result).toBeNull();
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    test("get-disk-space parses df output for allowed paths", async () => {
      mockExecFile.mockImplementation((cmd, args, cb) =>
        cb(
          null,
          "Filesystem     1K-blocks    Used Available Use% Mounted on\n/dev/sda1       1000    250       750  25% /\n",
        ),
      );

      const result = await handlers.get("get-disk-space")(event, "/home/test");

      expect(mockExecFile).toHaveBeenCalledWith(
        "df",
        ["-k", "/home/test"],
        expect.any(Function),
      );
      expect(result).toEqual({ total: 1024000, used: 256000, free: 768000 });
    });

    test("get-disk-space returns null when df fails", async () => {
      mockExecFile.mockImplementation((cmd, args, cb) =>
        cb(new Error("df failed")),
      );
      const result = await handlers.get("get-disk-space")(event, "/home/test");
      expect(result).toBeNull();
    });

    test("diagnostics endpoints delegate", async () => {
      await expect(handlers.get("get-diagnostics")()).resolves.toEqual([
        { status: "CLEAN" },
      ]);
      await expect(handlers.get("get-session-summary")()).resolves.toEqual({
        crashes: 0,
      });
      await expect(
        handlers.get("run-system-compatibility-check")(),
      ).resolves.toEqual([]);
    });

    test("open-log-file reveals the log in the file manager", () => {
      handlers.get("open-log-file")();
      expect(mockShell.showItemInFolder).toHaveBeenCalledWith(
        "/var/log/dzlinux.log",
      );
    });

    test("window controls tolerate no focused window", () => {
      expect(() => listeners.get("window-min")()).not.toThrow();
      expect(() => listeners.get("window-max")()).not.toThrow();
      expect(() => listeners.get("window-close")()).not.toThrow();
    });
  });
});

