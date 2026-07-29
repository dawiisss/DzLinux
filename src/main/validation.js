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
  MAX_NAME_LENGTH,
  MAX_TEXT_LENGTH,
  MIN_QUERY_CONCURRENCY,
  MAX_QUERY_CONCURRENCY,
};