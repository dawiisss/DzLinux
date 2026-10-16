/** @jest-environment jsdom */

jest.mock("../../src/renderer/feedback.js", () => ({ showToast: jest.fn() }));
jest.mock("../../src/renderer/modManager.js", () => ({
  triggerSteamworksSync: jest.fn(), refreshLocalModsCache: jest.fn().mockResolvedValue(),
}));
jest.mock("../../src/renderer/serverRow.js", () => ({ buildServerRow: jest.fn(), buildDetailRow: jest.fn() }));
jest.mock("../../src/renderer/serverBrowser/serverBrowserRender.js", () => ({ updateStatsBar: jest.fn(), refreshServers: jest.fn() }));

const { state } = require("../../src/renderer/state.js");
const { connectToServer } = require("../../src/renderer/serverBrowser/serverBrowserTable.js");
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
  if (state.currentModCheckInterval) clearInterval(state.currentModCheckInterval);
  if (state.currentModLaunchTimer) clearTimeout(state.currentModLaunchTimer);
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
