/** @jest-environment jsdom */

jest.mock("../../src/renderer/feedback.js", () => ({ showToast: jest.fn() }));
jest.mock("../../src/renderer/modManager.js", () => ({
  triggerSteamworksSync: jest.fn(), refreshLocalModsCache: jest.fn().mockResolvedValue(),
}));

const { state } = require("../../src/renderer/state.js");
const { renderServers } = require("../../src/renderer/serverBrowser/serverBrowserTable.js");
const { cancelServerModQueries } = require("../../src/renderer/serverMods.js");

let server;
let resolveQuery;
let rejectQuery;
let serverNumber = 0;

beforeEach(async () => {
  cancelServerModQueries();
  document.body.innerHTML = `
    <span id="statTotalServers"></span><span id="statTotalPlayers"></span>
    <span id="statFilteredServers"></span>
    <table><tbody id="serverListBody"></tbody></table>
    <table><tbody id="favoritesListBody"></tbody></table>`;
  server = {
    id: "test-server", name: "Test server", ip: `10.0.0.${++serverNumber}`, port: 2302,
    queryPort: 2303, mods: [], modded: true, realPing: 20,
    players: 10, maxPlayers: 60, thirdPerson: true,
  };
  Object.assign(state, {
    settings: { listMode: "paging", enableTrustScore: false },
    allServers: [server], favorites: [{ ip: server.ip, port: server.port }],
    favoritesSet: new Set([`${server.ip}:${server.port}`]), localModsSet: new Set(),
    activeDownloads: new Map(), expandedServerId: null, cachedSortOrder: null,
    sort: { column: "players", direction: "desc" },
    pagination: { page: 1, size: 50 },
  });
  window.api = { servers: {
    queryMods: jest.fn(() => new Promise((resolve, reject) => {
      resolveQuery = resolve;
      rejectQuery = reject;
    })),
    refreshModCache: jest.fn().mockResolvedValue([]),
  } };
  renderServers();
  document.getElementById("row-test-server").click();
  await Promise.resolve();
});

async function settleQuery() {
  // Flush both the response handler and its rejection handler, without timers.
  await Promise.resolve();
  await Promise.resolve();
}

test("completed mods replace the preserved browser loader without another click", async () => {
  const mainRow = document.getElementById("row-test-server");
  const detail = document.getElementById("detail-test-server");
  detail.scrollTop = 42;
  expect(detail.textContent).toContain("Querying server for mod list");

  // This is the real renderer path that deliberately reuses expanded rows.
  renderServers();
  expect(document.getElementById("detail-test-server")).toBe(detail);
  resolveQuery([{ id: "123", name: "CF" }, { id: "456", name: "Community tools" }]);
  await settleQuery();

  const visible = document.getElementById("detail-test-server");
  expect(visible.textContent).toContain("CF");
  expect(visible.textContent).toContain("Community tools");
  expect(visible.textContent).toContain("Mods (2)");
  expect(visible.textContent).not.toContain("Querying server");
  expect(document.getElementById("row-test-server").querySelector(".server-mod-count").textContent).toBe("2");
  expect(document.getElementById("detail-test-server").scrollTop).toBe(42);
  expect(document.getElementById("row-test-server")).toBe(mainRow);
  expect(window.api.servers.queryMods).toHaveBeenCalledTimes(1);
});

test("a completed empty response replaces the loader with the vanilla message", async () => {
  resolveQuery([]);
  await settleQuery();
  const detail = document.getElementById("detail-test-server");
  expect(detail.textContent).toContain("No workshop mods detected");
  expect(detail.textContent).not.toContain("Querying server");
});

test.each(["unreachable", "rejected"])("a %s query replaces the loader with an error", async outcome => {
  if (outcome === "unreachable") resolveQuery(null);
  else rejectQuery(new Error("IPC query failed"));
  await settleQuery();
  const detail = document.getElementById("detail-test-server");
  expect(detail.textContent).toContain("Unable to fetch mod list");
  expect(detail.textContent).not.toContain("Querying server");
  expect(server.isQueryingMods).toBe(false);
  renderServers();
  expect(window.api.servers.queryMods).toHaveBeenCalledTimes(1);
});

test("finishing a collapsed query does not reopen it", async () => {
  document.getElementById("row-test-server").click();
  resolveQuery([{ id: "123", name: "CF" }]);
  await settleQuery();
  expect(document.getElementById("detail-test-server")).toBeNull();
  document.getElementById("row-test-server").click();
  expect(document.getElementById("detail-test-server").textContent).toContain("CF");
  expect(window.api.servers.queryMods).toHaveBeenCalledTimes(1);
});

test("a late automatic query cannot overwrite a newer explicit refresh", async () => {
  document.getElementById("detail-test-server").querySelector(".btn-refresh-mods").click();
  await settleQuery();
  resolveQuery([{ id: "123", name: "Old automatic result" }]);
  await settleQuery();
  expect(server.mods).toEqual([]);
  expect(document.getElementById("detail-test-server").textContent).toContain("No workshop mods detected");
  expect(document.getElementById("detail-test-server").textContent).not.toContain("Old automatic result");
});
