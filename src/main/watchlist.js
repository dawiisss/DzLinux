const { Notification: ElectronNotification, BrowserWindow, app } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const settingsManager = require("./settings");
const { writeJsonAtomically } = require("./fileUtils");
const { validateCurrentServers, validateWatchlist } = require("./validation");

const WATCHLIST_FILE = path.join(app.getPath("userData"), "watchlist.json");
const activeNotifications = new Set();

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
let cachedWatchlist = null;

async function loadWatchlist() {
  if (cachedWatchlist !== null) {
    return [...cachedWatchlist];
  }
  try {
    const exists = await fs.promises.access(WATCHLIST_FILE).then(() => true).catch(() => false);
    if (exists) {
      const content = await fs.promises.readFile(WATCHLIST_FILE, "utf8");
      cachedWatchlist = JSON.parse(content) || [];
      return [...cachedWatchlist];
    }
    // Migration check
    const settings = await settingsManager.loadSettingsAsync();
    if (settings.watchlist && settings.watchlist.length > 0) {
      const watchlist = settings.watchlist;
      cachedWatchlist = [...watchlist];
      await saveWatchlist(watchlist);
      // Clean up from settings to avoid future confusion
      delete settings.watchlist;
      await settingsManager.saveSettings(settings);
      return watchlist;
    }
  } catch (e) {
    console.error("Failed to load watchlist:", e.message);
  }
  cachedWatchlist = [];
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
async function saveWatchlist(watchlist) {
  try {
    if (!validateWatchlist(watchlist)) return false;
    cachedWatchlist = [...watchlist];
    await writeJsonAtomically(WATCHLIST_FILE, watchlist);
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
async function processWatchlistChecks(currentServers) {
  if (!validateCurrentServers(currentServers)) return [];
  const settings = await settingsManager.loadSettingsAsync();
  const watchlist = await loadWatchlist();
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

  const serverMap = new Map(currentServers.map((s) => [`${s.ip}:${s.port}`, s]));

  watchlist.forEach((item) => {
    if (!item.active) {
      if (item.lastStatus === "notified") {
        console.log(
          `[Watchlist] RESET: ${item.name || item.ip} — item deactivated, resetting status to idle`,
        );
        item.lastStatus = "idle";
        changed = true;
      }
      return;
    }
    activeCount++;

    const server = serverMap.get(`${item.ip}:${item.port}`);
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
      const targetServerPayload = {
        ip: item.ip,
        port: item.port,
        queryPort: server.queryPort || item.queryPort || null,
        name: server.name || item.name || "Unknown Server",
        autoJoin: !!item.autoJoin,
      };

      if (ElectronNotification.isSupported()) {
        try {
          const n = new ElectronNotification({ title, body, icon: iconPath });
          activeNotifications.add(n);

          const cleanup = () => {
            activeNotifications.delete(n);
          };

          n.on("click", () => {
            cleanup();
            BrowserWindow.getAllWindows().forEach((win) => {
              if (win.isMinimized()) win.restore();
              win.show();
              win.focus();
              win.webContents.send("open-watchlist");
              win.webContents.send(
                "open-watchlist-autojoin",
                targetServerPayload,
              );
            });
          });

          n.on("close", cleanup);
          n.on("failed", cleanup);

          n.show();
          nativeShown = true;
          console.log("[Watchlist] Native notification shown");
        } catch (e) {
          console.error("[Watchlist] Notification.show failed:", e.message);
        }
      } else {
        console.log("[Watchlist] Notification.isSupported() returned false");
      }

      triggeredNotifications.push({
        title,
        body,
        nativeShown,
        autoJoin: !!item.autoJoin,
        server: targetServerPayload,
      });
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
    await saveWatchlist(watchlist);
  }

  return triggeredNotifications;
}

module.exports = {
  loadWatchlist,
  saveWatchlist,
  processWatchlistChecks,
  _clearCache: () => {
    cachedWatchlist = null;
  },
};
