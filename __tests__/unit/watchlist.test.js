jest.mock("electron", () => {
  const notification = jest.fn(() => ({ show: jest.fn(), on: jest.fn(), close: jest.fn() }));
  notification.isSupported = jest.fn(() => true);
  return { app: { getPath: () => "/tmp/watchlist-fixture" }, Notification: notification, BrowserWindow: { getAllWindows: jest.fn(() => []) } };
}, { virtual: true });
jest.mock("node:fs/promises", () => ({ readFile: jest.fn(), writeFile: jest.fn().mockResolvedValue() }));
jest.mock("../../src/main/fileUtils", () => ({ writeJsonAtomically: jest.fn().mockResolvedValue() }));
jest.mock("../../src/main/settings", () => ({ loadSettingsAsync: jest.fn().mockResolvedValue({}), saveSettings: jest.fn().mockResolvedValue(true) }));

let repo;
let disk;
let settings;
let atomic;
let watchModel;
let notifications;
let DesktopNotification;
let windows;
const legacy = { ip: "1.2.3.4", port: 2302, active: true, name: "Server 1", threshold: 50, mode: "below" };
const config = { ip: legacy.ip, port: legacy.port, condition: { type: "free-slots", value: 1 } };
const rule = (extra = {}) => ({ ...config, enabled: true, condition: { type: "legacy-player-at-most", value: 50 }, alertPolicy: "repeat", cooldownSeconds: 300, episodeLatched: false, pendingEpisode: false, lastAlertAt: null, ...extra });
const observation = (players) => ({ status: "online", players, capacity: 60 });

beforeEach(() => {
  jest.resetModules(); jest.clearAllMocks();
  disk = require("node:fs/promises");
  disk.readFile.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
  disk.writeFile.mockResolvedValue();
  settings = require("../../src/main/settings"); settings.loadSettingsAsync.mockResolvedValue({});
  atomic = require("../../src/main/fileUtils").writeJsonAtomically; atomic.mockResolvedValue();
  repo = require("../../src/main/watchlist");
  watchModel = require("../../src/main/watchlistModel");
  notifications = require("../../src/main/watchlistNotifications").createNotifications;
  const electron = require("electron"); DesktopNotification = electron.Notification; windows = electron.BrowserWindow;
  DesktopNotification.isSupported.mockReturnValue(true);
});

describe("Watchlist repository and migrated policies", () => {
  test("returns an empty versioned watchlist when no file or settings entries exist", async () => {
    expect(await repo.loadDocument()).toEqual({ schemaVersion: 2, revision: 1, entries: [] });
  });
  test("returns watchlist from standalone file and preserves its threshold", async () => {
    disk.readFile.mockResolvedValue(JSON.stringify([legacy]));
    const document = await repo.loadDocument();
    expect(document.entries[0]).toMatchObject({ enabled: true, condition: { type: "legacy-player-at-most", value: 50 } });
    expect(disk.writeFile).toHaveBeenCalledWith(expect.stringContaining(".v1-backup"), JSON.stringify([legacy]), expect.objectContaining({ flag: "wx" }));
  });
  test("migrates watchlist from settings if no standalone file exists", async () => {
    settings.loadSettingsAsync.mockResolvedValue({ watchlist: [legacy], theme: "dark" });
    expect((await repo.loadDocument()).entries).toHaveLength(1);
    expect(settings.saveSettings).toHaveBeenCalledWith({ watchlist: [], theme: "dark" });
  });
  test("writes a targeted watch mutation to the standalone file", async () => {
    const entry = await repo.add(config);
    expect(atomic).toHaveBeenCalledWith(expect.stringContaining("watchlist.json"), expect.objectContaining({ schemaVersion: 2, entries: [entry] }));
    expect(entry).toMatchObject({ alertPolicy: "once", enabled: true });
  });
  test("triggers an alert when threshold is met (below mode)", () => {
    expect(watchModel.evaluate(rule(), observation(40), {}, 1000000).alert).toBe(true);
  });
  test("triggers an alert when threshold is met (above mode)", () => {
    expect(watchModel.evaluate(rule({ condition: { type: "population-at-least", value: 50 } }), observation(60), {}, 1000000).alert).toBe(true);
  });
  test("does not trigger an alert if the same episode already notified", () => {
    expect(watchModel.evaluate(rule({ episodeLatched: true }), observation(40), {}, 1000000).alert).toBe(false);
  });
  test("rearms an episode when the threshold is no longer met", () => {
    expect(watchModel.evaluate(rule({ episodeLatched: true }), observation(60), {}, 1000000).patch.episodeLatched).toBe(false);
  });
  test("uses the saved global threshold if a legacy local threshold is missing", async () => {
    const entry = { ...legacy }; delete entry.threshold;
    disk.readFile.mockResolvedValue(JSON.stringify([entry])); settings.loadSettingsAsync.mockResolvedValue({ watchlistThreshold: 45 });
    expect((await repo.loadDocument()).entries[0].condition.value).toBe(45);
  });
  test("skips inactive watches without silently rearming an alerted episode", () => {
    const result = watchModel.evaluate(rule({ enabled: false, episodeLatched: true }), observation(40), {}, 1000000);
    expect(result.alert).toBe(false); expect(result.patch).toEqual({});
  });
  test("does nothing if native notifications are not supported", () => {
    DesktopNotification.isSupported.mockReturnValue(false);
    notifications(jest.fn()).deliver({ server: legacy, condition: "At most 50 players" });
    expect(DesktopNotification).not.toHaveBeenCalled();
  });
  test("handles boundary cases exactly at threshold", () => {
    expect(watchModel.evaluate(rule(), observation(50), {}, 1000000).alert).toBe(true);
    expect(watchModel.evaluate(rule({ condition: { type: "population-at-least", value: 50 } }), observation(50), {}, 1000000).alert).toBe(true);
  });
  test("handles native notification show failure gracefully", () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    DesktopNotification.mockImplementationOnce(() => ({ on: jest.fn(), show: () => { throw new Error("show failure"); } }));
    expect(() => notifications(jest.fn()).deliver({ server: legacy, condition: "Ready" })).not.toThrow();
    expect(log).toHaveBeenCalled(); log.mockRestore();
  });
  test("notification click restores and focuses an available window", () => {
    const sender = { send: jest.fn() };
    const windowFixture = { isDestroyed: () => false, isMinimized: () => true, restore: jest.fn(), show: jest.fn(), focus: jest.fn(), webContents: sender };
    windows.getAllWindows.mockReturnValue([windowFixture]);
    const click = jest.fn(); const alert = { server: legacy, condition: "Ready" };
    notifications(click).deliver(alert);
    DesktopNotification.mock.results[0].value.on.mock.calls.find(([name]) => name === "click")[1]();
    expect(windowFixture.restore).toHaveBeenCalled(); expect(windowFixture.focus).toHaveBeenCalled(); expect(click).toHaveBeenCalledWith(alert, sender);
  });
  test("preserves auto-join configuration and server context during migration", async () => {
    disk.readFile.mockResolvedValue(JSON.stringify([{ ...legacy, autoJoin: true, queryPort: 2305 }]));
    expect((await repo.loadDocument()).entries[0]).toMatchObject({ autoJoin: true, ip: legacy.ip, port: legacy.port, queryPort: 2305, name: legacy.name });
  });
});
