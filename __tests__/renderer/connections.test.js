/** @jest-environment jsdom */

jest.mock("../../src/renderer/feedback.js", () => ({ showToast: jest.fn() }));
jest.mock("../../src/renderer/modManager.js", () => ({
  triggerSteamworksSync: jest.fn(), refreshLocalModsCache: jest.fn().mockResolvedValue(),
}));
jest.mock("../../src/renderer/serverRow.js", () => ({ buildServerRow: jest.fn(), buildDetailRow: jest.fn() }));
jest.mock("../../src/renderer/serverBrowser/serverBrowserRender.js", () => ({ updateStatsBar: jest.fn(), refreshServers: jest.fn() }));

const { state } = require("../../src/renderer/state.js");
const { connectToServer, cancelPendingConnection, initServerBrowser } = require("../../src/renderer/serverBrowser/serverBrowserTable.js");
const { showToast } = require("../../src/renderer/feedback.js");
const { refreshLocalModsCache } = require("../../src/renderer/modManager.js");

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  state.settings = { enableHistory: false, enableGameMode: true, protonPath: "default" };
  state.allServers = [];
  state.currentModCheckGeneration = 0;
  state.currentModQueryRequestId = null;
  state.currentModCheckInterval = null;
  state.currentModLaunchTimer = null;
  document.body.innerHTML = '<div id="modModal" style="display:none"><ul id="missingModsList"></ul><span id="modStatusText"></span><button id="modalAutoDownloadBtn"></button><button id="modalCancelBtn"></button></div>';
  window.api = {
    servers: { queryMods: jest.fn().mockResolvedValue([]) },
    game: {
      checkRequired: jest.fn().mockResolvedValue({ missingMods: [], hasAllMods: true }),
      launch: jest.fn().mockResolvedValue(),
    },
  };
});

afterEach(() => {
  cancelPendingConnection();
  if (state.currentModCheckInterval) clearInterval(state.currentModCheckInterval);
  if (state.currentModLaunchTimer) clearTimeout(state.currentModLaunchTimer);
});

test("browser initialization subscribes to cancellation after the API is available", async () => {
  let onCancelled;
  const unsubscribe = jest.fn();
  window.api.connection = {
    begin: jest.fn().mockResolvedValue("connection-1"),
    finish: jest.fn().mockResolvedValue(),
    onCancelled: jest.fn((callback) => { onCancelled = callback; return unsubscribe; }),
  };
  initServerBrowser();
  initServerBrowser();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  const query = deferred();
  window.api.servers.queryMods.mockReturnValue(query.promise);
  const connection = connectToServer("1.2.3.4", 2302);
  await Promise.resolve();
  await Promise.resolve();
  const generation = state.currentModCheckGeneration;
  onCancelled({ id: "another-connection" });
  expect(state.currentModCheckGeneration).toBe(generation);
  onCancelled({ id: "connection-1" });
  query.resolve([]);
  await connection;
  expect(window.api.game.launch).not.toHaveBeenCalled();
  expect(window.api.connection.finish).toHaveBeenCalledWith("connection-1", false);
});

test("a slow older server query cannot launch after a newer selection", async () => {
  const slow = deferred();
  window.api.servers.queryMods.mockImplementationOnce(() => slow.promise);
  const first = connectToServer("1.2.3.4", 2302);
  await Promise.resolve();
  await connectToServer("2.3.4.5", 2302);
  slow.resolve([]);
  await first;
  expect(window.api.game.launch).toHaveBeenCalledTimes(1);
  expect(window.api.game.launch).toHaveBeenCalledWith("2.3.4.5", 2302, []);
});

test("an older mod verification cannot open a modal over a newer connection", async () => {
  const slow = deferred();
  state.allServers = [{ ip: "1.2.3.4", port: 2302, mods: [{ id: "123", name: "A" }] }];
  window.api.game.checkRequired.mockImplementationOnce(() => slow.promise);
  const first = connectToServer("1.2.3.4", 2302);
  await Promise.resolve();
  await connectToServer("2.3.4.5", 2302);
  slow.resolve({ missingMods: [{ id: "123", name: "A" }], hasAllMods: false });
  await first;
  expect(document.getElementById("modModal").style.display).toBe("none");
  expect(state.currentModCheckInterval).toBeNull();
  expect(window.api.game.launch).toHaveBeenCalledTimes(1);
});

test("Steam launch does not claim GameMode was enabled", async () => {
  await connectToServer("1.2.3.4", 2302);
  expect(showToast.mock.calls.some(([message]) => message.includes("GameMode active"))).toBe(false);
});

test("custom Proton reports GameMode only after a successful launch", async () => {
  state.settings.protonPath = "/proton/proton";
  const launch = deferred();
  window.api.game.launch.mockReturnValue(launch.promise);
  const connection = connectToServer("1.2.3.4", 2302);
  await Promise.resolve();
  await Promise.resolve();
  expect(showToast.mock.calls.some(([message]) => message.includes("GameMode active"))).toBe(false);
  launch.resolve();
  await connection;
  expect(showToast.mock.calls.some(([message]) => message.includes("GameMode active"))).toBe(true);
});

test("cancelling while the final mod scan is pending prevents automatic launch", async () => {
  jest.useFakeTimers();
  try {
    const mod = { id: "123", name: "A" };
    state.allServers = [{ ip: "1.2.3.4", port: 2302, mods: [mod] }];
    window.api.steamworks = { downloadInfo: jest.fn().mockResolvedValue(null) };
    window.api.game.checkRequired.mockResolvedValueOnce({ missingMods: [mod], hasAllMods: false });
    const scan = deferred();
    refreshLocalModsCache.mockReturnValueOnce(scan.promise);
    await connectToServer("1.2.3.4", 2302);
    await jest.advanceTimersByTimeAsync(4500);
    expect(refreshLocalModsCache).toHaveBeenCalled();
    document.getElementById("modalCancelBtn").click();
    scan.resolve();
    await Promise.resolve();
    expect(window.api.game.launch).not.toHaveBeenCalled();
    expect(document.getElementById("modModal").style.display).toBe("none");
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test("History reconnect always queries fresh requirements despite cached browser mods", async () => {
  const stale = [{ id: "111", name: "Old mod" }];
  const fresh = [{ id: "222", name: "New mod" }];
  state.allServers = [{ ip: "1.2.3.4", port: 2302, queryPort: 27016, mods: stale }];
  window.api.servers.queryMods.mockResolvedValue(fresh);
  await connectToServer("1.2.3.4", 2302, { forceModQuery: true });
  expect(window.api.servers.queryMods).toHaveBeenCalledWith("1.2.3.4", 2302, 27016, expect.any(String));
  expect(window.api.game.checkRequired).toHaveBeenCalledWith(fresh);
  expect(window.api.game.launch).toHaveBeenCalledWith("1.2.3.4", 2302, fresh);
});

test("a successful empty fresh list launches vanilla without cached mods", async () => {
  state.allServers = [{ ip: "1.2.3.4", port: 2302, mods: [{ id: "111", name: "Old mod" }] }];
  window.api.servers.queryMods.mockResolvedValue([]);
  await connectToServer("1.2.3.4", 2302, { forceModQuery: true });
  expect(window.api.game.launch).toHaveBeenCalledWith("1.2.3.4", 2302, []);
});

test.each([null, "invalid"])("failed or invalid fresh requirements stop the join: %s", async (result) => {
  state.allServers = [{ ip: "1.2.3.4", port: 2302, mods: [{ id: "111" }] }];
  window.api.servers.queryMods.mockResolvedValue(result);
  await connectToServer("1.2.3.4", 2302, { forceModQuery: true });
  expect(window.api.game.checkRequired).not.toHaveBeenCalled();
  expect(window.api.game.launch).not.toHaveBeenCalled();
});

test("History context supplies identity and query port when a server is absent from the browser", async () => {
  state.settings.enableHistory = true;
  window.api.history = { record: jest.fn().mockResolvedValue(null) };
  const context = { ip: "1.2.3.4", port: 2302, queryPort: 27016, name: "Historical server", map: "enoch" };
  await connectToServer("1.2.3.4", 2302, { forceModQuery: true, serverContext: context });
  expect(window.api.servers.queryMods).toHaveBeenCalledWith("1.2.3.4", 2302, 27016, expect.any(String));
  expect(window.api.history.record).toHaveBeenCalledWith(expect.objectContaining({ name: "Historical server", map: "enoch", queryPort: 27016 }));
});

test.each([
  ["unqueried display defaults", {}, null, null],
  ["unknown reported values", { reportedPlayers: null, reportedCapacity: null }, null, null],
  ["known population and capacity", { reportedPlayers: 17, reportedCapacity: 80 }, 17, 80],
  ["a confirmed empty server", { reportedPlayers: 0, reportedCapacity: 60 }, 0, 60],
])("History records reported measurements for %s", async (_label, measurements, players, maxPlayers) => {
  state.settings.enableHistory = true;
  state.allServers = [{ ip: "1.2.3.4", port: 2302, players: 0, maxPlayers: 60, ...measurements }];
  window.api.history = { record: jest.fn().mockResolvedValue(null) };
  await connectToServer("1.2.3.4", 2302);
  expect(window.api.history.record).toHaveBeenCalledWith(expect.objectContaining({ players, maxPlayers }));
});

test("History keeps unlisted Favorites measurements separate from historical display values", async () => {
  state.settings.enableHistory = true;
  window.api.history = { record: jest.fn().mockResolvedValue(null) };
  await connectToServer("1.2.3.4", 2302, { serverContext: {
    ip: "1.2.3.4", port: 2302, players: 0, maxPlayers: 60,
    reportedPlayers: 17, reportedCapacity: 80, realPing: 20,
  } });
  expect(window.api.history.record).toHaveBeenLastCalledWith(expect.objectContaining({ players: 17, maxPlayers: 80, ping: 20 }));
  await connectToServer("2.3.4.5", 2302, { serverContext: {
    ip: "2.3.4.5", port: 2302, players: 17, maxPlayers: 80, ping: 20,
  } });
  expect(window.api.history.record).toHaveBeenLastCalledWith(expect.objectContaining({ players: null, maxPlayers: null, ping: null }));
});

test("a failed live query cannot contribute its previous counts or ping to History", async () => {
  const { applyPingResult } = require("../../src/renderer/utils.js");
  const server = { ip: "1.2.3.4", port: 2302 };
  applyPingResult(server, { ping: 20, players: 17, maxPlayers: 80, reportedPlayers: 17, reportedCapacity: 80 });
  applyPingResult(server, null);
  state.allServers = [server];
  state.settings.enableHistory = true;
  window.api.history = { record: jest.fn().mockResolvedValue(null) };
  await connectToServer("1.2.3.4", 2302);
  expect(window.api.history.record).toHaveBeenCalledWith(expect.objectContaining({ players: null, maxPlayers: null, ping: null }));
});

test.each([
  ["unknown population and capacity", { ping: 20, players: 0, maxPlayers: 60, reportedPlayers: null, reportedCapacity: null }, null, null],
  ["a confirmed empty server", { ping: 20, players: 0, maxPlayers: 60, reportedPlayers: 0, reportedCapacity: 60 }, 0, 60],
  ["reported values without ping", { players: 0, maxPlayers: 60, reportedPlayers: 12, reportedCapacity: 80 }, 12, 80],
])("History enrichment preserves %s", async (_label, response, players, maxPlayers) => {
  state.settings.enableHistory = true;
  const activityId = "12345678-1234-1234-1234-123456789abc";
  window.api.history = { record: jest.fn().mockResolvedValueOnce({
    ip: "1.2.3.4", port: 2302, lastActivityId: activityId,
  }).mockResolvedValue(null) };
  window.api.servers.ping = jest.fn().mockResolvedValue(response);
  await connectToServer("1.2.3.4", 2302);
  expect(window.api.history.record).toHaveBeenNthCalledWith(2, expect.objectContaining({
    updateOnly: true, activityId, players, maxPlayers,
  }));
});

test("cancelled fresh queries cannot launch and release their queued query", async () => {
  const query = deferred();
  window.api.servers.cancelPingRequest = jest.fn();
  window.api.servers.queryMods.mockReturnValue(query.promise);
  const connection = connectToServer("1.2.3.4", 2302, { forceModQuery: true });
  await Promise.resolve();
  await Promise.resolve();
  const requestId = state.currentModQueryRequestId;
  expect(requestId).toMatch(/^connection-/);
  cancelPendingConnection();
  query.resolve([]);
  await connection;
  expect(window.api.servers.cancelPingRequest).toHaveBeenCalledWith(requestId);
  expect(window.api.game.launch).not.toHaveBeenCalled();
  expect(state.currentModQueryRequestId).toBeNull();
});

test("slow required-file checks never overlap while mods are syncing", async () => {
  jest.useFakeTimers();
  try {
    const mod = { id: "123", name: "A" };
    const pending = deferred();
    state.allServers = [{ ip: "1.2.3.4", port: 2302, mods: [mod] }];
    window.api.steamworks = { downloadInfo: jest.fn().mockResolvedValue(null) };
    window.api.game.checkRequired.mockResolvedValueOnce({ missingMods: [mod], hasAllMods: false })
      .mockReturnValue(pending.promise);
    await connectToServer("1.2.3.4", 2302);
    await jest.advanceTimersByTimeAsync(10000);
    expect(window.api.game.checkRequired).toHaveBeenCalledTimes(2);
    cancelPendingConnection();
    pending.resolve({ missingMods: [mod], hasAllMods: false });
    await Promise.resolve();
  } finally { jest.useRealTimers(); }
});

test("failed final mod-cache scans are reported without an unhandled launch", async () => {
  jest.useFakeTimers();
  try {
    const mod = { id: "123", name: "A" };
    state.allServers = [{ ip: "1.2.3.4", port: 2302, mods: [mod] }];
    window.api.steamworks = { downloadInfo: jest.fn().mockResolvedValue(null) };
    window.api.game.checkRequired.mockResolvedValueOnce({ missingMods: [mod], hasAllMods: false });
    refreshLocalModsCache.mockRejectedValueOnce(new Error("Scan failed"));
    await connectToServer("1.2.3.4", 2302);
    await jest.advanceTimersByTimeAsync(4500);
    expect(window.api.game.launch).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("Launch preparation failed"), expect.any(String), "alert");
  } finally { jest.useRealTimers(); }
});
