const { ipcMain, BrowserWindow } = require("electron");
const { monitor } = require("../watchlistMonitor");
const { createNotifications } = require("../watchlistNotifications");
const settingsManager = require("../settings");
const notifications = createNotifications((event, sender) => monitor.notificationClick(event, sender));
const owners = new Set();

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, payload);
  }
}
function owner(sender) {
  if (!owners.has(sender.id)) {
    owners.add(sender.id);
    sender.on("did-start-loading", () => monitor.releaseOwner(sender.id));
    sender.on("render-process-gone", () => monitor.releaseOwner(sender.id));
    sender.once("destroyed", () => { owners.delete(sender.id); monitor.releaseOwner(sender.id); });
  }
  return sender.id;
}
function validId(value) {
  if (typeof value !== "string" || value.length > 100) throw new Error("Invalid Watchlist request");
  return value;
}
function registerWatchlistHandlers() {
  ipcMain.handle("watchlist:snapshot", (event) => { owner(event.sender); return monitor.getSnapshot(); });
  ipcMain.handle("watchlist:command", (_event, action, args) => monitor.command(action, args));
  ipcMain.handle("watchlist:refresh", () => monitor.refresh());
  ipcMain.handle("watchlist:claim", (event, eventId) => monitor.claimAutoJoin(validId(eventId), owner(event.sender)));
  ipcMain.handle("watchlist:cancel", (event, offerId) => monitor.cancelAutoJoin(validId(offerId), owner(event.sender)));
  ipcMain.handle("watchlist:confirm", (event, offerId) => monitor.confirmAutoJoin(validId(offerId), owner(event.sender)));
  ipcMain.handle("watchlist:resume-auto", () => monitor.resumeAutoJoin());
  ipcMain.handle("connection:begin", (event) => monitor.beginConnection(owner(event.sender)));
  ipcMain.handle("connection:finish", (event, id, launched) => {
    if (typeof launched !== "boolean") throw new Error("Invalid connection result");
    return monitor.finishConnection(validId(id), owner(event.sender), launched);
  });
  monitor.events.on("changed", (snapshot) => broadcast("watchlist:changed", snapshot));
  monitor.events.on("alert", (alert) => { broadcast("watchlist:alert", alert); notifications.deliver(alert); });
  monitor.events.on("offer", (offer) => broadcast("watchlist:offer", offer));
  monitor.events.on("connection-cancelled", (connection) => broadcast("connection:cancelled", connection));
}
async function startWatchlist() {
  const { powerMonitor } = require("electron");
  powerMonitor.on("suspend", () => monitor.sleep());
  powerMonitor.on("resume", () => monitor.wake());
  await monitor.configure(await settingsManager.loadSettingsAsync());
}
async function stopWatchlist() { notifications.close(); await monitor.stop(); }
module.exports = { registerWatchlistHandlers, startWatchlist, stopWatchlist };
