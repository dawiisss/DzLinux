import { state, setFavoritesFromSettings, setFiltersFromSettings } from "./state.js";
import "./components/app-icon.js";
import { initAudio } from "./audio.js";
import { initTheme } from "./theme.js";
import { initSettings } from "./settings.js";
import { initModManager, refreshLocalModsCache } from "./modManager.js";
import { initFavorites } from "./favorites.js";
import { initWatchlist, startWatchlistPoll } from "./watchlist.js";
import { initContextMenu } from "./contextMenu.js";
import { initServerBrowser, refreshServers } from "./serverBrowser.js";
import { initUpdater } from "./updater.js";
import { initCrashDiagnostic } from "./crashDiagnostic.js";
import { initSteamProfile } from "./steamProfile.js";
import { initUIBehavior, applyTabVisibility } from "./ui-behavior.js";
import { initHistoryManager, loadAndRenderHistory } from "./history.js";
import { initHistoryChartModal } from "./historyChartModal.js";

document.addEventListener("DOMContentLoaded", async () => {
  // Version
  const version = await window.api.app.getVersion();
  document.querySelectorAll(".app-version-text").forEach((el) => {
    el.textContent = `v${version}`;
  });

  // Settings
  const settings = await window.api.settings.load();
  state.settings = settings;
  state.pagination.size = settings.serverListPageSize || 50;
  setFavoritesFromSettings(settings);
  setFiltersFromSettings(settings);
  applyTabVisibility(settings);

  const safeInit = async (name, fn) => {
    try {
      const res = fn();
      if (res instanceof Promise) await res;
    } catch (e) {
      console.error(`Failed to initialize module: ${name}`, e);
    }
  };

  // Initialize all modules
  await safeInit("Audio", initAudio);
  await safeInit("Theme", () => initTheme(settings));
  await safeInit("Settings", initSettings);
  await safeInit("ModManager", initModManager);
  await safeInit("Favorites", initFavorites);
  await safeInit("Watchlist", initWatchlist);
  await safeInit("History", initHistoryManager);
  await safeInit("HistoryChartModal", initHistoryChartModal);
  await safeInit("ContextMenu", initContextMenu);
  await safeInit("ServerBrowser", initServerBrowser);
  await safeInit("Updater", initUpdater);
  await safeInit("CrashDiagnostic", initCrashDiagnostic);
  await safeInit("SteamProfile", initSteamProfile);
  await safeInit("UIBehavior", initUIBehavior);

  // Initial data loads
  await safeInit("LocalModsCache", refreshLocalModsCache);
  await safeInit("HistoryLoad", loadAndRenderHistory);
  try {
    refreshServers();
  } catch (e) {
    console.error("Failed to run initial refreshServers:", e);
  }
  try {
    startWatchlistPoll();
  } catch (e) {
    console.error("Failed to run initial startWatchlistPoll:", e);
  }
});
