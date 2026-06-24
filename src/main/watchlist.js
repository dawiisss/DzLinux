const { Notification: ElectronNotification, BrowserWindow, app } = require("electron");
const path = require("path");
const fs = require("fs");
const settingsManager = require("./settings");

const WATCHLIST_FILE = path.join(app.getPath("userData"), "watchlist.json");

/**
 * Loads the watchlist from persistent settings.
 *
 * @remarks
 * The watchlist is stored in a standalone `watchlist.json` file.
 * If the file does not exist, it checks the legacy `settings.watchlist` for migration,
 * and defaults to an empty array to prevent undefined errors.
 *
 * @returns {Array<{ip: string, port: number, name: string, active: boolean, threshold: number, mode: string, lastStatus: string}>} The current watchlist array.
 */
function loadWatchlist() {
  try {
    if (fs.existsSync(WATCHLIST_FILE)) {
      const content = fs.readFileSync(WATCHLIST_FILE, "utf8");
      return JSON.parse(content) || [];
    }
    // Migration check
    const settings = settingsManager.loadSettings();
    if (settings.watchlist && settings.watchlist.length > 0) {
      const watchlist = settings.watchlist;
      saveWatchlist(watchlist);
      // Clean up from settings to avoid future confusion
      delete settings.watchlist;
      settingsManager.saveSettings(settings);
      return watchlist;
    }
  } catch (e) {
    console.error("Failed to load watchlist:", e.message);
  }
  return [];
}

/**
 * Saves the watchlist to persistent settings.
 *
 * @remarks
 * This function persists the entire watchlist array back to a standalone file.
 *
 * @param {Array<{ip: string, port: number, name: string, active: boolean, threshold: number, mode: string, lastStatus: string}>} watchlist - The updated watchlist array.
 * @returns {boolean} True if the settings were successfully saved to disk, false otherwise.
 */
function saveWatchlist(watchlist) {
  try {
    fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(watchlist, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("Failed to save watchlist:", e.message);
    return false;
  }
}

/**
 * Evaluates the current server population against the watchlist thresholds
 * and triggers native desktop notifications if conditions are met.
 *
 * @remarks
 * This is the core background check loop for the Watchlist feature. It compares
 * incoming server updates against the user's watched servers.
 *
 * A notification only fires if:
 * 1. The watched server is currently marked as `active` in the UI.
 * 2. The server's status is 'online'.
 * 3. The player count crosses the threshold (`<=` for 'below' mode, `>=` for 'above' mode).
 * 4. We haven't already notified the user during this threshold event (`lastStatus !== 'notified'`).
 *
 * If a server's population moves back across the threshold (e.g., it fills up again),
 * its state resets to 'idle', allowing it to trigger a new notification if it dips again.
 *
 * @param {Array<{ip: string, port: number, status: string, players: number, name: string}>} currentServers - Array of freshly queried server status objects.
 */
function processWatchlistChecks(currentServers) {
  const settings = settingsManager.loadSettings();
  const watchlist = loadWatchlist();
  const globalThreshold =
    settings.watchlistThreshold !== undefined
      ? settings.watchlistThreshold
      : 50;
  let changed = false;
  const triggeredNotifications = [];

  const iconPath = path.join(__dirname, "..", "assets", "icon.png");

  let activeCount = 0;
  let matchedOnlineCount = 0;
  let triggeredCount = 0;

  watchlist.forEach((item) => {
    if (!item.active) return;
    activeCount++;

    const server = currentServers.find(
      (s) => s.ip === item.ip && s.port === item.port,
    );
    if (!server || server.status !== "online") return;
    matchedOnlineCount++;

    const threshold =
      item.threshold !== undefined ? item.threshold : globalThreshold;
    const mode = item.mode || "below";

    const isTriggered =
      mode === "above"
        ? server.players >= threshold
        : server.players <= threshold;

    if (isTriggered && item.lastStatus !== "notified") {
      const title =
        mode === "above"
          ? "🎯 Population Target Reached"
          : "🟢 Server Slot Available";
      const body = `${server.name || item.name} now has ${server.players} players. (Threshold: ${mode === "above" ? ">=" : "<="} ${threshold})`;

      console.log(`[Watchlist] NOTIFY: ${title} — ${body}`);

      let nativeShown = false;
      if (ElectronNotification.isSupported()) {
        try {
          const n = new ElectronNotification({ title, body, icon: iconPath });
          n.show();
          n.on("click", () => {
            BrowserWindow.getAllWindows().forEach((win) => {
              if (win.isMinimized()) win.restore();
              win.show();
              win.focus();
              win.webContents.send("open-watchlist");
            });
          });
          nativeShown = true;
          console.log("[Watchlist] Native notification shown");
        } catch (e) {
          console.error("[Watchlist] Notification.show failed:", e.message);
        }
      } else {
        console.log("[Watchlist] Notification.isSupported() returned false");
      }

      triggeredNotifications.push({ title, body, nativeShown });
      triggeredCount++;

      item.lastStatus = "notified";
      changed = true;
    } else if (!isTriggered && item.lastStatus === "notified") {
      console.log(
        `[Watchlist] RESET: ${item.name || item.ip} — threshold no longer met, rearming`,
      );
      item.lastStatus = "idle";
      changed = true;
    }
  });

  console.log(
    `[Watchlist] Poll: ${watchlist.length} watched, ${activeCount} active, ${matchedOnlineCount} matched online, ${triggeredCount} triggered`,
  );

  if (changed) {
    // Reload fresh watchlist to avoid clobbering concurrent UI edits.
    const freshWatchlist = loadWatchlist();

    const oldByKey = new Map();
    watchlist.forEach((item) => oldByKey.set(`${item.ip}:${item.port}`, item));

    freshWatchlist.forEach((freshItem) => {
      const oldItem = oldByKey.get(`${freshItem.ip}:${freshItem.port}`);
      if (oldItem) {
        freshItem.lastStatus = oldItem.lastStatus;
      }
    });

    saveWatchlist(freshWatchlist);
  }

  return triggeredNotifications;
}

module.exports = {
  loadWatchlist,
  saveWatchlist,
  processWatchlistChecks,
};
