/** @jest-environment jsdom */

const fs = require("node:fs");
const path = require("node:path");

jest.mock("../../src/renderer/feedback.js", () => ({ showToast: jest.fn() }));
jest.mock("../../src/renderer/modManager.js", () => ({
  triggerSteamworksSync: jest.fn(), refreshLocalModsCache: jest.fn().mockResolvedValue(),
}));

const { state, markServerDataChanged } = require("../../src/renderer/state.js");
const { renderServers } = require("../../src/renderer/serverBrowser/serverBrowserTable.js");
const { initFavorites, renderFavoritesManager, getPlaceholderServerById } = require("../../src/renderer/favorites.js");
const { loadServerMods, cancelServerModQueries } = require("../../src/renderer/serverMods.js");

const freshMods = [{ id: "222", name: "Current requirements" }];
const staleMods = [{ id: "111", name: "Obsolete requirements" }];
let onChanged;
let revision = 0;
let renderCallbacks = [];
let browser;
let favorite;
let automatic;

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function renderFrames() {
  while (renderCallbacks.length) {
    const callbacks = renderCallbacks;
    renderCallbacks = [];
    callbacks.forEach(callback => callback());
  }
}

async function settle() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  renderFrames();
}

function detail(view) {
  return document.getElementById(view === "favorites" ? "fav-detail-" + favorite.id : "detail-" + browser.id);
}

function refresh(view) {
  detail(view).querySelector(".btn-refresh-mods").click();
}

function expectBothViews(mods) {
  expect(browser.mods).toEqual(mods);
  expect(getPlaceholderServerById(favorite.id).mods).toEqual(mods);
  for (const view of ["browser", "favorites"]) {
    expect(detail(view).textContent).not.toContain("Obsolete requirements");
    for (const mod of mods) expect(detail(view).textContent).toContain(mod.name);
    if (!mods.length) expect(detail(view).textContent).toContain("No workshop mods detected");
  }
}

beforeAll(async () => {
  document.documentElement.innerHTML = fs.readFileSync(path.join(__dirname, "../../src/index.html"), "utf8");
  document.getElementById("favorites").classList.add("active");
  jest.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { renderCallbacks.push(callback); return renderCallbacks.length; });
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  state.settings = { enableHistory: false };
  const subscribe = () => () => {};
  window.api = {
    servers: { queryMods: jest.fn(), refreshModCache: jest.fn(), cancelPingRequest: jest.fn() },
    mods: { getDownloadSizes: jest.fn().mockResolvedValue([]) },
    favorites: {
      getSnapshot: jest.fn().mockResolvedValue({ revision: 0, dataRevision: 0, entries: [], groups: [], observations: {} }),
      onChanged: callback => { onChanged = callback; return () => {}; },
      onRefreshProgress: subscribe, cancel: jest.fn().mockResolvedValue(),
    },
    watchlist: { getSnapshot: jest.fn().mockResolvedValue({ enabled: true, entries: [] }), onChanged: subscribe },
  };
  await initFavorites();
});

beforeEach(async () => {
  jest.clearAllMocks();
  cancelServerModQueries();
  revision++;
  browser = {
    id: "browser-" + revision, ip: "10.0.0." + revision, port: 2302, queryPort: 2303,
    name: "Test server", mods: [], modded: true, realPing: 20, players: 5, maxPlayers: 60,
  };
  favorite = {
    id: "favorite-" + revision, ip: browser.ip, port: browser.port, queryPort: browser.queryPort,
    name: browser.name, map: "", label: "", groupId: null, pinned: false, addedOrder: 0, revision: 1,
  };
  Object.assign(state, {
    settings: { listMode: "paging", enableHistory: false, enableTrustScore: false },
    allServers: [browser], localModsSet: new Set(), activeDownloads: new Map(),
    expandedServerId: null, expandedFavoriteId: favorite.id, cachedSortOrder: null,
    sort: { column: "players", direction: "desc" }, pagination: { page: 1, size: 50 },
  });
  document.getElementById("serverListBody").replaceChildren();
  automatic = deferred();
  window.api.servers.queryMods.mockReturnValue(automatic.promise);
  window.api.servers.refreshModCache.mockResolvedValue(freshMods);
  onChanged({ revision, dataRevision: revision, entries: [favorite], groups: [], observations: {} });
  renderServers();
  document.getElementById("row-" + browser.id).click();
  renderFavoritesManager();
  await settle();
});

afterEach(async () => {
  automatic.resolve([]);
  await settle();
  cancelServerModQueries();
});

afterAll(() => {
  window.dispatchEvent(new Event("beforeunload"));
  jest.restoreAllMocks();
});

test("one automatic query updates expanded details in Browser and Favorites", async () => {
  expect(detail("browser").textContent).toContain("Querying server for mod list");
  expect(detail("favorites").textContent).toContain("Querying server for mod list");
  automatic.resolve(freshMods);
  await settle();
  expectBothViews(freshMods);
  expect(window.api.servers.queryMods).toHaveBeenCalledTimes(1);
});

test.each(["browser", "favorites"])("a %s refresh supersedes an older automatic query and its cache", async view => {
  refresh(view);
  await settle();
  expectBothViews(freshMods);
  expect(window.api.servers.cancelPingRequest).toHaveBeenCalledTimes(1);
  automatic.resolve(staleMods);
  await settle();
  expectBothViews(freshMods);
  const replacement = { ...browser, mods: [], hasQueriedMods: false };
  expect(await loadServerMods(replacement)).toEqual(freshMods);
  expect(window.api.servers.queryMods).toHaveBeenCalledTimes(1);
});

test("an empty Favorites refresh remains vanilla after an older browser result arrives", async () => {
  window.api.servers.refreshModCache.mockResolvedValue([]);
  refresh("favorites");
  await settle();
  automatic.resolve(staleMods);
  await settle();
  expectBothViews([]);
});

test("an older browser result cannot hide a failed Favorites refresh", async () => {
  window.api.servers.refreshModCache.mockResolvedValue(null);
  refresh("favorites");
  await settle();
  automatic.resolve(staleMods);
  await settle();
  expect(browser.modQueryFailed).toBe(true);
  expect(getPlaceholderServerById(favorite.id).modQueryFailed).toBe(true);
  for (const view of ["browser", "favorites"]) {
    expect(detail(view).textContent).toContain("Unable to fetch mod list");
    expect(detail(view).textContent).not.toContain("Obsolete requirements");
  }
});

test.each(["browser", "favorites"])("a later refresh in the other view supersedes a pending %s refresh", async view => {
  const older = deferred();
  window.api.servers.refreshModCache.mockReturnValueOnce(older.promise).mockResolvedValueOnce(freshMods);
  refresh(view);
  refresh(view === "browser" ? "favorites" : "browser");
  await settle();
  expectBothViews(freshMods);
  older.resolve(staleMods);
  automatic.resolve(staleMods);
  await settle();
  expectBothViews(freshMods);
});

test("server-list refresh cancellation preserves an explicit Favorites refresh", async () => {
  const explicit = deferred();
  window.api.servers.refreshModCache.mockReturnValue(explicit.promise);
  refresh("favorites");
  cancelServerModQueries();
  state.bgPing.generation++;
  explicit.resolve(freshMods);
  await settle();
  expectBothViews(freshMods);
});

test.each([
  ["new mods", freshMods],
  ["a vanilla result", []],
  ["a failed query", null],
])("a Favorites refresh applies %s to the current browser object after replacement", async (_label, result) => {
  const explicit = deferred();
  window.api.servers.refreshModCache.mockReturnValue(explicit.promise);
  refresh("favorites");
  cancelServerModQueries();
  state.bgPing.generation++;
  // A streamed/final list can replace an off-page entry without that new
  // object ever subscribing to the pending mod query through a rendered row.
  browser = {
    ...browser, id: "replacement-" + revision, port: String(browser.port),
    name: "Replacement metadata", map: "enoch", queryPort: 27016,
    mods: staleMods, hasQueriedMods: true, modQueryFailed: false, isQueryingMods: false,
  };
  const other = { ...browser, id: "other-" + revision, port: 2303 };
  state.allServers = [other, browser];
  markServerDataChanged();
  await settle();
  explicit.resolve(result);
  await settle();

  expect(state.allServers[1]).toBe(browser);
  expect(browser).toMatchObject({
    mods: result ?? staleMods, hasQueriedMods: true, modQueryFailed: result === null, isQueryingMods: false,
    name: "Replacement metadata", map: "enoch", queryPort: 27016,
  });
  expect(other.mods).toBe(staleMods);
  expect(other.modQueryFailed).toBe(false);
  automatic.resolve(staleMods);
  await settle();
  expect(browser.mods).toEqual(result ?? staleMods);

  // Opening the refreshed browser entry must show the result it already owns.
  state.expandedServerId = null;
  renderServers();
  document.getElementById("row-" + browser.id).click();
  if (result === null) expect(detail("browser").textContent).toContain("Obsolete requirements");
  else expectBothViews(result);
});

test("completing a Favorites refresh does not restore a server removed from the browser", async () => {
  const explicit = deferred();
  window.api.servers.refreshModCache.mockReturnValue(explicit.promise);
  refresh("favorites");
  cancelServerModQueries();
  state.allServers = [];
  markServerDataChanged();
  explicit.resolve(freshMods);
  await settle();
  expect(state.allServers).toEqual([]);
  expect(getPlaceholderServerById(favorite.id).mods).toEqual(freshMods);
});

test.each([
  ["a fresh empty server", "online", 0, 0, 60],
  ["unknown measurements", "online", 0, null, null],
  ["a stale response", "online", 61000, null, null],
  ["an unreachable server", "unreachable", 0, null, null],
])("Favorites exposes %s honestly to History", async (_label, status, age, reportedPlayers, reportedCapacity) => {
  revision++;
  onChanged({
    revision, dataRevision: revision, entries: [favorite], groups: [],
    observations: { [favorite.id]: {
      status, completedAt: Date.now() - age, ping: 20,
      players: reportedPlayers === 0 ? 0 : age || status === "unreachable" ? 17 : null,
      capacity: reportedCapacity ?? (age || status === "unreachable" ? 80 : null),
    } },
  });
  await settle();
  expect(getPlaceholderServerById(favorite.id)).toMatchObject({ reportedPlayers, reportedCapacity });
});
