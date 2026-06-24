// Mock electron and electron-updater before requiring the module
jest.mock(
  "electron",
  () => ({
    app: {
      getPath: jest.fn(() => "/tmp/dzlinux-test-data"),
      getVersion: jest.fn(() => "1.0.7"),
      isPackaged: false,
      getAppPath: jest.fn(() => "/tmp/dzlinux-test"),
    },
  }),
  { virtual: true },
);

jest.mock("electron-updater", () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    logger: console,
    checkForUpdates: jest.fn(),
    downloadUpdate: jest.fn(),
    quitAndInstall: jest.fn(),
    on: jest.fn(),
  },
}));

const { compareVersions, isSystemInstall } = require("../../src/main/updater");

describe("compareVersions", () => {
  test("equal versions return 0", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  test("v1 > v2 returns 1", () => {
    expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
  });

  test("v1 < v2 returns -1", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
  });

  test("strips v prefix", () => {
    expect(compareVersions("v2.0.0", "v1.0.0")).toBe(1);
  });

  test("pre-release is lower than release", () => {
    expect(compareVersions("1.0.0-beta", "1.0.0")).toBe(-1);
  });

  test("release is higher than pre-release", () => {
    expect(compareVersions("1.0.0", "1.0.0-beta")).toBe(1);
  });

  test("major version difference", () => {
    expect(compareVersions("2.0", "1.9.9")).toBe(1);
  });

  test("minor version difference", () => {
    expect(compareVersions("1.2.0", "1.1.9")).toBe(1);
  });

  test("handles different segment counts", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
  });

  test("v prefix on only one version", () => {
    expect(compareVersions("v1.0.1", "1.0.0")).toBe(1);
  });
});

describe("isSystemInstall", () => {
  const electron = require("electron");
  const originalIsPackaged = electron.app.isPackaged;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    electron.app.isPackaged = originalIsPackaged;
  });

  test("returns false when not packaged", () => {
    // Arrange
    electron.app.isPackaged = false;

    // Act
    const result = isSystemInstall();

    // Assert
    expect(result).toBe(false);
  });

  test("returns true for /opt/ path", () => {
    // Arrange
    electron.app.isPackaged = true;
    electron.app.getAppPath.mockReturnValue("/opt/dzlinux/resources/app");

    // Act
    const result = isSystemInstall();

    // Assert
    expect(result).toBe(true);
  });

  test("returns true for /usr/ path", () => {
    // Arrange
    electron.app.isPackaged = true;
    electron.app.getAppPath.mockReturnValue("/usr/lib/dzlinux/resources/app");

    // Act
    const result = isSystemInstall();

    // Assert
    expect(result).toBe(true);
  });

  test("returns false for /home/ path", () => {
    // Arrange
    electron.app.isPackaged = true;
    electron.app.getAppPath.mockReturnValue("/home/user/.local/share/dzlinux");

    // Act
    const result = isSystemInstall();

    // Assert
    expect(result).toBe(false);
  });

  test("returns false if /opt/ is in the middle of the path", () => {
    // Arrange
    electron.app.isPackaged = true;
    electron.app.getAppPath.mockReturnValue(
      "/home/user/opt/dzlinux/resources/app",
    );

    // Act
    const result = isSystemInstall();

    // Assert
    expect(result).toBe(false);
  });

  test("returns false if /usr/ is in the middle of the path", () => {
    // Arrange
    electron.app.isPackaged = true;
    electron.app.getAppPath.mockReturnValue(
      "/home/user/usr/lib/dzlinux/resources/app",
    );

    // Act
    const result = isSystemInstall();

    // Assert
    expect(result).toBe(false);
  });
});

describe("setupAutoUpdater", () => {
  const { autoUpdater, setupAutoUpdater } = require("../../src/main/updater");
  const electron = require("electron");
  let mockMainWindow;
  let listeners;

  beforeEach(() => {
    jest.clearAllMocks();
    listeners = {};

    // Override the autoUpdater.on mock to capture listeners locally
    autoUpdater.on.mockImplementation((event, cb) => {
      listeners[event] = cb;
    });

    mockMainWindow = {
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: {
        send: jest.fn(),
      },
    };
  });

  test("forwards update-available event with array release notes", () => {
    setupAutoUpdater(mockMainWindow);
    expect(listeners["update-available"]).toBeDefined();

    listeners["update-available"]({
      version: "2.0.0",
      releaseNotes: [{ note: "Fix A" }, { note: "Fix B" }],
      releaseDate: "2023-01-01",
    });

    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      "update-available",
      {
        version: "2.0.0",
        releaseNotes: "Fix A\nFix B",
        releaseDate: "2023-01-01",
      },
    );
  });

  test("forwards update-available event with string release notes", () => {
    setupAutoUpdater(mockMainWindow);

    listeners["update-available"]({
      version: "2.0.0",
      releaseNotes: "Some release notes string",
      releaseDate: "2023-01-01",
    });

    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      "update-available",
      {
        version: "2.0.0",
        releaseNotes: "Some release notes string",
        releaseDate: "2023-01-01",
      },
    );
  });

  test("forwards update-not-available event", () => {
    setupAutoUpdater(mockMainWindow);
    expect(listeners["update-not-available"]).toBeDefined();

    listeners["update-not-available"]();

    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      "update-not-available",
    );
  });

  test("forwards download-progress event", () => {
    setupAutoUpdater(mockMainWindow);
    expect(listeners["download-progress"]).toBeDefined();

    listeners["download-progress"]({
      percent: 50,
      transferred: 500,
      total: 1000,
      bytesPerSecond: 100,
    });

    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      "update-download-progress",
      {
        percent: 50,
        transferred: 500,
        total: 1000,
        bytesPerSecond: 100,
      },
    );
  });

  test("forwards update-downloaded event", () => {
    setupAutoUpdater(mockMainWindow);
    expect(listeners["update-downloaded"]).toBeDefined();

    listeners["update-downloaded"]({
      version: "2.0.0",
    });

    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      "update-downloaded",
      {
        version: "2.0.0",
      },
    );
  });

  test("forwards error event", () => {
    setupAutoUpdater(mockMainWindow);
    expect(listeners["error"]).toBeDefined();

    listeners["error"](new Error("Update failed"));

    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      "update-error",
      {
        message: "Update failed",
      },
    );
  });

  test("does not send events if mainWindow is destroyed", () => {
    setupAutoUpdater(mockMainWindow);
    mockMainWindow.isDestroyed.mockReturnValue(true);

    listeners["update-not-available"]();

    expect(mockMainWindow.webContents.send).not.toHaveBeenCalled();
  });

  test("checks for updates if packaged and not system install", async () => {
    const originalIsPackaged = electron.app.isPackaged;
    electron.app.isPackaged = true;
    electron.app.getAppPath.mockReturnValue("/home/user/.local/share/dzlinux"); // not a system install

    const axios = require("axios");
    jest.spyOn(axios, "get").mockResolvedValue({
      data: {
        tag_name: "v1.0.7",
        html_url: "https://example.com",
        body: "",
        published_at: "2023-01-01",
      },
    });

    setupAutoUpdater(mockMainWindow);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(axios.get).toHaveBeenCalled();

    // cleanup
    electron.app.isPackaged = originalIsPackaged;
    jest.restoreAllMocks();
  });
});

describe("checkForUpdates", () => {
  const electron = require("electron");
  const axios = require("axios");
  const { checkForUpdates } = require("../../src/main/updater");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("returns available when new version exists", async () => {
    jest.spyOn(axios, "get").mockResolvedValue({
      data: {
        tag_name: "v2.0.0",
        html_url: "https://example.com",
        body: "Release notes",
        published_at: "2023-01-01",
      },
    });
    electron.app.getVersion.mockReturnValue("1.0.0");

    const result = await checkForUpdates();

    expect(result.kind).toBe("available");
    expect(result.updateInfo.version).toBe("2.0.0");
  });

  test("returns not-available when versions match", async () => {
    jest.spyOn(axios, "get").mockResolvedValue({
      data: {
        tag_name: "v1.0.0",
        html_url: "https://example.com",
      },
    });
    electron.app.getVersion.mockReturnValue("1.0.0");

    const result = await checkForUpdates();

    expect(result.kind).toBe("not-available");
  });

  test("returns error on network failure", async () => {
    jest.spyOn(axios, "get").mockRejectedValue(new Error("Network Error"));

    const result = await checkForUpdates();

    expect(result.kind).toBe("error");
    expect(result.message).toBe("Network Error");
  });
});
