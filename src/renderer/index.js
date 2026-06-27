import { state, setFavoritesFromSettings } from "./state.js";
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
import { initSteamProfile } from "./steamProfile.js";
import { initUIBehavior, applyTabVisibility } from "./ui-behavior.js";

document.addEventListener("DOMContentLoaded", async () => {
  // Version
  const version = await window.api.app.getVersion();
  document.querySelectorAll(".app-version-text").forEach((el) => {
    el.textContent = `v${version}`;
  });

  // Settings
  const settings = await window.api.settings.load();
  state.settings = settings;
  setFavoritesFromSettings(settings);
  applyTabVisibility(settings);

  // Initialize all modules
  initAudio();
  initTheme(settings);
  await initSettings();
  initModManager();
  initFavorites();
  initWatchlist();
  initContextMenu();
  initServerBrowser();
  initUpdater();
  await initSteamProfile();
  initUIBehavior();

  // Initial data loads
  await refreshLocalModsCache();
  refreshServers();
  startWatchlistPoll();
});
