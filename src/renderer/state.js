// Central mutable state for the renderer process.
// All feature modules import from here to ensure a single source of truth.

export const state = {
  // Loaded once at bootstrap
  settings: null,

  // Favorites
  favorites: [],
  favoritesSet: new Set(),

  // Connection history
  history: [],
  historySet: new Set(),

  // Server browser
  allServers: [],
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

  // Background pinging
  bgPing: {
    isRunning: false,
    generation: 0,
  },
  totalPingedCount: 0,

  // Auto-refresh
  autoRefresh: {
    interval: null,
    countdownInterval: null,
    seconds: 360,
  },

  // Watchlist
  watchlist: {
    pollInterval: null,
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
};

export async function addFavorite(ip, port, queryPort, name) {
  const key = `${ip}:${port}`;
  if (!state.favoritesSet.has(key)) {
    state.favorites.push({
      ip,
      port: parseInt(port, 10),
      queryPort: queryPort || null,
      name: name || "",
    });
    state.favoritesSet.add(key);
    if (state.settings) {
      state.settings.favorites = state.favorites;
    }
    await window.api.settings.saveFavorites({ favorites: state.favorites });
  }
}

export async function removeFavorite(ip, port) {
  const key = `${ip}:${port}`;
  state.favorites = state.favorites.filter((f) => `${f.ip}:${f.port}` !== key);
  state.favoritesSet.delete(key);
  if (state.settings) {
    state.settings.favorites = state.favorites;
  }
  await window.api.settings.saveFavorites({ favorites: state.favorites });
}

export function setFavoritesFromSettings(settings) {
  state.favorites = settings.favorites || [];
  state.favoritesSet = new Set(state.favorites.map((f) => `${f.ip}:${f.port}`));
  
  const rawHistory = settings.history || [];
  state.history = rawHistory.filter(
    (h) => h && typeof h.ip === "string" && h.port
  );
  if (state.history.length !== rawHistory.length) {
    settings.history = state.history;
    if (window.api && window.api.settings && window.api.settings.save) {
      window.api.settings.save(settings).catch((e) => {
        console.error("Failed to save cleaned settings history:", e.message);
      });
    }
  }
  state.historySet = new Set(state.history.map((h) => `${h.ip}:${h.port}`));
}
