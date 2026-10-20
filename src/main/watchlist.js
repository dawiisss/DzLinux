const { app } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const { writeJsonAtomically } = require("./fileUtils");
const settingsManager = require("./settings");
const { validateWatchlist, isValidActivityId } = require("./validation");
const { sanitizeConfig, identity } = require("./watchlistModel");

const file = path.join(app.getPath("userData"), "watchlist.json");
let cached = null;
let loading = null;
let writes = Promise.resolve();
const clone = (value) => JSON.parse(JSON.stringify(value));

function validateDocument(document) {
  if (!document || document.schemaVersion !== 2 || !Number.isSafeInteger(document.revision) || document.revision < 1 ||
      !Array.isArray(document.entries) || document.entries.length > 1000) throw new Error("Unsupported or invalid watchlist file");
  const ids = new Set();
  const addresses = new Set();
  for (const entry of document.entries) {
    const config = Object.fromEntries(["ip", "port", "queryPort", "name", "condition", "alertPolicy", "cooldownSeconds", "autoJoin", "priority"].map((key) => [key, entry[key]]));
    sanitizeConfig(config);
    if (!isValidActivityId(entry.id) || ids.has(entry.id) || addresses.has(identity(entry)) ||
        typeof entry.enabled !== "boolean" || !Number.isSafeInteger(entry.configRevision) || entry.configRevision < 1 ||
        ![null, "user", "alerted"].includes(entry.pausedReason) ||
        (entry.enabled ? entry.pausedReason !== null : entry.pausedReason === null) ||
        typeof entry.episodeLatched !== "boolean" || typeof entry.pendingEpisode !== "boolean" ||
        ![entry.snoozedUntil, entry.lastAlertAt].every((v) => v === null || (Number.isSafeInteger(v) && v > 0 && v <= 8640000000000000)) ||
        !(entry.lastEventId === null || isValidActivityId(entry.lastEventId))) throw new Error("Invalid watchlist entry; original file preserved");
    ids.add(entry.id);
    addresses.add(identity(entry));
  }
  return document;
}

function createEntry(config, priority = 1) {
  return {
    id: randomUUID(), ip: config.ip, port: config.port, queryPort: null, name: "",
    condition: { type: "free-slots", value: 1 }, alertPolicy: "once", cooldownSeconds: 300,
    autoJoin: false, priority, ...config, enabled: true, configRevision: 1,
    pausedReason: null, snoozedUntil: null, lastAlertAt: null, lastEventId: null,
    episodeLatched: false, pendingEpisode: false,
  };
}

async function readDocument() {
  let text;
  let legacySettings = null;
  try { text = await fs.readFile(file, "utf8"); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    legacySettings = await settingsManager.loadSettingsAsync();
    if (!legacySettings.watchlist?.length) return { schemaVersion: 2, revision: 1, entries: [] };
    text = JSON.stringify(legacySettings.watchlist);
  }
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) return validateDocument(parsed);
  if (!validateWatchlist(parsed)) throw new Error("Invalid legacy watchlist; original file preserved");
  const settings = legacySettings || await settingsManager.loadSettingsAsync();
  const seen = new Set();
  const entries = [];
  for (const old of parsed) {
    const config = sanitizeConfig({
      ip: old.ip, port: old.port, queryPort: old.queryPort ?? null, name: old.name || "",
      condition: { type: old.mode === "above" ? "population-at-least" : "legacy-player-at-most", value: old.threshold ?? settings.watchlistThreshold ?? 50 },
      alertPolicy: "repeat", cooldownSeconds: 300, autoJoin: old.autoJoin ?? false, priority: entries.length + 1,
    });
    if (seen.has(identity(config))) continue;
    seen.add(identity(config));
    const entry = createEntry(config);
    Object.assign(entry, { enabled: old.active, pausedReason: old.active ? null : "user", episodeLatched: old.lastStatus === "notified" });
    entries.push(entry);
  }
  // Keep the complete original, including duplicate legacy entries, for recovery.
  try { await fs.writeFile(file + ".v1-backup", text, { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const document = validateDocument({ schemaVersion: 2, revision: 1, entries });
  await writeJsonAtomically(file, document);
  if (legacySettings) await settingsManager.saveSettings({ ...legacySettings, watchlist: [] });
  return document;
}

async function loadDocument() {
  if (cached) return clone(cached);
  if (!loading) loading = readDocument().then((document) => { cached = document; }).finally(() => { loading = null; });
  await loading;
  return clone(cached);
}

function mutate(change) {
  const operation = writes.then(async () => {
    const candidate = await loadDocument();
    const result = change(candidate.entries);
    candidate.revision++;
    validateDocument(candidate);
    await writeJsonAtomically(file, candidate);
    cached = candidate;
    return clone(result ?? candidate);
  });
  writes = operation.catch(() => {});
  return operation;
}

function add(input) {
  const config = sanitizeConfig(input);
  return mutate((entries) => {
    if (entries.length >= 1000) throw new Error("Watchlist limit reached");
    if (entries.some((entry) => identity(entry) === identity(config))) throw new Error("This server is already watched");
    const entry = createEntry(config, Math.min(1000, Math.max(0, ...entries.map((e) => e.priority)) + 1));
    entries.push(entry);
    return entry;
  });
}

function update(id, change) {
  return mutate((entries) => {
    const entry = entries.find((item) => item.id === id);
    if (!entry) throw new Error("Watch no longer exists");
    change(entry);
    return entry;
  });
}

function remove(id) {
  return mutate((entries) => {
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) throw new Error("Watch no longer exists");
    entries.splice(index, 1);
  });
}

module.exports = { loadDocument, mutate, add, update, remove, flush: () => writes };
