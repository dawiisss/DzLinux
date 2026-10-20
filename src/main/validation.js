const net = require("node:net");

// NOTE: isValidIpOrHost and isValidPort are deliberately duplicated in
// src/renderer/utils.js — the renderer cannot use node:net, so it mirrors
// net.isIP() with regexes. Keep both implementations behaviourally in sync;
// parity is enforced by __tests__/unit/validationParity.test.js.

const MAX_NAME_LENGTH = 200;
const MAX_TEXT_LENGTH = 4096;
const MIN_QUERY_CONCURRENCY = 10;
const MAX_QUERY_CONCURRENCY = 500;
const VALID_MODES = new Set(["below", "above"]);
const VALID_STATUSES = new Set(["idle", "notified"]);

function isValidIpOrHost(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 253) {
    return false;
  }
  if (net.isIP(value) !== 0) {
    return true;
  }
  if (value.toLowerCase() === "localhost") {
    return true;
  }
  const hostnameRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return hostnameRegex.test(value);
}

function isValidPort(value) {
  if (typeof value === "string" && !/^\d+$/.test(value)) return false;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

function isValidModId(value) {
  return (
    (typeof value === "string" || typeof value === "number") &&
    /^\d+$/.test(String(value))
  );
}

function isBoundedString(value, maxLength = MAX_TEXT_LENGTH) {
  return typeof value === "string" && value.length <= maxLength;
}

function validateServerAddress(server) {
  return (
    server &&
    isValidIpOrHost(server.ip) &&
    isValidPort(server.port) &&
    (server.queryPort === null ||
      server.queryPort === undefined ||
      isValidPort(server.queryPort))
  );
}

function validateFavorite(value) {
  return (
    validateServerAddress(value) &&
    (value.name === undefined || isBoundedString(value.name, MAX_NAME_LENGTH))
  );
}

function validateWatchlistItem(value) {
  return (
    validateServerAddress(value) &&
    typeof value.active === "boolean" &&
    (value.threshold === undefined ||
      (Number.isInteger(value.threshold) &&
        value.threshold >= 0 &&
        value.threshold <= 10000)) &&
    VALID_MODES.has(value.mode || "below") &&
    VALID_STATUSES.has(value.lastStatus || "idle") &&
    isBoundedString(value.name || "", MAX_NAME_LENGTH) &&
    (value.autoJoin === undefined || typeof value.autoJoin === "boolean")
  );
}

function validateWatchlist(value) {
  return Array.isArray(value) && value.length <= 1000 && value.every(validateWatchlistItem);
}

function validateFavorites(value) {
  return Array.isArray(value) && value.length <= 1000 && value.every(validateFavorite);
}

function validateCurrentServers(value) {
  return (
    Array.isArray(value) &&
    value.length <= 50000 &&
    value.every(
      (server) =>
        validateServerAddress(server) &&
        (server.status === undefined || isBoundedString(server.status, 40)) &&
        (server.name === undefined || isBoundedString(server.name, MAX_NAME_LENGTH)) &&
        (server.players === undefined || (Number.isInteger(server.players) && server.players >= 0)),
    )
  );
}

function isValidActivityId(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function sanitizeHistoryPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !validateServerAddress(value)) return null;
  if (!["string", "number"].includes(typeof value.port) ||
      (value.queryPort != null && !["string", "number"].includes(typeof value.queryPort))) return null;
  const result = { ip: value.ip, port: Number(value.port) };
  for (const [key, limit] of [["name", 200], ["map", 100]]) {
    if (value[key] !== undefined) {
      if (!isBoundedString(value[key], limit)) return null;
      result[key] = value[key];
    }
  }
  if (value.queryPort !== undefined) {
    result.queryPort = value.queryPort === null ? null : Number(value.queryPort);
  }
  for (const [key, limit] of [["ping", 60000], ["players", 10000], ["maxPlayers", 10000]]) {
    const number = value[key];
    if (number !== undefined) {
      if (number !== null && (typeof number !== "number" ||
          !Number.isFinite(number) || number < 0 || number > limit ||
          (key !== "ping" && !Number.isInteger(number)))) return null;
      result[key] = number;
    }
  }
  if (value.updateOnly !== undefined) {
    if (typeof value.updateOnly !== "boolean") return null;
    result.updateOnly = value.updateOnly;
  }
  if (value.activityId !== undefined) {
    if (!isValidActivityId(value.activityId)) return null;
    result.activityId = value.activityId;
  }
  if (result.updateOnly && !result.activityId) return null;
  return result;
}

module.exports = {
  isValidIpOrHost,
  isValidPort,
  isValidModId,
  isBoundedString,
  validateServerAddress,
  validateFavorite,
  validateFavorites,
  validateWatchlistItem,
  validateWatchlist,
  validateCurrentServers,
  isValidActivityId,
  sanitizeHistoryPayload,
  MAX_NAME_LENGTH,
  MAX_TEXT_LENGTH,
  MIN_QUERY_CONCURRENCY,
  MAX_QUERY_CONCURRENCY,
};
