import { applyFilters } from "./serverBrowser.js";
import { loadInstalledMods } from "./modManager.js";
import { renderFavoritesManager } from "./favorites.js";
import { renderWatchlist } from "./watchlist.js";
import { loadDiagnostics } from "./diagnostics.js";
import { state } from "./state.js";
import { debounce } from "./utils.js";
import { showToast } from "./feedback.js";
import { connectToServer } from "./serverBrowser/serverBrowserTable.js";


let currentPerspFilter = "all";
let currentCatFilter = "all";
const currentMapFilter = new Set();
let currentFavFilter = false;
let currentHideEmpty = false;
let currentHideFull = false;
let currentHistoryFilter = false;
let currentSortColumn = "players";
let currentSortDirection = "desc";
let currentHideFakes = true;
let currentHideLocked = false;

// --- Modals ---
export function openDirectConnectModal() {
  document.getElementById("directConnectModal").style.display = "flex";
}
export function closeDirectConnectModal() {
  document.getElementById("directConnectModal").style.display = "none";
}

export function openAboutModal() {
  document.getElementById("aboutModal").style.display = "flex";
}
export function closeAboutModal() {
  document.getElementById("aboutModal").style.display = "none";
}


// --- Tabs & UI Feedback ---
export function toggleFilters() {
  const bar = document.getElementById("filterOptionsBar");
  if (bar.style.display === "none") {
    bar.style.display = "flex";
  } else {
    bar.style.display = "none";
  }
}

export function switchTab(tabId) {
  document
    .querySelectorAll(".tab-content")
    .forEach((el) => el.classList.remove("active"));
  document
    .querySelectorAll("#tabs button, .sidebar-tabs button")
    .forEach((el) => el.classList.remove("active"));

  const targetEl = document.getElementById(tabId);
  if (targetEl) targetEl.classList.add("active");

  const tabBtn = document.getElementById("tab-" + tabId);
  if (tabBtn) tabBtn.classList.add("active");

  const sidebarTabBtn = document.getElementById("sidebar-tab-" + tabId);
  if (sidebarTabBtn) sidebarTabBtn.classList.add("active");

  if (tabId === "browser") {
    import("./serverBrowser.js").then(({ refreshExpandedServerMods }) => {
      if (refreshExpandedServerMods) refreshExpandedServerMods();
    });
  }
  if (tabId === "mods") loadInstalledMods();
  if (tabId === "favorites") renderFavoritesManager();
  if (tabId === "watchlist") renderWatchlist();
  if (tabId === "diagnostics") loadDiagnostics();
}

export function setPerspFilter(val) {
  currentPerspFilter = val;
  document
    .querySelectorAll('[id^="filter-persp-"]')
    .forEach((btn) => btn.classList.remove("active"));
  document.getElementById("filter-persp-" + val).classList.add("active");
  triggerFiltering();
}

export function setCatFilter(val) {
  currentCatFilter = val;
  document
    .querySelectorAll('[id^="filter-cat-"]')
    .forEach((btn) => btn.classList.remove("active"));
  document.getElementById("filter-cat-" + val).classList.add("active");
  triggerFiltering();
}

export function toggleMultiselect(name) {
  const dd = document.getElementById("ms-dropdown-" + name);
  const tr = document.getElementById("ms-trigger-" + name);
  if (dd.style.display === "block") {
    dd.style.display = "none";
    tr.classList.remove("active");
  } else {
    if (dd.parentElement !== document.body) document.body.appendChild(dd);
    const rect = tr.getBoundingClientRect();
    dd.style.position = "fixed";
    dd.style.top = rect.bottom + 4 + "px";
    dd.style.left = rect.left + "px";
    dd.style.display = "block";
    tr.classList.add("active");
  }
}

export function toggleMapOption(val) {
  if (currentMapFilter.has(val)) {
    currentMapFilter.delete(val);
  } else {
    currentMapFilter.add(val);
  }
  updateMapTrigger();
  triggerFiltering();
}

export function updateMapTrigger() {
  const tr = document.getElementById("ms-trigger-map");
  const checkboxes = document.querySelectorAll(
    '#ms-dropdown-map input[type="checkbox"]',
  );
  checkboxes.forEach((cb) => {
    cb.checked = currentMapFilter.has(cb.dataset.map);
  });
  const mapSvg = `<app-icon name="map" style="width: 0.95rem; height: 0.95rem;"></app-icon>`;
  if (currentMapFilter.size === 0) {
    tr.innerHTML = `${mapSvg} ALL MAPS ▾`;
    tr.classList.remove("active");
  } else if (currentMapFilter.size >= checkboxes.length) {
    tr.innerHTML = `${mapSvg} ALL MAPS ▾`;
  } else {
    tr.innerHTML = `${mapSvg} ${currentMapFilter.size} MAPS ▾`;
    tr.classList.add("active");
  }
}

export function toggleFavFilter() {
  currentFavFilter = !currentFavFilter;
  const btn = document.getElementById("filter-fav-only");
  btn.classList.toggle("active", currentFavFilter);
  btn.setAttribute("aria-pressed", currentFavFilter.toString());
  triggerFiltering();
}

export function toggleHideEmpty() {
  currentHideEmpty = !currentHideEmpty;
  const btn = document.getElementById("filter-hide-empty");
  btn.classList.toggle("active", currentHideEmpty);
  btn.setAttribute("aria-pressed", currentHideEmpty.toString());
  triggerFiltering();
}

export function toggleHideFull() {
  currentHideFull = !currentHideFull;
  const btn = document.getElementById("filter-hide-full");
  btn.classList.toggle("active", currentHideFull);
  btn.setAttribute("aria-pressed", currentHideFull.toString());
  triggerFiltering();
}

export function toggleHistoryFilter() {
  currentHistoryFilter = !currentHistoryFilter;
  const btn = document.getElementById("filter-history");
  btn.classList.toggle("active", currentHistoryFilter);
  btn.setAttribute("aria-pressed", currentHistoryFilter.toString());
  triggerFiltering();
}

export function toggleHideFakes() {
  currentHideFakes = !currentHideFakes;
  const btn = document.getElementById("filter-hide-fakes");
  btn.classList.toggle("active", currentHideFakes);
  btn.setAttribute("aria-pressed", currentHideFakes.toString());
  triggerFiltering();
}

export function toggleHideLocked() {
  currentHideLocked = !currentHideLocked;
  const btn = document.getElementById("filter-hide-locked");
  btn.classList.toggle("active", currentHideLocked);
  btn.setAttribute("aria-pressed", currentHideLocked.toString());
  triggerFiltering();
}

export function triggerFiltering() {
  applyFilters({
    persp: currentPerspFilter,
    cat: currentCatFilter,
    maps: currentMapFilter,
    favOnly: currentFavFilter,
    hideEmpty: currentHideEmpty,
    hideFull: currentHideFull,
    history: currentHistoryFilter,
    sortCol: currentSortColumn,
    sortDir: currentSortDirection,
    hideFakes: currentHideFakes,
    hideLocked: currentHideLocked,
  });
}

// --- Sorting ---
export function handleSort(column) {
  if (currentSortColumn === column) {
    currentSortDirection = currentSortDirection === "asc" ? "desc" : "asc";
  } else {
    currentSortColumn = column;
    currentSortDirection =
      column === "name" || column === "ip" ? "asc" : "desc";
  }
  document.querySelectorAll(".server-table th.sortable").forEach((th) => {
    th.classList.remove("sort-active");
    const ind = th.querySelector(".sort-indicator");
    if (ind) ind.textContent = "";
  });
  const activeTh = document.getElementById("th-" + column);
  if (activeTh) {
    activeTh.classList.add("sort-active");
    const ind = activeTh.querySelector(".sort-indicator");
    if (ind) ind.textContent = currentSortDirection === "asc" ? "▲" : "▼";
  }
  triggerFiltering();
}

// --- Setup ---
export function initUIBehavior() {
  // Close multiselect on outside click
  document.addEventListener("click", (e) => {
    if (
      !e.target.closest(".multiselect-dropdown") &&
      !e.target.closest(".multiselect-trigger")
    ) {
      document
        .querySelectorAll(".multiselect-dropdown")
        .forEach((d) => (d.style.display = "none"));
      document
        .querySelectorAll(".multiselect-trigger")
        .forEach((t) => t.classList.remove("active"));
    }
  });

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    const doSearch = debounce(() => {
      state.filters.name = searchInput.value.trim();
      triggerFiltering();
    }, 250);
    searchInput.addEventListener("input", doSearch);
  }

  // Set initial sort indicator
  document.addEventListener("DOMContentLoaded", () => {
    const th = document.getElementById("th-players");
    if (th) {
      th.classList.add("sort-active");
      const ind = th.querySelector(".sort-indicator");
      if (ind) ind.textContent = "▼";
    }
  });

  // Global hotkeys: Ctrl+F (focus search) and Ctrl+R (refresh list)
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        switchTab("browser");
        const searchInput = document.getElementById("searchInput");
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        const refreshBtn = document.getElementById("refreshServersBtn");
        if (refreshBtn) {
          refreshBtn.click();
        }
      }
    }
  });

  // Dynamic Event Listeners
  const winMinBtn = document.getElementById("winMinBtn");
  if (winMinBtn) winMinBtn.addEventListener("click", () => window.api.ui.windowMin());

  const winMaxBtn = document.getElementById("winMaxBtn");
  if (winMaxBtn) winMaxBtn.addEventListener("click", () => window.api.ui.windowMax());

  const winCloseBtn = document.getElementById("winCloseBtn");
  if (winCloseBtn) winCloseBtn.addEventListener("click", () => window.api.ui.windowClose());

  const aboutBtn = document.getElementById("aboutBtn");
  if (aboutBtn) aboutBtn.addEventListener("click", openAboutModal);

  const aboutCloseBtn = document.getElementById("aboutCloseBtn");
  if (aboutCloseBtn) aboutCloseBtn.addEventListener("click", closeAboutModal);

  const openLogFileLink = document.getElementById("openLogFileLink");
  if (openLogFileLink) openLogFileLink.addEventListener("click", () => window.api.app.openLogFile());

  document.querySelectorAll("#tabs button, .sidebar-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.id.replace("tab-", "").replace("sidebar-", "");
      switchTab(tabId);
    });
  });

  const directConnectOpenBtn = document.getElementById("directConnectOpenBtn");
  if (directConnectOpenBtn) directConnectOpenBtn.addEventListener("click", openDirectConnectModal);

  const directConnectCancelBtn = document.getElementById("directConnectCancelBtn");
  if (directConnectCancelBtn) directConnectCancelBtn.addEventListener("click", closeDirectConnectModal);

  const directConnectBtn = document.getElementById("directConnectBtn");
  if (directConnectBtn) {
    directConnectBtn.addEventListener("click", () => {
      const ipInput = document.getElementById("directIpInput");
      const portInput = document.getElementById("directPortInput");
      const ip = ipInput ? ipInput.value.trim() : "";
      const port = portInput ? portInput.value.trim() : "";
      if (!ip || !port) {
        showToast("Please enter both IP and port", "#ff5a5f", "⚠️");
        return;
      }
      connectToServer(ip, port);
      closeDirectConnectModal();
    });
  }

  const toggleFiltersBtn = document.getElementById("toggleFiltersBtn");
  if (toggleFiltersBtn) toggleFiltersBtn.addEventListener("click", toggleFilters);

  const filterPerspAll = document.getElementById("filter-persp-all");
  if (filterPerspAll) filterPerspAll.addEventListener("click", () => setPerspFilter("all"));

  const filterPersp1pp = document.getElementById("filter-persp-1pp");
  if (filterPersp1pp) filterPersp1pp.addEventListener("click", () => setPerspFilter("1pp"));

  const filterPersp3pp = document.getElementById("filter-persp-3pp");
  if (filterPersp3pp) filterPersp3pp.addEventListener("click", () => setPerspFilter("3pp"));

  const filterCatAll = document.getElementById("filter-cat-all");
  if (filterCatAll) filterCatAll.addEventListener("click", () => setCatFilter("all"));

  const filterCatVanilla = document.getElementById("filter-cat-vanilla");
  if (filterCatVanilla) filterCatVanilla.addEventListener("click", () => setCatFilter("vanilla"));

  const filterCatModded = document.getElementById("filter-cat-modded");
  if (filterCatModded) filterCatModded.addEventListener("click", () => setCatFilter("modded"));

  const msTriggerMap = document.getElementById("ms-trigger-map");
  if (msTriggerMap) msTriggerMap.addEventListener("click", () => toggleMultiselect("map"));

  document.querySelectorAll("#ms-dropdown-map input[type='checkbox']").forEach((cb) => {
    cb.addEventListener("change", () => {
      const mapName = cb.dataset.map;
      toggleMapOption(mapName);
    });
  });

  const filterHideEmpty = document.getElementById("filter-hide-empty");
  if (filterHideEmpty) filterHideEmpty.addEventListener("click", toggleHideEmpty);

  const filterHideFull = document.getElementById("filter-hide-full");
  if (filterHideFull) filterHideFull.addEventListener("click", toggleHideFull);

  const filterFavOnly = document.getElementById("filter-fav-only");
  if (filterFavOnly) filterFavOnly.addEventListener("click", toggleFavFilter);

  const filterHistory = document.getElementById("filter-history");
  if (filterHistory) filterHistory.addEventListener("click", toggleHistoryFilter);

  const filterHideFakes = document.getElementById("filter-hide-fakes");
  if (filterHideFakes) filterHideFakes.addEventListener("click", toggleHideFakes);

  const filterHideLocked = document.getElementById("filter-hide-locked");
  if (filterHideLocked) filterHideLocked.addEventListener("click", toggleHideLocked);

  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const field = th.id.replace("th-", "");
      handleSort(field);
    });
  });

  document.querySelectorAll(".external-link").forEach((el) => {
    el.addEventListener("click", () => {
      const url = el.getAttribute("data-url");
      if (url) window.api.ui.openExternal(url);
    });
  });
}

export function applyTabVisibility(settings) {
  const watchlistTab = document.getElementById("tab-watchlist");
  const watchlistSidebarTab = document.getElementById("sidebar-tab-watchlist");
  const showWatchlist = settings.showWatchlistTab !== false ? "" : "none";
  if (watchlistTab) watchlistTab.style.display = showWatchlist;
  if (watchlistSidebarTab) watchlistSidebarTab.style.display = showWatchlist;

  const diagnosticsTab = document.getElementById("tab-diagnostics");
  const diagnosticsSidebarTab = document.getElementById("sidebar-tab-diagnostics");
  const showDiagnostics = settings.showDiagnosticsTab !== false ? "" : "none";
  if (diagnosticsTab) diagnosticsTab.style.display = showDiagnostics;
  if (diagnosticsSidebarTab) diagnosticsSidebarTab.style.display = showDiagnostics;
}
