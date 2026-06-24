import { applyFilters } from "./serverBrowser.js";
import { showConfirmModal } from "./feedback.js";
import { loadInstalledMods } from "./modManager.js";
import { renderFavoritesManager } from "./favorites.js";
import { renderWatchlist } from "./watchlist.js";
import { loadDiagnostics } from "./diagnostics.js";
import { state } from "./state.js";
import { debounce } from "./utils.js";

let currentPerspFilter = "all";
let currentCatFilter = "all";
const currentMapFilter = new Set();
let currentFavFilter = false;
let currentHideEmpty = false;
let currentHideFull = false;
let currentHistoryFilter = false;
let currentSortColumn = "players";
let currentSortDirection = "desc";
let currentHideTimeouts = true;
let currentHideFakes = true;

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
    .querySelectorAll("#tabs button")
    .forEach((el) => el.classList.remove("active"));

  document.getElementById(tabId).classList.add("active");
  document.getElementById("tab-" + tabId).classList.add("active");

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
  if (currentMapFilter.size === 0) {
    tr.textContent = "🗺️ ALL MAPS ▾";
    tr.classList.remove("active");
  } else if (currentMapFilter.size >= checkboxes.length) {
    tr.textContent = "🗺️ ALL MAPS ▾";
  } else {
    tr.textContent = `🗺️ ${currentMapFilter.size} MAPS ▾`;
    tr.classList.add("active");
  }
}

export function toggleFavFilter() {
  currentFavFilter = !currentFavFilter;
  const btn = document.getElementById("filter-fav-only");
  btn.classList.toggle("active", currentFavFilter);
  triggerFiltering();
}

export function toggleHideEmpty() {
  currentHideEmpty = !currentHideEmpty;
  document
    .getElementById("filter-hide-empty")
    .classList.toggle("active", currentHideEmpty);
  triggerFiltering();
}

export function toggleHideFull() {
  currentHideFull = !currentHideFull;
  document
    .getElementById("filter-hide-full")
    .classList.toggle("active", currentHideFull);
  triggerFiltering();
}

export function toggleHistoryFilter() {
  currentHistoryFilter = !currentHistoryFilter;
  document
    .getElementById("filter-history")
    .classList.toggle("active", currentHistoryFilter);
  triggerFiltering();
}

export function toggleHideTimeouts() {
  currentHideTimeouts = !currentHideTimeouts;
  document
    .getElementById("filter-hide-timeouts")
    .classList.toggle("active", currentHideTimeouts);
  triggerFiltering();
}

export function toggleHideFakes() {
  currentHideFakes = !currentHideFakes;
  document
    .getElementById("filter-hide-fakes")
    .classList.toggle("active", currentHideFakes);
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
    hideTimeouts: currentHideTimeouts,
    hideFakes: currentHideFakes,
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
}

// Bridge: attach tab-switching functions to window for inline HTML onclick handlers
window.switchTab = switchTab;
window.toggleFilters = toggleFilters;
window.openDirectConnectModal = openDirectConnectModal;
window.closeDirectConnectModal = closeDirectConnectModal;
window.openAboutModal = openAboutModal;
window.closeAboutModal = closeAboutModal;
window.setPerspFilter = setPerspFilter;
window.setCatFilter = setCatFilter;
window.toggleMultiselect = toggleMultiselect;
window.toggleMapOption = toggleMapOption;
window.toggleFavFilter = toggleFavFilter;
window.toggleHideEmpty = toggleHideEmpty;
window.toggleHideFull = toggleHideFull;
window.toggleHistoryFilter = toggleHistoryFilter;
window.toggleHideTimeouts = toggleHideTimeouts;
window.toggleHideFakes = toggleHideFakes;
window.handleSort = handleSort;
window.showConfirmModal = showConfirmModal;
