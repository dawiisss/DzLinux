/** @jest-environment jsdom */

jest.mock("../../src/renderer/serverRow.js", () => ({ buildServerRow: jest.fn(), renderMetadataBadges: jest.fn() }));
jest.mock("../../src/renderer/modManager.js", () => ({ refreshLocalModsCache: jest.fn() }));

const { state } = require("../../src/renderer/state.js");
const { applyPingResult } = require("../../src/renderer/utils.js");
const { startBackgroundPinging } = require("../../src/renderer/serverBrowser/serverBrowserRender.js");

test("lightweight ping results preserve known Workshop mods and their category", () => {
  const server = { mods: [{ id: "123", name: "Cached mod" }], modded: true };
  applyPingResult(server, { ping: 20, players: 37, mods: null, modded: false });
  expect(server.players).toBe(37);
  expect(server.mods).toEqual([{ id: "123", name: "Cached mod" }]);
  expect(server.modded).toBe(true);
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
