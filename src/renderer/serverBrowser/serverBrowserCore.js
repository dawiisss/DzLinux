import { state } from "../state.js";
import { MAP_NORMALIZE } from "../utils.js";

export function serverPassesFilters(server) {
  if (server.realPing === undefined) return false;

  const term = state.filters.nameLower;
  if (term) {
    const matchesName =
      server.name.toLowerCase().includes(term) ||
      server.ip.includes(term) ||
      (server.port && server.port.toString().includes(term));
    if (!matchesName) return false;
  }

  if (state.filters.perspective === "1pp" && server.thirdPerson) return false;
  if (state.filters.perspective === "3pp" && !server.thirdPerson) return false;

  if (state.filters.category === "vanilla" && server.modded) return false;
  if (state.filters.category === "modded" && !server.modded) return false;

  if (state.filters.maps.size > 0) {
    if (!server.map) return false;
    const normalizedMap = MAP_NORMALIZE[server.map.toLowerCase()];
    const topMaps = ["chernarus", "livonia", "namalsk", "sakhal", "deerisle"];
    const matches = normalizedMap && state.filters.maps.has(normalizedMap);
    const isOther =
      state.filters.maps.has("other") &&
      (!normalizedMap || !topMaps.includes(normalizedMap));
    if (!matches && !isOther) return false;
  }

  const isFav = state.favoritesSet.has(`${server.ip}:${server.port}`);
  if (state.flags.favoritesOnly && !isFav) return false;

  if (state.flags.hideEmpty && server.players === 0) return false;
  if (state.flags.hideFull && server.players >= server.maxPlayers) return false;
  if (state.flags.hideLocked && server.password) return false;

  if (state.flags.historyOnly) {
    const inHistory = state.historySet.has(`${server.ip}:${server.port}`);
    if (!inHistory) return false;
  }

  if (
    !isFav &&
    state.flags.hideTimeouts &&
    server.realPing === -1 &&
    state.expandedServerId !== server.id
  )
    return false;
  if (
    !isFav &&
    state.flags.hideFakes &&
    server.failedPing &&
    server.players >= 60 &&
    state.expandedServerId !== server.id
  )
    return false;

  return true;
}

export function applyFilters({
  persp,
  cat,
  maps,
  favOnly,
  hideEmpty,
  hideFull,
  history,
  sortCol,
  sortDir,
  hideTimeouts,
  hideFakes,
  hideLocked,
}) {
  state.filters.perspective = persp;
  state.filters.category = cat;
  state.filters.maps = maps;
  state.flags.favoritesOnly = favOnly;
  state.flags.hideEmpty = hideEmpty;
  state.flags.hideFull = hideFull;
  state.flags.historyOnly = history;
  state.sort.column = sortCol;
  state.sort.direction = sortDir;
  state.flags.hideTimeouts = hideTimeouts;
  state.flags.hideFakes = hideFakes;
  state.flags.hideLocked = hideLocked;
  state.filters.nameLower = state.filters.name.toLowerCase();

  state.pagination.page = 1;
  state.cachedSortOrder = null;
  // We'll import dynamically or call through facade
  import("../serverBrowser.js").then(({ renderServers }) => {
    renderServers();
  });
}

export function getCombinedAndFilteredServers() {
  const combinedServers = [...state.allServers];
  state.favorites.forEach((fav) => {
    const ip = fav.ip;
    const port = typeof fav.port === "number" ? fav.port : parseInt(fav.port);
    const exists = combinedServers.find(
      (s) => s.ip === ip && s.port.toString() === port.toString()
    );
    if (!exists) {
      combinedServers.push({
        id: `fav-${ip}-${port}`,
        name: fav.name || "UNKNOWN SERVER (OFFLINE / UNLISTED)",
        ip: ip,
        port: port,
        queryPort: fav.queryPort || null,
        players: 0,
        maxPlayers: 0,
        status: "offline",
        mods: [],
        thirdPerson: true,
        modded: false,
        ping: undefined,
        country: "",
        isPinging: false,
        realPing: -1,
      });
    }
  });

  return combinedServers.filter(serverPassesFilters);
}
