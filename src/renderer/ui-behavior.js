import {
  applyFilters,
  serverPassesFilters,
} from "./serverBrowser/serverBrowserCore.js";
import { loadInstalledMods } from "./modManager.js";
import { renderFavoritesManager } from "./favorites.js";
import { renderWatchlist } from "./watchlist.js";
import { loadDiagnostics } from "./diagnostics.js";
import { state } from "./state.js";
import { debounce, countryToFlag, EU_COUNTRIES } from "./utils.js";
import { showToast } from "./feedback.js";
import { connectToServer } from "./serverBrowser/serverBrowserTable.js";

// Set storing currently selected country codes in the filter dropdown

// Dictionary mapping common ISO country codes to readable names for dropdown presentation
const COUNTRY_NAMES = {
  US: "United States",
  DE: "Germany",
  FR: "France",
  GB: "United Kingdom",
  RU: "Russia",
  PL: "Poland",
  CZ: "Czechia",
  CA: "Canada",
  AU: "Australia",
  NL: "Netherlands",
  SE: "Sweden",
  FI: "Finland",
  UA: "Ukraine",
  BR: "Brazil",
  CN: "China",
  JP: "Japan",
  KR: "South Korea",
  SG: "Singapore",
  AT: "Austria",
  BE: "Belgium",
  CH: "Switzerland",
  DK: "Denmark",
  ES: "Spain",
  IE: "Ireland",
  IT: "Italy",
  NO: "Norway",
  PT: "Portugal",
  RO: "Romania",
  NZ: "New Zealand",
  ZA: "South Africa",
  TR: "Turkey",
  HU: "Hungary",
  SK: "Slovakia",
  SI: "Slovenia",
  HR: "Croatia",
  RS: "Serbia",
  BG: "Bulgaria",
  GR: "Greece",
  EE: "Estonia",
  LV: "Latvia",
  LT: "Lithuania",
  CL: "Chile",
  AR: "Argentina",
  MX: "Mexico",
  IN: "India",
  HK: "Hong Kong",
  TW: "Taiwan",
  TH: "Thailand",
  MY: "Malaysia",
  VN: "Vietnam",
  ID: "Indonesia",
  PH: "Philippines",
  IL: "Israel",
  AE: "United Arab Emirates",
  KZ: "Kazakhstan",
};

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
  state.filters.perspective = val;
  document
    .querySelectorAll('[id^="filter-persp-"]')
    .forEach((btn) => btn.classList.remove("active"));
  document.getElementById("filter-persp-" + val).classList.add("active");
  triggerFiltering();
}

export function setCatFilter(val) {
  state.filters.category = val;
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
  if (state.filters.maps.has(val)) {
    state.filters.maps.delete(val);
  } else {
    state.filters.maps.add(val);
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
    cb.checked = state.filters.maps.has(cb.dataset.map);
  });
  const mapSvg = `<app-icon name="map" style="width: 0.95rem; height: 0.95rem;"></app-icon>`;
  if (state.filters.maps.size === 0) {
    tr.innerHTML = `${mapSvg} All Maps ▾`;
    tr.classList.remove("active");
  } else if (state.filters.maps.size >= checkboxes.length) {
    tr.innerHTML = `${mapSvg} All Maps ▾`;
  } else {
    tr.innerHTML = `${mapSvg} ${state.filters.maps.size} Maps ▾`;
    tr.classList.add("active");
  }
}

export function toggleFavFilter() {
  state.flags.favoritesOnly = !state.flags.favoritesOnly;
  const btn = document.getElementById("filter-fav-only");
  btn.classList.toggle("active", state.flags.favoritesOnly);
  btn.setAttribute("aria-pressed", state.flags.favoritesOnly.toString());

  if (state.flags.favoritesOnly && state.flags.hideFavorites) {
    state.flags.hideFavorites = false;
    const hideBtn = document.getElementById("filter-hide-fav");
    if (hideBtn) {
      hideBtn.classList.remove("active");
      hideBtn.setAttribute("aria-pressed", "false");
    }
  }

  triggerFiltering();
}

export function toggleHideFavFilter() {
  state.flags.hideFavorites = !state.flags.hideFavorites;
  const btn = document.getElementById("filter-hide-fav");
  btn.classList.toggle("active", state.flags.hideFavorites);
  btn.setAttribute("aria-pressed", state.flags.hideFavorites.toString());

  if (state.flags.hideFavorites && state.flags.favoritesOnly) {
    state.flags.favoritesOnly = false;
    const favBtn = document.getElementById("filter-fav-only");
    if (favBtn) {
      favBtn.classList.remove("active");
      favBtn.setAttribute("aria-pressed", "false");
    }
  }

  triggerFiltering();
}

export function toggleHideEmpty() {
  state.flags.hideEmpty = !state.flags.hideEmpty;
  const btn = document.getElementById("filter-hide-empty");
  btn.classList.toggle("active", state.flags.hideEmpty);
  btn.setAttribute("aria-pressed", state.flags.hideEmpty.toString());
  triggerFiltering();
}

export function toggleHideFull() {
  state.flags.hideFull = !state.flags.hideFull;
  const btn = document.getElementById("filter-hide-full");
  btn.classList.toggle("active", state.flags.hideFull);
  btn.setAttribute("aria-pressed", state.flags.hideFull.toString());
  triggerFiltering();
}

export function toggleHistoryFilter() {
  state.flags.historyOnly = !state.flags.historyOnly;
  const btn = document.getElementById("filter-history");
  btn.classList.toggle("active", state.flags.historyOnly);
  btn.setAttribute("aria-pressed", state.flags.historyOnly.toString());
  triggerFiltering();
}



// Toggles selection of a specific country code in the filter Set, then triggers re-filtering
export function toggleCountryOption(val) {
  if (state.filters.countries.has(val)) {
    state.filters.countries.delete(val);
  } else {
    state.filters.countries.add(val);
  }
  updateCountryTrigger();
  triggerFiltering();
}

// Synchronizes the checkboxes states and updates the trigger button text to display
// "All Countries", the chosen region name, or the total count of checked items
export function updateCountryTrigger() {
  const tr = document.getElementById("ms-trigger-country");
  if (!tr) return;

  const checkboxes = document.querySelectorAll(
    '#ms-dropdown-country input[type="checkbox"]',
  );
  checkboxes.forEach((cb) => {
    cb.checked = state.filters.countries.has(cb.dataset.country);
  });

  const globeSvg = `<app-icon name="globe" style="width: 0.95rem; height: 0.95rem;"></app-icon>`;
  if (state.filters.countries.size === 0) {
    tr.innerHTML = `${globeSvg} All Countries ▾`;
    tr.classList.remove("active");
  } else {
    let selectedText = "";
    if (state.filters.countries.has("EU_EX_RU")) {
      selectedText = "Europe (excl. RU)";
    }

    if (state.filters.countries.size === 1 && selectedText) {
      tr.innerHTML = `${globeSvg} ${selectedText} ▾`;
    } else {
      tr.innerHTML = `${globeSvg} ${state.filters.countries.size} Countries ▾`;
    }
    tr.classList.add("active");
  }
}

// Dynamically populates the checkboxes list in the country dropdown menu
// Gather countries from servers passing all active filters except the country filter itself.
// Toggles the entire filter group's visibility and preserves scroll position.
export function populateCountryFilterDropdown(onlyUpdateVisibility = false) {
  const dropdown = document.getElementById("ms-dropdown-country");
  if (!dropdown) return;

  const countries = new Set();
  state.allServers.forEach((s) => {
    if (s.country && serverPassesFilters(s, true)) {
      countries.add(s.country.toUpperCase());
    }
  });

  const filterGroup = dropdown.closest(".filter-group");
  if (filterGroup) {
    if (countries.size === 0) {
      filterGroup.style.display = "none";
      return;
    } else {
      filterGroup.style.display = "";
    }
  }

  if (onlyUpdateVisibility) return;

  const sortedCountries = Array.from(countries).sort();

  // Save vertical scroll position to avoid resetting user view on update
  const savedScrollTop = dropdown.scrollTop;

  dropdown.replaceChildren();

  // Check if there are active European servers (excl. RU) to render the virtual option
  const hasEuropeServers = state.allServers.some((s) => {
    return (
      s.country &&
      EU_COUNTRIES.has(s.country.toUpperCase()) &&
      serverPassesFilters(s, true)
    );
  });

  if (hasEuropeServers) {
    const euLabel = document.createElement("label");
    euLabel.className = "ms-item";

    const euCheckbox = document.createElement("input");
    euCheckbox.type = "checkbox";
    euCheckbox.dataset.country = "EU_EX_RU";
    euCheckbox.checked = state.filters.countries.has("EU_EX_RU");
    euCheckbox.addEventListener("change", () =>
      toggleCountryOption("EU_EX_RU"),
    );

    euLabel.appendChild(euCheckbox);
    euLabel.appendChild(document.createTextNode(" 🇪🇺 Europe (excl. RU)"));
    dropdown.appendChild(euLabel);
  }

  // Populate individual checkboxes for active countries
  sortedCountries.forEach((code) => {
    const label = document.createElement("label");
    label.className = "ms-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.country = code;
    checkbox.checked = state.filters.countries.has(code);
    checkbox.addEventListener("change", () => toggleCountryOption(code));

    const name = COUNTRY_NAMES[code] || code;
    const flag = countryToFlag(code);

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(` ${flag} ${name} (${code})`));
    dropdown.appendChild(label);
  });

  updateCountryTrigger();

  // Restore vertical scroll position
  dropdown.scrollTop = savedScrollTop;
}

export function toggleHideLocked() {
  state.flags.hideLocked = !state.flags.hideLocked;
  const btn = document.getElementById("filter-hide-locked");
  btn.classList.toggle("active", state.flags.hideLocked);
  btn.setAttribute("aria-pressed", state.flags.hideLocked.toString());
  triggerFiltering();
}

import { renderServers } from "./serverBrowser/serverBrowserTable.js";

export function triggerFiltering() {
  applyFilters();
  renderServers();
}

// --- Sorting ---
export function handleSort(column) {
  if (state.sort.column === column) {
    state.sort.direction = state.sort.direction === "asc" ? "desc" : "asc";
  } else {
    state.sort.column = column;
    state.sort.direction =
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
    if (ind) ind.textContent = state.sort.direction === "asc" ? "▲" : "▼";
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
  const th = document.getElementById("th-players");
  if (th) {
    th.classList.add("sort-active");
    const ind = th.querySelector(".sort-indicator");
    if (ind) ind.textContent = "▼";
  }

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
  if (winMinBtn)
    winMinBtn.addEventListener("click", () => window.api.ui.windowMin());

  const winMaxBtn = document.getElementById("winMaxBtn");
  if (winMaxBtn)
    winMaxBtn.addEventListener("click", () => window.api.ui.windowMax());

  const winCloseBtn = document.getElementById("winCloseBtn");
  if (winCloseBtn)
    winCloseBtn.addEventListener("click", () => window.api.ui.windowClose());

  const aboutBtn = document.getElementById("aboutBtn");
  if (aboutBtn) aboutBtn.addEventListener("click", openAboutModal);

  const aboutCloseBtn = document.getElementById("aboutCloseBtn");
  if (aboutCloseBtn) aboutCloseBtn.addEventListener("click", closeAboutModal);

  const openLogFileLink = document.getElementById("openLogFileLink");
  if (openLogFileLink)
    openLogFileLink.addEventListener("click", () =>
      window.api.app.openLogFile(),
    );

  document
    .querySelectorAll("#tabs button, .sidebar-tabs button")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabId = btn.id.replace("tab-", "").replace("sidebar-", "");
        switchTab(tabId);
      });
    });

  const directConnectOpenBtn = document.getElementById("directConnectOpenBtn");
  if (directConnectOpenBtn)
    directConnectOpenBtn.addEventListener("click", openDirectConnectModal);

  const directConnectCancelBtn = document.getElementById(
    "directConnectCancelBtn",
  );
  if (directConnectCancelBtn)
    directConnectCancelBtn.addEventListener("click", closeDirectConnectModal);

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
  if (toggleFiltersBtn)
    toggleFiltersBtn.addEventListener("click", toggleFilters);

  const filterPerspAll = document.getElementById("filter-persp-all");
  if (filterPerspAll)
    filterPerspAll.addEventListener("click", () => setPerspFilter("all"));

  const filterPersp1pp = document.getElementById("filter-persp-1pp");
  if (filterPersp1pp)
    filterPersp1pp.addEventListener("click", () => setPerspFilter("1pp"));

  const filterPersp3pp = document.getElementById("filter-persp-3pp");
  if (filterPersp3pp)
    filterPersp3pp.addEventListener("click", () => setPerspFilter("3pp"));

  const filterCatAll = document.getElementById("filter-cat-all");
  if (filterCatAll)
    filterCatAll.addEventListener("click", () => setCatFilter("all"));

  const filterCatVanilla = document.getElementById("filter-cat-vanilla");
  if (filterCatVanilla)
    filterCatVanilla.addEventListener("click", () => setCatFilter("vanilla"));

  const filterCatModded = document.getElementById("filter-cat-modded");
  if (filterCatModded)
    filterCatModded.addEventListener("click", () => setCatFilter("modded"));

  const msTriggerMap = document.getElementById("ms-trigger-map");
  if (msTriggerMap)
    msTriggerMap.addEventListener("click", () => toggleMultiselect("map"));

  document
    .querySelectorAll("#ms-dropdown-map input[type='checkbox']")
    .forEach((cb) => {
      cb.addEventListener("change", () => {
        const mapName = cb.dataset.map;
        toggleMapOption(mapName);
      });
    });

  const msTriggerCountry = document.getElementById("ms-trigger-country");
  if (msTriggerCountry) {
    msTriggerCountry.addEventListener("click", () => {
      populateCountryFilterDropdown();
      toggleMultiselect("country");
    });
  }

  const filterHideEmpty = document.getElementById("filter-hide-empty");
  if (filterHideEmpty)
    filterHideEmpty.addEventListener("click", toggleHideEmpty);

  const filterHideFull = document.getElementById("filter-hide-full");
  if (filterHideFull) filterHideFull.addEventListener("click", toggleHideFull);

  const filterFavOnly = document.getElementById("filter-fav-only");
  if (filterFavOnly) filterFavOnly.addEventListener("click", toggleFavFilter);

  const filterHideFav = document.getElementById("filter-hide-fav");
  if (filterHideFav) filterHideFav.addEventListener("click", toggleHideFavFilter);

  const filterHistory = document.getElementById("filter-history");
  if (filterHistory)
    filterHistory.addEventListener("click", toggleHistoryFilter);



  const filterHideLocked = document.getElementById("filter-hide-locked");
  if (filterHideLocked)
    filterHideLocked.addEventListener("click", toggleHideLocked);

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
  const diagnosticsSidebarTab = document.getElementById(
    "sidebar-tab-diagnostics",
  );
  const showDiagnostics = settings.showDiagnosticsTab !== false ? "" : "none";
  if (diagnosticsTab) diagnosticsTab.style.display = showDiagnostics;
  if (diagnosticsSidebarTab)
    diagnosticsSidebarTab.style.display = showDiagnostics;
}

// Listen for custom events to avoid circular dependencies
document.addEventListener("dzlinux:populate-country-dropdown", (e) => {
  if (e.detail) {
    populateCountryFilterDropdown(!e.detail.isOpen);
  }
});

document.addEventListener("dzlinux:switch-tab", (e) => {
  if (e.detail) {
    switchTab(e.detail.tab);
    if (e.detail.scrollKey) {
      setTimeout(() => {
        const row = document.getElementById(`row-${e.detail.scrollKey}`);
        if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }
});
