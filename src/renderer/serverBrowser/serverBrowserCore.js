import { state } from "../state.js";
import { MAP_NORMALIZE, EU_COUNTRIES } from "../utils.js";

// Evaluates if a server satisfies all active filter configurations.
// The optional excludeCountryFilter flag allows other components (like dropdown population)
// to query server feasibility without considering current country filter state.
export function serverPassesFilters(server, excludeCountryFilter = false) {
  if (server.realPing === undefined) return false;
  if (server.failedPing || server.realPing === -1) return false;

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

  // Match server country against selected country filters
  if (!excludeCountryFilter && state.filters.countries.size > 0) {
    if (!server.country) return false;
    const serverCountry = server.country.toUpperCase();
    let matched = false;
    for (const code of state.filters.countries) {
      if (code === "EU_EX_RU") {
        // Virtual code matching European countries except Russia
        if (EU_COUNTRIES.has(serverCountry)) {
          matched = true;
          break;
        }
      } else if (code === serverCountry) {
        // Direct matching of individual ISO country code
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }

  return true;
}

export function applyFilters() {
  state.filters.nameLower = state.filters.name.toLowerCase();

  state.pagination.page = 1;
  state.cachedSortOrder = null;
}

export function getCombinedAndFilteredServers() {
  const result = [];
  const serverSet = new Set();

  for (const s of state.allServers) {
    serverSet.add(`${s.ip}:${s.port}`);
    if (serverPassesFilters(s)) {
      result.push(s);
    }
  }

  for (const fav of state.favorites) {
    const ip = fav.ip;
    const port = typeof fav.port === "number" ? fav.port : parseInt(fav.port);
    const key = `${ip}:${port}`;
    if (!serverSet.has(key)) {
      const fakeServer = {
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
      };
      if (serverPassesFilters(fakeServer)) {
        result.push(fakeServer);
      }
    }
  }

  return result;
}
