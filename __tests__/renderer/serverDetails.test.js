/** @jest-environment jsdom */

jest.mock("../../src/renderer/feedback.js", () => ({ showToast: jest.fn() }));
jest.mock("../../src/renderer/modManager.js", () => ({
  triggerSteamworksSync: jest.fn(), refreshLocalModsCache: jest.fn().mockResolvedValue(),
}));

const { state, applyFavoritesSnapshot } = require("../../src/renderer/state.js");
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

test("R13: manual ping updates player badge, ping, metadata, server name, and stats without full reload or losing details", async () => {
  resolveQuery([{ id: "123", name: "CF" }]);
  await settleQuery();

  const row = document.getElementById("row-test-server");
  const detail = document.getElementById("detail-test-server");
  detail.scrollTop = 75;

  window.api.servers.ping = jest.fn().mockResolvedValueOnce({
    status: "online",
    ping: 34,
    players: 12,
    maxPlayers: 80,
    reportedPlayers: 12,
    reportedCapacity: 80,
    name: "Renamed Live Server",
    map: "namalsk",
    time: "14:20",
    thirdPerson: false,
    password: true,
    modded: true,
  });

  const pingBtn = row.querySelector(".btn-ping");
  pingBtn.click();
  await settleQuery();

  expect(document.getElementById("row-test-server")).toBe(row);
  expect(document.getElementById("detail-test-server")).toBe(detail);
  expect(detail.scrollTop).toBe(75);
  expect(row.querySelector(".player-badge").textContent).toBe("12/80");
  expect(row.querySelector(".server-name-cell").textContent).toBe("Renamed Live Server");
  expect(document.getElementById(`ping-cell-${server.id}`).textContent).toContain("34ms");
  const metaText = document.getElementById(`meta-cell-${server.id}`).textContent;
  expect(metaText).toContain("1PP");
  expect(metaText).toContain("Namalsk");
  expect(metaText).toContain("Locked");
  expect(document.getElementById("statTotalPlayers").textContent).toBe("12");

  // Failed manual ping updates the row before removing it from the online list.
  window.api.servers.ping.mockRejectedValueOnce(new Error("unreachable"));
  pingBtn.click();
  await settleQuery();
  expect(row.querySelector(`[id="ping-cell-${server.id}"]`).textContent).toBe("Timeout");
  expect(document.getElementById("row-test-server")).toBeNull();
  expect(document.getElementById("detail-test-server")).toBeNull();
});

test("manual ping removes an expanded row that no longer matches Hide empty", async () => {
  resolveQuery([]);
  await settleQuery();
  const previousHideEmpty = state.flags.hideEmpty;
  state.flags.hideEmpty = true;
  try {
    window.api.servers.ping = jest.fn().mockResolvedValue({
      ping: 25, players: 0, maxPlayers: 60, mods: null, modded: true,
    });
    document.getElementById("row-test-server").querySelector(".btn-ping").click();
    await settleQuery();
    expect(server.players).toBe(0);
    expect(document.getElementById("row-test-server")).toBeNull();
    expect(document.getElementById("detail-test-server")).toBeNull();
    expect(state.expandedServerId).toBeNull();
    expect(document.getElementById("statFilteredServers").textContent).toBe("0");
  } finally {
    state.flags.hideEmpty = previousHideEmpty;
  }
});

test("manual ping reapplies population sorting without recreating surviving rows", async () => {
  resolveQuery([]);
  await settleQuery();
  document.getElementById("row-test-server").click();
  const peer = { ...server, id: "peer", ip: "192.0.2.77", players: 5, hasQueriedMods: true };
  state.favorites = [];
  state.favoritesSet = new Set();
  state.allServers = [server, peer];
  renderServers();
  const row = document.getElementById("row-test-server");
  const peerRow = document.getElementById("row-peer");
  expect(document.querySelector("#serverListBody .server-row")).toBe(row);

  window.api.servers.ping = jest.fn().mockResolvedValue({
    ping: 25, players: 1, maxPlayers: 60, mods: null, modded: true,
  });
  row.querySelector(".btn-ping").click();
  await settleQuery();
  expect(document.querySelector("#serverListBody .server-row")).toBe(peerRow);
  expect(document.getElementById("row-test-server")).toBe(row);
});

test("R13: recycled row refreshes players, ping, metadata, and trust reasons even when shield level is unchanged, while preserving focus", async () => {
  state.settings.enableTrustScore = true;
  server.players = 59;
  server.maxPlayers = 60;
  server.ping = 280;
  server.realPing = 20;
  renderServers();

  const row = document.getElementById("row-test-server");
  const ipBtn = row.querySelector(".ip-cell");
  ipBtn.focus();
  expect(document.activeElement).toBe(ipBtn);

  const securityCell = row.querySelector(".col-security");
  const shieldIcon = securityCell.querySelector("app-icon");
  const initialClass = shieldIcon.className;
  const initialTitle = securityCell.title;
  expect(initialClass).toBe("shield-med");
  expect(initialTitle).toBe("High Population Community");

  // Mutate server so shield level remains med (score 20 via CFTools admin mod, players <= 40)
  // while reasons, players, ping, and map change
  const updatedServer = {
    ...server,
    name: "Updated Recycled Name",
    players: 25,
    maxPlayers: 60,
    realPing: 42,
    mods: [{ id: "1", name: "CFTools" }],
    map: "sakhal",
    thirdPerson: false,
  };
  state.allServers = [updatedServer];
  renderServers();

  expect(document.getElementById("row-test-server")).toBe(row);
  expect(document.activeElement).toBe(ipBtn);
  expect(row.querySelector(".server-name-cell").textContent).toBe("Updated Recycled Name");
  expect(row.querySelector(".player-badge").textContent).toBe("25/60");
  expect(document.getElementById(`ping-cell-${server.id}`).textContent).toContain("42ms");
  expect(document.getElementById(`meta-cell-${server.id}`).textContent).toContain("Sakhal");
  expect(shieldIcon.className).toBe("shield-med");
  expect(securityCell.title).toBe("Active Moderation Tools Detected");
  expect(securityCell.title).not.toBe(initialTitle);
});

test("R14: canonical favorite sorting orders equivalent hostname and IPv6 favorites first", () => {
  document.getElementById("row-test-server")?.click();
  state.expandedServerId = null;
  state.cachedSortOrder = null;

  const nonFavHighPop = {
    id: "s-nonfav",
    name: "Alpha NonFav",
    ip: "198.51.100.10",
    port: 2302,
    players: 55,
    maxPlayers: 60,
    realPing: 15,
  };
  const favHostname = {
    id: "s-host",
    name: "Bravo HostFav",
    ip: "play.example.com",
    port: 2302,
    players: 5,
    maxPlayers: 60,
    realPing: 30,
  };
  const favIpv6 = {
    id: "s-ipv6",
    name: "Charlie IPv6Fav",
    ip: "2001:db8::1",
    port: 2302,
    players: 2,
    maxPlayers: 60,
    realPing: 40,
  };

  state.allServers = [nonFavHighPop, favHostname, favIpv6];
  // Favorites stored with different casing/brackets/string port
  applyFavoritesSnapshot({
    dataRevision: (state.favoriteDataRevision || 0) + 1,
    entries: [
      { ip: "PLAY.EXAMPLE.COM", port: "2302" },
      { ip: "[2001:DB8::1]", port: "2302" },
    ],
    groups: [],
  });

  renderServers();

  const rowIds = Array.from(
    document.querySelectorAll("#serverListBody tr.server-row"),
  ).map((tr) => tr.id);
  expect(rowIds).toEqual(["row-s-host", "row-s-ipv6", "row-s-nonfav"]);
});

test("R13: favorite-placeholder to hosted-row transition preserves expanded details and focus", async () => {
  const { refreshServers } = require("../../src/renderer/serverBrowser/serverBrowserRender.js");
  resolveQuery([{ id: "123", name: "CF" }]);
  await settleQuery();

  // Set up an expanded favorite placeholder row
  document.getElementById("row-test-server")?.click();
  state.expandedServerId = null;
  state.cachedSortOrder = null;

  const favPlaceholder = {
    id: "fav-192-0-2-55-2302",
    isFavoritePlaceholder: true,
    name: "Placeholder Fav",
    ip: "192.0.2.55",
    port: 2302,
    queryPort: 2303,
    players: 8,
    maxPlayers: 60,
    realPing: 22,
    mods: [{ id: "123", name: "CF" }],
    hasQueriedMods: true,
    modded: true,
  };
  state.allServers = [favPlaceholder];
  renderServers();

  const row = document.getElementById("row-fav-192-0-2-55-2302");
  row.click();
  const detail = document.getElementById("detail-fav-192-0-2-55-2302");
  detail.scrollTop = 64;
  const connectBtn = row.querySelector(".btn-connect");
  connectBtn.focus();

  window.api.servers.fetch = jest.fn().mockResolvedValue([
    {
      id: "custom-192-0-2-55-2302",
      isFavoritePlaceholder: false,
      name: "Now Hosted Server",
      ip: "192.0.2.55",
      port: 2302,
      queryPort: 2303,
      players: 0,
      maxPlayers: 60,
      mods: [{ id: "123", name: "CF" }],
      modded: true,
    },
  ]);
  window.api.servers.ping = jest.fn();

  await refreshServers(true);

  expect(state.expandedServerId).toBe("custom-192-0-2-55-2302");
  expect(document.getElementById("row-custom-192-0-2-55-2302")).toBe(row);
  expect(document.getElementById("detail-custom-192-0-2-55-2302")).toBe(detail);
  expect(detail.scrollTop).toBe(64);
  expect(document.activeElement).toBe(connectBtn);
  expect(row.querySelector(".server-name-cell").textContent).toBe("Now Hosted Server");
  expect(row.querySelector(".player-badge").textContent).toBe("8/60");
});
