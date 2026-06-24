const path = require("path");

describe("path validation logic", () => {
  test("allowed path prefixes are correctly defined", () => {
    const allowedPrefixes = [
      path.join("/home/user", ".steam"),
      path.join("/home/user", ".local", "share", "Steam"),
      path.join("/home/user", ".var", "app", "com.valvesoftware.Steam"),
      "/usr",
      "/opt",
      "/snap",
      "/home",
    ];

    expect(
      allowedPrefixes.some((p) => "/home/user/.steam/steam".startsWith(p)),
    ).toBe(true);
    expect(
      allowedPrefixes.some((p) => "/usr/lib/something".startsWith(p)),
    ).toBe(true);
    expect(allowedPrefixes.some((p) => "/opt/app".startsWith(p))).toBe(true);
  });

  test("URL validation rejects non-http schemes", () => {
    const isValidUrl = (url) => {
      return (
        typeof url === "string" &&
        (url.startsWith("https://") || url.startsWith("http://"))
      );
    };

    expect(isValidUrl("https://example.com")).toBe(true);
    expect(isValidUrl("http://example.com")).toBe(true);
    expect(isValidUrl("javascript:alert(1)")).toBe(false);
    expect(isValidUrl("file:///etc/passwd")).toBe(false);
    expect(isValidUrl("ftp://example.com")).toBe(false);
    expect(isValidUrl(123)).toBe(false);
    expect(isValidUrl(null)).toBe(false);
  });

  test("modId validation rejects non-numeric IDs", () => {
    const isValidModId = (id) => /^\d+$/.test(id);

    expect(isValidModId("12345")).toBe(true);
    expect(isValidModId("0")).toBe(true);
    expect(isValidModId("abc")).toBe(false);
    expect(isValidModId("123;456")).toBe(false);
    expect(isValidModId("")).toBe(false);
  });
});

describe("IPC handler registration", () => {
  test("main.js registers expected IPC handlers", async () => {
    // Set up all mocks before requiring main.js
    jest.doMock(
      "electron",
      () => ({
        app: {
          getPath: jest.fn(() => "/tmp/dzlinux-test-data"),
          getVersion: jest.fn(() => "1.0.7"),
          isPackaged: false,
          getAppPath: jest.fn(() => "/tmp/dzlinux-test"),
          commandLine: { appendSwitch: jest.fn() },
          whenReady: jest.fn(() => Promise.resolve()),
          on: jest.fn(),
          quit: jest.fn(),
          exit: jest.fn(),
        },
        BrowserWindow: Object.assign(
          jest.fn(() => ({
            loadFile: jest.fn(),
            webContents: { send: jest.fn(), isDestroyed: jest.fn(() => false) },
            isDestroyed: jest.fn(() => false),
          })),
          {
            getFocusedWindow: jest.fn(() => null),
            getAllWindows: jest.fn(() => []),
          },
        ),
        ipcMain: { handle: jest.fn(), on: jest.fn() },
        shell: { openExternal: jest.fn(), openPath: jest.fn() },
        dialog: { showMessageBox: jest.fn() },
        nativeImage: { createFromPath: jest.fn(() => ({})) },
      }),
      { virtual: true },
    );

    jest.doMock("../../src/main/settings", () => ({
      loadSettings: jest.fn(() => ({
        nativeWayland: false,
        modDirectory: "",
        favorites: [],
      })),
      saveSettings: jest.fn(() => true),
    }));
    jest.doMock("../../src/main/servers", () => ({
      fetchDayZServers: jest.fn(() => Promise.resolve([])),
    }));
    jest.doMock("../../src/main/game", () => ({
      checkMods: jest.fn(() =>
        Promise.resolve({ missingMods: [], hasAllMods: true }),
      ),
      launchDayZ: jest.fn(),
      openWorkshopPage: jest.fn(),
      scanProtonVersions: jest.fn(() => []),
      checkGameMode: jest.fn(() => Promise.resolve(false)),
    }));
    jest.doMock("../../src/main/serverQuery", () => ({
      pingServer: jest.fn(() => Promise.resolve(null)),
      queryServerGameDig: jest.fn(() => Promise.resolve(null)),
    }));
    jest.doMock("../../src/main/modManager", () => ({
      getInstalledMods: jest.fn(() => Promise.resolve([])),
      checkModUpdates: jest.fn(() => Promise.resolve([])),
      checkModUpdatesDetailed: jest.fn(() =>
        Promise.resolve({ outdatedMods: [] }),
      ),
      deleteMod: jest.fn(() => true),
      openModFolder: jest.fn(),
    }));
    jest.doMock("../../src/main/updater", () => ({
      autoUpdater: {
        checkForUpdates: jest.fn(),
        downloadUpdate: jest.fn(),
        quitAndInstall: jest.fn(),
      },
      setupAutoUpdater: jest.fn(),
      fallbackCheck: jest.fn(),
      compareVersions: jest.fn(),
      isSystemInstall: jest.fn(() => false),
    }));
    jest.doMock("../../src/main/logParser", () => ({
      getRecentLogs: jest.fn(() => Promise.resolve([])),
      getSessionSummary: jest.fn(() => Promise.resolve({})),
    }));
    jest.doMock("../../src/main/steamworksManager", () => ({
      getUserProfile: jest.fn(),
      subscribeMod: jest.fn(),
      unsubscribeMod: jest.fn(),
      getDownloadProgress: jest.fn(),
      getModState: jest.fn(),
      shutdown: jest.fn(() => Promise.resolve()),
    }));
    jest.doMock("../../src/main/steamDependencyResolver", () => ({
      resolveDependencies: jest.fn(),
      resolveBatchDependencies: jest.fn(),
    }));

    // Require and call registerIpcHandlers to register handlers
    const { registerIpcHandlers } = require("../../src/main/ipcHandlers");
    registerIpcHandlers();

    // Flush the microtask queue so handler execution resolves
    await new Promise((resolve) => setImmediate(resolve));

    // Get the mocked ipcMain
    const { ipcMain } = require("electron");

    // Verify expected handlers were registered
    const handleCalls = ipcMain.handle.mock.calls.map((c) => c[0]);
    const expectedHandlers = [
      "load-settings",
      "save-settings",
      "fetch-servers",
      "query-mods",
      "refresh-mod-cache",
      "ping-server",
      "check-mods",
      "launch-game",
      "open-workshop",
      "subscribe-mod",
      "get-installed-mods",
      "check-mod-updates",
      "check-mod-updates-detailed",
      "get-diagnostics",
      "get-session-summary",
      "delete-mod",
      "open-mod-folder",
      "scan-proton-versions",
      "check-for-updates",
      "download-update",
      "install-update",
      "open-external",
      "check-gamemode",
      "check-path-exists",
      "steamworks-user-info",
      "steamworks-subscribe",
      "steamworks-unsubscribe",
      "steamworks-download-info",
      "steamworks-mod-state",
      "resolve-mod-dependencies",
      "resolve-mod-dependencies-batch",
      "get-disk-space",
      "load-watchlist",
      "save-watchlist",
      "check-watchlist-thresholds",
    ];

    for (const handler of expectedHandlers) {
      expect(handleCalls).toContain(handler);
    }
  });
});
