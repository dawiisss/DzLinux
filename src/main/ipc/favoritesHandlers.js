const { ipcMain, BrowserWindow } = require("electron");
const repository = require("../favorites");
const queries = require("../favoritesQueries");

const owners = new Set();
function owner(sender) {
  if (!owners.has(sender.id)) {
    owners.add(sender.id);
    sender.on("did-start-loading", () => queries.cancel(sender.id));
    sender.on("render-process-gone", () => queries.cancel(sender.id));
    sender.once("destroyed", () => { queries.cancel(sender.id); owners.delete(sender.id); });
  }
  return sender.id;
}
function broadcast(channel, payload, target = null) {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed() && !win.webContents.isDestroyed() && (target === null || win.webContents.id === target)) win.webContents.send(channel, payload);
}
function registerFavoritesHandlers() {
  ipcMain.handle("favorites:snapshot", (event) => { owner(event.sender); return queries.getSnapshot(); });
  ipcMain.handle("favorites:add", (event, input, token) => queries.add(owner(event.sender), input, token));
  ipcMain.handle("favorites:update", async (_event, id, patch, revision) => { await repository.update(id, patch, revision); return queries.snapshot(); });
  ipcMain.handle("favorites:remove", async (_event, id) => { await repository.remove(id); return queries.snapshot(); });
  ipcMain.handle("favorites:group", async (_event, action, id, name) => { await repository.group(action, id, name); return queries.snapshot(); });
  ipcMain.handle("favorites:preview", (event, input, requestId) => queries.preview(owner(event.sender), input, requestId));
  ipcMain.handle("favorites:refresh", (event, ids, requestId) => queries.refresh(owner(event.sender), ids, requestId));
  ipcMain.handle("favorites:cancel", (event, requestId) => queries.cancel(owner(event.sender), requestId));
  queries.events.on("changed", (snapshot) => broadcast("favorites:changed", snapshot));
  queries.events.on("progress", (progress) => broadcast("favorites:progress", progress, progress.owner));
}
module.exports = { registerFavoritesHandlers };
