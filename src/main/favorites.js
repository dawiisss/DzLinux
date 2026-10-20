const { EventEmitter } = require("node:events");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { app } = require("electron");
const settings = require("./settings");
const favoriteModel = require("./favoritesModel");

const events = new EventEmitter();
let initialization = null;
let reloadNeeded = false;
const dto = (document) => ({ dataRevision: document.favoritesRevision, entries: document.favorites, groups: document.favoriteGroups });

function initialize() {
  if (!initialization) initialization = (async () => {
    if (reloadNeeded) { await settings.reloadSettings(); reloadNeeded = false; }
    const current = await settings.loadSettingsAsync();
    if (current.favoritesSchemaVersion === 2) return favoriteModel.validate(current);
    return settings.updateSettings(async (document) => {
      if (document.favoritesSchemaVersion === 2) return;
      const original = JSON.stringify({ favorites: document.favorites, favoriteNames: document.favoriteNames, favoritePorts: document.favoritePorts });
      const candidate = favoriteModel.migrate(JSON.parse(JSON.stringify(document)));
      const backup = path.join(app.getPath("userData"), "favorites-v1-backup.json");
      await fs.mkdir(path.dirname(backup), { recursive: true });
      try { await fs.writeFile(backup, original, { flag: "wx", mode: 0o600 }); }
      catch (error) {
        if (error.code !== "EEXIST") throw error;
        if (await fs.readFile(backup, "utf8") !== original) await fs.writeFile(backup + "." + randomUUID(), original, { flag: "wx", mode: 0o600 });
      }
      Object.assign(document, candidate);
      delete document.favoriteNames; delete document.favoritePorts;
    });
  })().catch((error) => { initialization = null; reloadNeeded = true; throw error; });
  return initialization;
}
async function getSnapshot() {
  await initialize();
  return dto(favoriteModel.validate(await settings.loadSettingsAsync()));
}
async function mutate(change) {
  await initialize();
  const document = await settings.updateSettings((current) => {
    favoriteModel.validate(current);
    change(current);
    current.favoritesRevision++;
    favoriteModel.validate(current);
  });
  const snapshot = dto(document);
  events.emit("changed", snapshot);
  return snapshot;
}
function existing(document, id) {
  const entry = document.favorites.find((item) => item.id === id);
  if (!entry) throw new Error("Favorite no longer exists");
  return entry;
}
function validGroup(document, groupId) {
  if (groupId !== null && !document.favoriteGroups.some((group) => group.id === groupId)) throw new Error("Group no longer exists");
}
function add(input, verified = null) {
  if (!input || Object.keys(input).some((field) => !["ip", "port", "queryPort", "label", "groupId", "pinned", "fallbackName"].includes(field))) throw new Error("Invalid favorite configuration");
  const identity = favoriteModel.address(input);
  const fallbackName = favoriteModel.text(input.fallbackName ?? "", 200, "Server name");
  const config = favoriteModel.patch({ label: input.label ?? "", groupId: input.groupId ?? null, pinned: input.pinned ?? false });
  return mutate((document) => {
    if (document.favorites.some((entry) => favoriteModel.key(entry) === favoriteModel.key(identity))) throw new Error("This server is already a favorite. View or edit the existing favorite.");
    if (document.favorites.length >= 1000) throw new Error("Favorites limit reached (1000)");
    validGroup(document, config.groupId);
    document.favorites.push({ ...identity, ...config, id: randomUUID(), name: verified?.name?.slice(0, 200) || fallbackName, map: verified?.map?.slice(0, 100) || "",
      queryPort: verified?.queryPort ?? identity.queryPort, addedOrder: Math.max(-1, ...document.favorites.map((entry) => entry.addedOrder)) + 1, revision: 1 });
  });
}
function update(id, input, revision) {
  const config = favoriteModel.patch(input);
  return mutate((document) => {
    const entry = existing(document, id);
    if (entry.revision !== revision) throw new Error("This favorite changed. Reopen it to edit the latest version.");
    if (config.groupId !== undefined) validGroup(document, config.groupId);
    Object.assign(entry, config); entry.revision++;
  });
}
function remove(id) {
  return mutate((document) => { existing(document, id); document.favorites = document.favorites.filter((entry) => entry.id !== id); });
}
function group(action, id, input) {
  const name = action === "delete" ? null : favoriteModel.text(input, 40, "Group name");
  if (name === "") throw new Error("Enter a group name");
  return mutate((document) => {
    if (action !== "create" && !document.favoriteGroups.some((item) => item.id === id)) throw new Error("Group no longer exists");
    if (name && document.favoriteGroups.some((item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) throw new Error("A group with this name already exists");
    if (action === "create") {
      if (document.favoriteGroups.length >= 50) throw new Error("Group limit reached (50)");
      document.favoriteGroups.push({ id: randomUUID(), name });
    } else if (action === "rename") document.favoriteGroups.find((item) => item.id === id).name = name;
    else if (action === "delete") {
      document.favoriteGroups = document.favoriteGroups.filter((item) => item.id !== id);
      for (const entry of document.favorites) if (entry.groupId === id) { entry.groupId = null; entry.revision++; }
    } else throw new Error("Invalid group action");
  });
}
async function learn(id, identity, result, currentRequest = () => true) {
  const before = await getSnapshot();
  const entry = before.entries.find((item) => item.id === id && favoriteModel.key(item) === favoriteModel.key(identity));
  if (!entry || !currentRequest()) return;
  const metadata = { name: typeof result.name === "string" && result.name.trim() ? result.name.slice(0, 200) : entry.name,
    map: typeof result.map === "string" && result.map.trim() ? result.map.slice(0, 100) : entry.map,
    queryPort: result.queryPort ?? entry.queryPort };
  if (Object.keys(metadata).every((field) => entry[field] === metadata[field])) return;
  return mutate((document) => {
    const current = document.favorites.find((item) => item.id === id && favoriteModel.key(item) === favoriteModel.key(identity));
    if (current && currentRequest()) Object.assign(current, metadata);
  });
}
async function flush() { if (initialization) await initialization.catch(() => {}); await settings.flushSettings(); }
module.exports = { events, initialize, getSnapshot, add, update, remove, group, learn, flush };
