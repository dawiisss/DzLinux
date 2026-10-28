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

test("R10: single-response server refresh preserves measurements already received from a live ping", async () => {
  jest.useFakeTimers();
  try {
    document.body.innerHTML = '<table><tbody id="serverListBody"></tbody></table>';
    state.settings = { autoRefreshEnabled: false };
    state.sort = { column: "name", direction: "asc" };
    const existing = {
      id: "custom-1-2-3-4-2302",
      ip: "1.2.3.4",
      port: 2302,
      name: "Server",
      players: 0,
      maxPlayers: 60,
      reportedPlayers: null,
      reportedCapacity: null,
    };
    state.allServers = [existing];
    const unqueried = {
      id: "custom-1-2-3-4-2302",
      ip: "1.2.3.4",
      port: 2302,
      name: "Server",
      players: 0,
      maxPlayers: 60,
      reportedPlayers: null,
      reportedCapacity: null,
    };
    window.api = {
      servers: {
        fetch: jest.fn(async () => {
          applyPingResult(state.allServers[0], {
            status: "online",
            ping: 20,
            players: 17,
            maxPlayers: 80,
            reportedPlayers: 17,
            reportedCapacity: 80,
          });
          return [unqueried];
        }),
        ping: jest.fn(),
      },
    };
    await refreshServers();
    expect(state.allServers).toHaveLength(1);
    expect(state.allServers[0]).toBe(existing);
    expect(state.allServers[0]).toMatchObject({
      players: 17,
      maxPlayers: 80,
      reportedPlayers: 17,
      reportedCapacity: 80,
      realPing: 20,
    });
    expect(window.api.servers.ping).not.toHaveBeenCalled();
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test("R11: overlapping manual and auto-refresh with unchanged inputs coalesce into a single fetch and restart one timer", async () => {
  jest.useFakeTimers();
  try {
    document.body.innerHTML = `
      <button id="refreshServersBtn"></button>
      <span id="countdownBadge"></span>
      <table><tbody id="serverListBody"></tbody></table>
    `;
    state.settings = {
      autoRefreshEnabled: true,
      autoRefreshTime: 60,
      modDirectory: "/workshop",
      enableTrustScore: true,
    };
    state.favorites = [];
    state.allServers = [];

    let resolveFetch;
    window.api = {
      servers: {
        fetch: jest.fn(
          () =>
            new Promise((resolve) => {
              resolveFetch = resolve;
            }),
        ),
        ping: jest.fn().mockResolvedValue({ ping: 15, players: 4, maxPlayers: 60 }),
        cancelPingGeneration: jest.fn(),
      },
    };

    const autoPromise = refreshServers(true);
    const manualPromise = refreshServers(false);
    expect(manualPromise).toBe(autoPromise);
    expect(document.getElementById("refreshServersBtn").disabled).toBe(true);
    await Promise.resolve();
    expect(window.api.servers.fetch).toHaveBeenCalledTimes(1);

    resolveFetch([{ id: "custom-1-1-1-1-2302", ip: "1.1.1.1", port: 2302, name: "One" }]);
    await Promise.all([autoPromise, manualPromise]);

    expect(window.api.servers.fetch).toHaveBeenCalledTimes(1);
    expect(document.getElementById("refreshServersBtn").disabled).toBe(false);
    expect(state.autoRefresh.interval).not.toBeNull();
    expect(state.autoRefresh.countdownInterval).not.toBeNull();
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test("R12: stale refresh generation completion or failure cannot overwrite newer state, mark footer offline, or restart timers", async () => {
  jest.useFakeTimers();
  try {
    document.body.innerHTML = `
      <span id="footerStatusDot"></span>
      <span id="footerStatusText"></span>
      <div id="connectionBanner"></div>
      <span id="countdownBadge"></span>
      <table><tbody id="serverListBody"></tbody></table>
    `;
    state.settings = {
      autoRefreshEnabled: false,
      modDirectory: "/workshop-a",
      enableTrustScore: true,
    };
    state.favorites = [];
    state.allServers = [];

    const pendingFetches = [];
    window.api = {
      servers: {
        fetch: jest.fn(
          () =>
            new Promise((resolve, reject) => {
              pendingFetches.push({ resolve, reject });
            }),
        ),
        ping: jest.fn().mockResolvedValue({ ping: 10, players: 2, maxPlayers: 60 }),
        cancelPingGeneration: jest.fn(),
      },
    };

    // Start first refresh with /workshop-a
    const firstRun = refreshServers(false);
    await Promise.resolve();

    // Supersede by changing modDirectory and triggering second refresh
    state.settings.modDirectory = "/workshop-b";
    const secondRun = refreshServers(false);
    await Promise.resolve();

    expect(pendingFetches).toHaveLength(2);
    expect(window.api.servers.cancelPingGeneration).toHaveBeenCalled();

    // Resolve second (newer) refresh first
    pendingFetches[1].resolve([
      { id: "custom-2-2-2-2-2302", ip: "2.2.2.2", port: 2302, name: "Newer Server" },
    ]);
    await secondRun;
    expect(state.allServers).toHaveLength(1);
    expect(state.allServers[0].ip).toBe("2.2.2.2");
    expect(document.getElementById("footerStatusText").textContent).toBe("Connected");

    // Reject first (older) refresh after newer already succeeded
    pendingFetches[0].reject(new Error("Stale network error"));
    await firstRun;

    // Older failure must not mark footer Offline or clobber state.allServers
    expect(state.allServers).toHaveLength(1);
    expect(state.allServers[0].ip).toBe("2.2.2.2");
    expect(document.getElementById("footerStatusText").textContent).toBe("Connected");
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test("R10: 15,000 synthetic rows ingest in a single pass with unique entries", async () => {
  document.body.innerHTML = '<table><tbody id="serverListBody"></tbody></table>';
  state.settings = { autoRefreshEnabled: false, queryConcurrency: 1 };
  state.favorites = [];
  state.allServers = [];

  const synthetic = Array.from({ length: 15000 }, (_, i) => {
    const b2 = Math.floor(i / 256);
    const b3 = i % 256;
    const ip = `10.1.${b2}.${b3}`;
    return {
      id: `custom-10-1-${b2}-${b3}-2302`,
      ip,
      port: 2302,
      name: `Server ${i}`,
      players: i % 60,
      maxPlayers: 60,
      realPing: 25,
    };
  });

  let renderEvents = 0;
  const onRender = () => {
    renderEvents++;
  };
  document.addEventListener("dzlinux:render-servers", onRender);
  try {
    window.api = {
      servers: {
        fetch: jest.fn().mockResolvedValue(synthetic),
        ping: jest.fn(),
      },
    };
    await refreshServers(false);
    expect(state.allServers).toHaveLength(15000);
    expect(renderEvents).toBe(1);
  } finally {
    document.removeEventListener("dzlinux:render-servers", onRender);
  }
});

test("clicking Refresh preserves live A2S server names/metadata instead of reverting to 'Unknown Server' and re-pings servers", async () => {
  document.body.innerHTML = '<span id="refreshProgressIndicator" hidden></span><table><tbody id="serverListBody"></tbody></table>';
  state.settings = { autoRefreshEnabled: false, queryConcurrency: 5 };
  state.favorites = [];
  state.allServers = [];

  const phonebookEntry = {
    id: "custom-145-239-149-79-2302",
    ip: "145.239.149.79",
    port: 2302,
    queryPort: 27016,
    name: "Unknown Server",
    country: "DE",
    players: 0,
    maxPlayers: 60,
    reportedPlayers: null,
    reportedCapacity: null,
    thirdPerson: true,
    modded: true,
    map: "",
    time: "",
    password: false,
  };

  let pingCount = 0;
  window.api = {
    servers: {
      fetch: jest.fn(async () => [{ ...phonebookEntry }]),
      ping: jest.fn(async () => {
        pingCount++;
        return {
          status: "online",
          name: pingCount === 1 ? "DayZ EU Official #1" : "DayZ EU Official #1 (Updated)",
          ping: pingCount === 1 ? 47 : 39,
          players: pingCount === 1 ? 58 : 64,
          maxPlayers: 100,
          reportedPlayers: pingCount === 1 ? 58 : 64,
          reportedCapacity: 100,
          map: "chernarusplus",
          time: "14:20",
          thirdPerson: false,
          modded: false,
          password: true,
        };
      }),
      cancelPingGeneration: jest.fn(),
    },
  };

  // First load + initial ping sweep
  await refreshServers(false);
  await new Promise((r) => setTimeout(r, 20));
  expect(pingCount).toBe(1);
  expect(state.allServers[0]).toMatchObject({
    name: "DayZ EU Official #1",
    players: 58,
    maxPlayers: 100,
    realPing: 47,
    map: "chernarusplus",
    time: "14:20",
    thirdPerson: false,
    modded: false,
    password: true,
  });

  // Second refresh: pause ping resolution to inspect state immediately after fetch reconciliation
  let resolveSecondPing;
  window.api.servers.ping.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveSecondPing = resolve;
      }),
  );

  await refreshServers(false);
  // While second ping is still in progress, indicator must be visible with tooltip
  const indicator = document.getElementById("refreshProgressIndicator");
  expect(indicator.hidden).toBe(false);
  expect(indicator.title).toBe("Refreshing server list...");
  // Immediately after fetch reconciliation (before second ping resolves), name and metadata must NOT revert to "Unknown Server"
  expect(state.allServers[0].name).toBe("DayZ EU Official #1");
  expect(state.allServers[0].map).toBe("chernarusplus");
  expect(state.allServers[0].time).toBe("14:20");
  expect(state.allServers[0].thirdPerson).toBe(false);
  expect(state.allServers[0].modded).toBe(false);
  expect(state.allServers[0].password).toBe(true);
  expect(window.api.servers.ping).toHaveBeenCalledTimes(2);

  // Now resolve the second ping and verify live measurements update
  resolveSecondPing({
    status: "online",
    name: "DayZ EU Official #1",
    ping: 39,
    players: 64,
    maxPlayers: 100,
    reportedPlayers: 64,
    reportedCapacity: 100,
    map: "chernarusplus",
    time: "15:00",
    thirdPerson: false,
    modded: false,
    password: true,
  });
  await new Promise((r) => setTimeout(r, 20));
  expect(indicator.hidden).toBe(true);
  expect(state.allServers[0]).toMatchObject({
    name: "DayZ EU Official #1",
    players: 64,
    maxPlayers: 100,
    realPing: 39,
    time: "15:00",
  });
});
