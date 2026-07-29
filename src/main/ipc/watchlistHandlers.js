// Watchlist IPC handlers: persistence and player-count threshold notifications.

const { ipcMain } = require("electron");
const watchlistManager = require("../watchlist");
const { validateWatchlist, validateCurrentServers } = require("../validation");

function registerWatchlistHandlers() {
  ipcMain.handle("load-watchlist", () => watchlistManager.loadWatchlist());
  ipcMain.handle("save-watchlist", (_event, watchlist) => {
    if (!validateWatchlist(watchlist)) {
      return Promise.reject(new Error("Invalid watchlist payload"));
    }
    return watchlistManager.saveWatchlist(watchlist);
  });
  ipcMain.handle(
    "check-watchlist-thresholds",
    async (event, currentServers) => {
      if (!validateCurrentServers(currentServers)) return [];
      const triggered =
        await watchlistManager.processWatchlistChecks(currentServers);
      if (triggered && triggered.length > 0) {
        if (!event.sender.isDestroyed()) {
          event.sender.send("watchlist-notify", triggered);
        }
      }
      return triggered;
    },
  );
}

module.exports = {
  registerWatchlistHandlers,
};
