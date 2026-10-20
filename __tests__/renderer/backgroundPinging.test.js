/** @jest-environment jsdom */

jest.mock("../../src/renderer/serverRow.js", () => ({ buildServerRow: jest.fn(), renderMetadataBadges: jest.fn() }));
jest.mock("../../src/renderer/modManager.js", () => ({ refreshLocalModsCache: jest.fn() }));

const { state } = require("../../src/renderer/state.js");
const { applyPingResult } = require("../../src/renderer/utils.js");
const { startBackgroundPinging, refreshServers } = require("../../src/renderer/serverBrowser/serverBrowserRender.js");

test("lightweight ping results preserve known Workshop mods and their category", () => {
  const server = { mods: [{ id: "123", name: "Cached mod" }], modded: true };
  applyPingResult(server, { ping: 20, players: 37, mods: null, modded: false });
  expect(server.players).toBe(37);
  expect(server.mods).toEqual([{ id: "123", name: "Cached mod" }]);
  expect(server.modded).toBe(true);
});

test("live updates retain measurement provenance and clear it when the next response is unknown", () => {
  const server = { players: 0, maxPlayers: 60 };
  applyPingResult(server, { ping: 20, players: 0, maxPlayers: 60, reportedPlayers: 0, reportedCapacity: 60 });
  expect(server).toMatchObject({ reportedPlayers: 0, reportedCapacity: 60 });
  applyPingResult(server, { ping: 20, players: 0, maxPlayers: 60, reportedPlayers: null, reportedCapacity: null });
  expect(server).toMatchObject({ reportedPlayers: null, reportedCapacity: null });
  applyPingResult(server, { ping: 20, players: 17, maxPlayers: 80, reportedPlayers: 17, reportedCapacity: 80 });
  applyPingResult(server, null);
  expect(server).toMatchObject({ reportedPlayers: null, reportedCapacity: null, failedPing: true });
});

test("a completed old pool does not unlock the newer generation", async () => {
  state.settings = { queryConcurrency: 1 };
  state.allServers = [{ ip: "1.2.3.4", port: 2302 }];
  state.bgPing.isRunning = false;
  state.bgPing.generation = 1;
  let finish;
  window.api = { servers: { ping: jest.fn(() => new Promise(resolve => { finish = resolve; })) } };
  const oldPool = startBackgroundPinging();
  await Promise.resolve();
  state.bgPing.generation = 2;
  state.bgPing.isRunning = true;
  finish({ ping: 10, players: 5 });
  await oldPool;
  expect(state.bgPing.isRunning).toBe(true);
  expect(state.allServers[0].realPing).toBeUndefined();
});

test("streamed and final server lists preserve measurements already received from a live ping", async () => {
  jest.useFakeTimers();
  try {
    document.body.innerHTML = '<table><tbody id="serverListBody"></tbody></table>';
    state.settings = { autoRefreshEnabled: false };
    state.sort = { column: "name", direction: "asc" };
    const unqueried = { id: "server", ip: "1.2.3.4", port: 2302, name: "Server", players: 0, maxPlayers: 60, reportedPlayers: null, reportedCapacity: null };
    let batch;
    window.api = { servers: {
      onBatch: callback => { batch = callback; },
      fetch: jest.fn(async generation => {
        batch([unqueried], generation);
        applyPingResult(state.allServers[0], {
          status: "online", ping: 20, players: 17, maxPlayers: 80, reportedPlayers: 17, reportedCapacity: 80,
        });
        batch([unqueried], generation);
        expect(state.allServers[0]).toMatchObject({ reportedPlayers: 17, reportedCapacity: 80 });
        return [unqueried];
      }),
      ping: jest.fn(),
    } };
    await refreshServers();
    expect(state.allServers[0]).toMatchObject({ players: 17, maxPlayers: 80, reportedPlayers: 17, reportedCapacity: 80, realPing: 20 });
    expect(window.api.servers.ping).not.toHaveBeenCalled();
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});
