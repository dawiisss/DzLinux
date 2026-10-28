import { favoriteKey } from "./favoriteIdentity.js";
// Central mutable state for the renderer process.
// All feature modules import from here to ensure a single source of truth.

export const state = {
  // Loaded once at bootstrap
  settings: null,

  // Favorites
  favorites: [],
  favoritesSet: new Set(),
  favoriteGroups: [],
  favoriteDataRevision: 0,
  expandedFavoriteId: null,

  // Connection history
  history: [],
  historySet: new Set(),

  // Server browser
  allServers: [],
  serverDataRevision: 0,
  filters: {
    name: "",
    nameLower: "",
    perspective: "all",
    category: "all",
    maps: new Set(),
    countries: new Set(),
  },
  flags: {
    favoritesOnly: false,
    hideFavorites: false,
    hideEmpty: false,
    hideFull: false,
    historyOnly: false,
    hideLocked: false,
  },
  sort: {
    column: "players",
    direction: "desc",
  },
  pagination: {
    page: 1,
    size: 50,
  },
  expandedServerId: null,
  localMods: [],
  localModsSet: new Set(),
  modScanSnapshot: null,
  lastCompleteModSizeBytes: null,
  lastCompleteModRoot: null,

  // Background pinging
  bgPing: {
    isRunning: false,
    generation: 0,
    nextRequestId: 0,
  },
  totalPingedCount: 0,

  // Auto-refresh
  autoRefresh: {
    interval: null,
    countdownInterval: null,
    seconds: 360,
  },

  // Active mod downloads
  activeDownloads: new Map(),

  // Mod loadouts
  modLoadouts: {},

  // Interaction
  hoveredRowId: null,
  contextMenu: {
    current: null,
  },
  cachedSortOrder: null,
  currentModCheckInterval: null,
  currentModLaunchTimer: null,
  currentModCheckGeneration: 0,
  currentModQueryRequestId: null,
};

export function markServerDataChanged() {
  state.serverDataRevision++;
  document.dispatchEvent(new CustomEvent("dzlinux:server-data-changed"));
}

export function setHistoryRecords(records) {
  state.history = records.slice(0, 500).map((record) => ({
    id: record.id || record.ip + ":" + record.port,
    ip: record.ip, port: record.port, queryPort: record.queryPort || null,
    name: record.name, map: record.map,
    ping: record.lastPing ?? record.ping ?? null,
    players: record.lastPlayers ?? record.players ?? null,
    maxPlayers: record.maxPlayers ?? null,
    lastJoined: record.lastJoined ?? null,
    playCount: record.playCount ?? 0,
  }));
  state.historySet = new Set(state.history.map((record) => record.ip + ":" + record.port));
  window.dispatchEvent(new CustomEvent("history-updated"));
}

export function upsertHistoryRecord(record) {
  if (!record) return;
  const id = record.ip + ":" + record.port;
  setHistoryRecords([record, ...state.history.filter((entry) => entry.ip + ":" + entry.port !== id)]);
}

let favoritesQueue = Promise.resolve();

function queueFavoriteChange(change) {
  const result = favoritesQueue.then(change);
  favoritesQueue = result.catch(() => {});
  return result;
}

export function applyFavoritesSnapshot(snapshot) {
  if (!snapshot || snapshot.dataRevision < state.favoriteDataRevision) return;
  const before = [...state.favoritesSet].sort().join("|");
  state.favorites = snapshot.entries.map((entry) => ({ ...entry }));
  state.favoriteGroups = snapshot.groups.map((group) => ({ ...group }));
  state.favoriteDataRevision = snapshot.dataRevision;
  state.favoritesSet = new Set(state.favorites.map((entry) => favoriteKey(entry.ip, entry.port)));
  if (state.settings) state.settings.favorites = state.favorites;
  window.dispatchEvent(new CustomEvent("favorites-changed", { detail: snapshot }));
  if (before !== [...state.favoritesSet].sort().join("|")) document.dispatchEvent(new CustomEvent("dzlinux:render-servers"));
}

export function addFavorite(ip, port, queryPort, name) {
  return queueFavoriteChange(async () => {
    if (state.favoritesSet.has(favoriteKey(ip, port))) return;
    const snapshot = await window.api.favorites.add({ ip, port, queryPort: queryPort || null, fallbackName: (name || "").slice(0, 200) });
    applyFavoritesSnapshot(snapshot);
  });
}

export function removeFavorite(ip, port) {
  return queueFavoriteChange(async () => {
    const entry = state.favorites.find((favorite) => favoriteKey(favorite.ip, favorite.port) === favoriteKey(ip, port));
    if (!entry) return;
    applyFavoritesSnapshot(await window.api.favorites.remove(entry.id));
  });
}

export function setFiltersFromSettings(settings) {
  if (!settings) return;
  const filterName =
    typeof settings.filterName === "string" ? settings.filterName : "";
  state.filters.name = filterName;
  state.filters.nameLower = filterName.toLowerCase();
  state.filters.perspective = settings.filterPerspective || "all";
  state.filters.category = settings.filterCategory || "all";
  state.filters.maps = new Set(settings.filterMaps || []);
  state.filters.countries = new Set(settings.filterCountries || []);

  state.flags.favoritesOnly = settings.flagFavoritesOnly || false;
  state.flags.hideFavorites = settings.flagHideFavorites || false;
  state.flags.hideEmpty = settings.flagHideEmpty || false;
  state.flags.hideFull = settings.flagHideFull || false;
  state.flags.historyOnly = settings.flagHistoryOnly || false;
  state.flags.hideLocked = settings.flagHideLocked || false;
}

export async function saveFiltersToSettings() {
  if (!state.settings) return;
  const filterPatch = {
    filterName: state.filters.name,
    filterPerspective: state.filters.perspective,
    filterCategory: state.filters.category,
    filterMaps: Array.from(state.filters.maps),
    filterCountries: Array.from(state.filters.countries),
    flagFavoritesOnly: state.flags.favoritesOnly,
    flagHideFavorites: state.flags.hideFavorites,
    flagHideEmpty: state.flags.hideEmpty,
    flagHideFull: state.flags.hideFull,
    flagHistoryOnly: state.flags.historyOnly,
    flagHideLocked: state.flags.hideLocked,
  };
  Object.assign(state.settings, filterPatch);

  if (window.api && window.api.settings && window.api.settings.save) {
    await window.api.settings.save(filterPatch);
  }
}
