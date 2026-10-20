/** @jest-environment jsdom */

jest.mock("../../src/renderer/feedback.js", () => ({ showToast: jest.fn() }));
jest.mock("../../src/renderer/modManager.js", () => ({ triggerSteamworksSync: jest.fn() }));

const { state } = require("../../src/renderer/state.js");
const { buildServerRow } = require("../../src/renderer/serverRow.js");
const { loadServerMods, cancelServerModQueries } = require("../../src/renderer/serverMods.js");
let group = 0;

beforeEach(() => {
  cancelServerModQueries();
  document.body.innerHTML = '<table><tbody id="rows"></tbody></table>';
  state.settings = { queryConcurrency: 150 };
  state.bgPing.generation++;
  state.favoritesSet = new Set();
  state.localModsSet = new Set();
  state.activeDownloads = new Map();
  state.expandedServerId = null;
  window.api = { servers: {
    queryMods: jest.fn().mockResolvedValue([{ id: "123", name: "CF" }]),
    cancelPingRequest: jest.fn(),
    ping: jest.fn().mockResolvedValue({ ping: 20, players: 5, mods: null, modded: true }),
  } };
  group++;
});

function server(index = 1) {
  return {
    id: `server-${index}`, name: "Test server", ip: `10.${group}.0.${index}`, port: 2302,
    mods: [], realPing: 20, players: 5, maxPlayers: 60, modded: true,
  };
}

function show(value) {
  const row = buildServerRow(value);
  document.getElementById("rows").appendChild(row);
  return row;
}

test("a collapsed server row automatically gets its mod count without clicking", async () => {
  const value = server();
  value.modded = false;
  const row = show(value);
  expect(row.querySelector(".server-mod-count").textContent).toBe("…");
  await loadServerMods(value);
  expect(row.querySelector(".server-mod-count").textContent).toBe("1");
  expect(document.querySelector(".detail-row")).toBeNull();
  expect(window.api.servers.queryMods).toHaveBeenCalledTimes(1);
  row.click();
  expect(document.querySelector(".detail-row").textContent).toContain("CF");
  expect(window.api.servers.queryMods).toHaveBeenCalledTimes(1);
});

test.each([[[], "0"], [null, "—"]])("an automatic result %j displays %s", async (mods, count) => {
  window.api.servers.queryMods.mockResolvedValue(mods);
  const value = server();
  const row = show(value);
  await loadServerMods(value);
  expect(row.querySelector(".server-mod-count").textContent).toBe(count);
});

test("cached results populate replacement rows immediately without another network query", async () => {
  const value = server();
  show(value);
  await loadServerMods(value);
  await Promise.resolve();
  document.getElementById("rows").replaceChildren();
  const replacement = { ...value, mods: [], hasQueriedMods: false };
  const row = show(replacement);
  expect(row.querySelector(".server-mod-count").textContent).toBe("1");
  expect(window.api.servers.queryMods).toHaveBeenCalledTimes(1);
});

test("a favorite's initial ping starts count enrichment without an expansion", async () => {
  const value = server();
  value.realPing = undefined;
  const row = buildServerRow(value, true);
  document.getElementById("rows").appendChild(row);
  await Promise.resolve();
  await loadServerMods(value);
  expect(row.querySelector(".server-mod-count").textContent).toBe("1");
  expect(window.api.servers.queryMods).toHaveBeenCalledTimes(1);
  expect(document.querySelector(".detail-row")).toBeNull();
});

test("refresh cancels queued metadata and discards stale running results", async () => {
  const finish = [];
  window.api.servers.queryMods.mockImplementation(() => new Promise(resolve => finish.push(resolve)));
  const values = Array.from({ length: 30 }, (_, i) => server(i + 1));
  values.forEach(show);
  const requests = values.map(value => loadServerMods(value));
  await Promise.resolve();
  expect(window.api.servers.queryMods).toHaveBeenCalledTimes(8);
  cancelServerModQueries();
  state.bgPing.generation++;
  finish.forEach(resolve => resolve([{ id: "999", name: "Stale result" }]));
  await Promise.all(requests);
  await Promise.resolve();
  expect(window.api.servers.cancelPingRequest).toHaveBeenCalledTimes(8);
  expect(window.api.servers.queryMods).toHaveBeenCalledTimes(8);
  expect(values.every(value => value.mods.length === 0)).toBe(true);
});

test("paging away drops queued hidden rows instead of querying them", async () => {
  const finish = [];
  window.api.servers.queryMods.mockImplementation(() => new Promise(resolve => finish.push(resolve)));
  const values = Array.from({ length: 15 }, (_, i) => server(i + 1));
  values.forEach(show);
  const requests = values.map(value => loadServerMods(value));
  await Promise.resolve();
  values.slice(8).forEach(value => document.getElementById(`row-${value.id}`).remove());
  finish.forEach(resolve => resolve([]));
  await Promise.all(requests);
  expect(window.api.servers.queryMods).toHaveBeenCalledTimes(8);
  expect(values.slice(8).every(value => !value.isQueryingMods && !value.hasQueriedMods)).toBe(true);
});

test("a queued query still serves a mounted favorite after its browser row is removed", async () => {
  const finish = [];
  window.api.servers.queryMods.mockImplementation(() => new Promise(resolve => finish.push(resolve)));
  const values = Array.from({ length: 9 }, (_, i) => server(i + 1));
  values.forEach(show);
  const requests = values.map(value => loadServerMods(value));
  const favorite = { ...values[8], id: "favorite" };
  const row = buildServerRow(favorite, true);
  document.getElementById("rows").appendChild(row);
  requests.push(loadServerMods(favorite));
  document.getElementById("row-" + values[8].id).remove();
  await Promise.resolve();
  expect(window.api.servers.queryMods).toHaveBeenCalledTimes(8);
  finish.forEach(resolve => resolve([]));
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(window.api.servers.queryMods).toHaveBeenCalledTimes(9);
  finish[8]([{ id: "123", name: "CF" }]);
  await Promise.all(requests);
  expect(row.querySelector(".server-mod-count").textContent).toBe("1");
  expect(favorite.isQueryingMods).toBe(false);
});
