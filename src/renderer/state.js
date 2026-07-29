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
    nextRequestId: 0,
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
  currentModLaunchTimer: null,
  currentModCheckGeneration: 0,
};

export async function addFavorite(ip, port, queryPort, name) {
  const key = `${ip}:${port}`;
  if (state.favoritesSet.has(key)) return;

  const nextFavorites = [
    ...state.favorites,
    {
      ip,
      port: parseInt(port, 10),
      queryPort: queryPort || null,
      name: name || "",
    },
  ];

  // Persist first — only commit to local state after the main process
  // confirms the save, so a rejected or failed save never leaves a
  // phantom favorite in the renderer.
  const saved = await window.api.settings.saveFavorites({
    favorites: nextFavorites,
  });
  if (saved === false) throw new Error("Failed to persist favorites");

  state.favorites = nextFavorites;
  state.favoritesSet.add(key);
  if (state.settings) {
    state.settings.favorites = state.favorites;
  }
}

export async function removeFavorite(ip, port) {
  const key = `${ip}:${port}`;
  const nextFavorites = state.favorites.filter(
    (f) => `${f.ip}:${f.port}` !== key,
  );
  if (nextFavorites.length === state.favorites.length) return;

  // Persist first — see addFavorite for rationale.
  const saved = await window.api.settings.saveFavorites({
    favorites: nextFavorites,
  });
  if (saved === false) throw new Error("Failed to persist favorites");

  state.favorites = nextFavorites;
  state.favoritesSet.delete(key);
  if (state.settings) {
    state.settings.favorites = state.favorites;
  }
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

export function setFiltersFromSettings(settings) {
  if (!settings) return;
  state.filters.name = settings.filterName || "";
  state.filters.nameLower = (settings.filterName || "").toLowerCase();
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
  state.settings.filterName = state.filters.name;
  state.settings.filterPerspective = state.filters.perspective;
  state.settings.filterCategory = state.filters.category;
  state.settings.filterMaps = Array.from(state.filters.maps);
  state.settings.filterCountries = Array.from(state.filters.countries);

  state.settings.flagFavoritesOnly = state.flags.favoritesOnly;
  state.settings.flagHideFavorites = state.flags.hideFavorites;
  state.settings.flagHideEmpty = state.flags.hideEmpty;
  state.settings.flagHideFull = state.flags.hideFull;
  state.settings.flagHistoryOnly = state.flags.historyOnly;
  state.settings.flagHideLocked = state.flags.hideLocked;

  if (window.api && window.api.settings && window.api.settings.save) {
    await window.api.settings.save(state.settings);
  }
}
