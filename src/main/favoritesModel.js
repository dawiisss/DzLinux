const { isValidIpOrHost, isValidPort, isValidActivityId } = require("./validation");
const { randomUUID } = require("node:crypto");

function canonicalHost(value) {
  if (typeof value !== "string" || !isValidIpOrHost(value.trim())) throw new Error("Enter a valid IP address or hostname");
  const host = value.trim().toLowerCase();
  return host.includes(":") ? new URL(`http://[${host}]/`).hostname.slice(1, -1) : host;
}
function portNumber(value) {
  if (!["number", "string"].includes(typeof value) || !isValidPort(value)) throw new Error("Port must be a whole number from 1 to 65535");
  return Number(value);
}
const key = (entry) => `${canonicalHost(entry.ip)}:${portNumber(entry.port)}`;
function address(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid server address");
  return { ip: canonicalHost(input.ip), port: portNumber(input.port), queryPort: input.queryPort == null ? null : portNumber(input.queryPort) };
}
function text(value, length, label) {
  if (typeof value !== "string" || value.length > length) throw new Error(`${label} must be at most ${length} characters`);
  return value.trim();
}
function patch(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((field) => !["label", "pinned", "groupId"].includes(field))) throw new Error("Invalid favorite changes");
  const result = {};
  if (input.label !== undefined) result.label = text(input.label, 80, "Label");
  if (input.pinned !== undefined) {
    if (typeof input.pinned !== "boolean") throw new Error("Invalid pin setting");
    result.pinned = input.pinned;
  }
  if (input.groupId !== undefined) {
    if (input.groupId !== null && !isValidActivityId(input.groupId)) throw new Error("Invalid group");
    result.groupId = input.groupId;
  }
  return result;
}
function validate(settings) {
  if (settings.favoritesSchemaVersion !== 2 || !Number.isSafeInteger(settings.favoritesRevision) || settings.favoritesRevision < 1 ||
      !Array.isArray(settings.favorites) || settings.favorites.length > 1000 || !Array.isArray(settings.favoriteGroups) || settings.favoriteGroups.length > 50) throw new Error("Unsupported or invalid Favorites data; original data preserved");
  const groups = new Set(); const names = new Set(); const identities = new Set(); const ids = new Set();
  for (const group of settings.favoriteGroups) {
    const name = text(group.name, 40, "Group name");
    if (!isValidActivityId(group.id) || !name || groups.has(group.id) || names.has(name.toLowerCase())) throw new Error("Invalid or duplicate favorite group");
    groups.add(group.id); names.add(name.toLowerCase());
  }
  for (const entry of settings.favorites) {
    address(entry); patch({ label: entry.label, pinned: entry.pinned, groupId: entry.groupId });
    if (!isValidActivityId(entry.id) || ids.has(entry.id) || identities.has(key(entry)) ||
        typeof entry.label !== "string" || typeof entry.pinned !== "boolean" ||
        !(entry.groupId === null || groups.has(entry.groupId)) ||
        !Number.isSafeInteger(entry.addedOrder) || entry.addedOrder < 0 || !Number.isSafeInteger(entry.revision) || entry.revision < 1 ||
        typeof entry.name !== "string" || entry.name.length > 200 || typeof entry.map !== "string" || entry.map.length > 100 ||
        (entry.legacyName !== undefined && (typeof entry.legacyName !== "string" || entry.legacyName.length > 200))) throw new Error("Invalid favorite entry; original data preserved");
    ids.add(entry.id); identities.add(key(entry));
  }
  return settings;
}
function parseLegacy(value) {
  if (typeof value !== "string") return address(value);
  // Old keys also allowed unbracketed IPv6 followed by a game port. Preserve
  // that legacy convention; the new address-entry UI requires brackets.
  const split = value.lastIndexOf(":");
  const match = value.startsWith("[") ? /^\[([^\]]+)\]:(\d+)$/.exec(value)
    : split > 0 && /^\d+$/.test(value.slice(split + 1)) ? [value, value.slice(0, split), value.slice(split + 1)] : null;
  if (!match) throw new Error("Invalid legacy favorite address; original data preserved");
  return address({ ip: match[1], port: match[2] });
}
function migrate(settings) {
  if (settings.favoritesSchemaVersion === 2) return validate(settings);
  if (settings.favoritesSchemaVersion != null && settings.favoritesSchemaVersion !== 1) throw new Error("Unsupported Favorites schema");
  if (!Array.isArray(settings.favorites) || settings.favorites.length > 1000) throw new Error("Invalid Favorites collection; original data preserved");
  for (const field of ["favoriteNames", "favoritePorts"]) if (settings[field] !== undefined && (!settings[field] || typeof settings[field] !== "object" || Array.isArray(settings[field]))) throw new Error("Invalid legacy Favorites metadata; original data preserved");
  const unique = new Map();
  for (const original of settings.favorites) {
    const identity = parseLegacy(original);
    const old = typeof original === "string" ? { name: settings.favoriteNames?.[original] ?? "", queryPort: settings.favoritePorts?.[original] || null } : original;
    const entry = { ...identity, queryPort: old.queryPort == null ? identity.queryPort : portNumber(old.queryPort), name: text(old.name ?? "", 200, "Server name"), map: text(old.map ?? "", 100, "Map") };
    const existing = unique.get(key(entry));
    if (existing) {
      if (!existing.name) { existing.name = entry.name; existing.legacyName = entry.name; }
      if (!existing.queryPort) existing.queryPort = entry.queryPort;
      continue;
    }
    unique.set(key(entry), { ...entry, legacyName: entry.name, id: randomUUID(), label: "", pinned: false, groupId: null, addedOrder: unique.size, revision: 1 });
  }
  settings.favorites = [...unique.values()]; settings.favoriteGroups = []; settings.favoritesSchemaVersion = 2; settings.favoritesRevision = 1;
  delete settings.favoriteNames; delete settings.favoritePorts;
  return validate(settings);
}
module.exports = { canonicalHost, portNumber, key, address, text, patch, validate, parseLegacy, migrate };
