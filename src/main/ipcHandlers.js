// IPC registration facade — domain handlers live in ./ipc/*.js and are
// composed here so main.js keeps a single entry point.

const { registerSettingsHandlers } = require("./ipc/settingsHandlers");
const { registerServerHandlers } = require("./ipc/serverHandlers");
const { registerGameHandlers } = require("./ipc/gameHandlers");
const { registerModHandlers } = require("./ipc/modHandlers");
const { registerWatchlistHandlers } = require("./ipc/watchlistHandlers");
const { registerSteamworksHandlers } = require("./ipc/steamworksHandlers");
const { registerSystemHandlers } = require("./ipc/systemHandlers");
const { registerHistoryHandlers } = require("./ipc/historyHandlers");

function registerIpcHandlers() {
  registerSettingsHandlers();
  registerServerHandlers();
  registerGameHandlers();
  registerModHandlers();
  registerWatchlistHandlers();
  registerSteamworksHandlers();
  registerSystemHandlers();
  registerHistoryHandlers();
}

module.exports = {
  registerIpcHandlers,
};
