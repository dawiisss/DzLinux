export const STAR_FAV_SVG = `<app-icon name="star" fill="currentColor" style="width: 1.1rem; height: 1.1rem; vertical-align: middle; color: #ffd700;"></app-icon>`;
export const STAR_UNFAV_SVG = `<app-icon name="star" fill="none" style="width: 1.1rem; height: 1.1rem; vertical-align: middle; color: var(--text-dim);"></app-icon>`;

export const EU_COUNTRIES = new Set([
  "AD", "AL", "AM", "AT", "AZ", "BA", "BE", "BG", "BY", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FO", "FR", "GB", "GE", "GG", "GI", "GR", "HR", "HU", "IE", "IM", "IS", "IT", "JE", "LI", "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "SE", "SI", "SK", "SM", "UA", "VA"
]);

export function escapeHtml(str) {
  if (typeof str !== "string") return "";
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return str.replace(/[&<>"']/g, (c) => map[c]);
}

export const MAP_NAMES = {
  chernarusplus: "Chernarus",
  chernarus: "Chernarus",
  enoch: "Livonia",
  livonia: "Livonia",
  sakhal: "Sakhal",
  namalsk: "Namalsk",
  esseker: "Esseker",
  deerisle: "Deer Isle",
  banov: "Banov",
  takistan: "Takistan",
  chiemsee: "Chiemsee",
  utes: "Utes",
  zelenogorsk: "Zelenogorsk",
  melkart: "Melkart",
  iztek: "Iztek",
  pripyat: "Pripyat",
  rostow: "Rostow",
  biela: "Biela",
  barrington: "Barrington",
  swarog: "Swarog",
  kunar: "Kunar",
  anemoi: "Anemoi",
  bitterroot: "Bitterroot",
  kopa: "Kopa",
  lux: "Lux",
  alteria: "Alteria",
  yiprit: "Yiprit",
  valning: "Valning",
  eden: "Eden",
  vela: "Vela",
  chimera: "Chimera",
  balkan: "Balkan",
  foothold: "Foothold",
  panthera: "Panthera",
  lingor: "Lingor",
  thirsk: "Thirsk",
  taviana: "Taviana",
  napf: "Napf",
  chernobyl: "Chernobyl",
  fallujah: "Fallujah",
  sparrow: "Sparrow",
  deadcity: "DeadCity",
};

export const MAP_NORMALIZE = {
  chernarusplus: "chernarus",
  chernarus: "chernarus",
  enoch: "livonia",
  livonia: "livonia",
  sakhal: "sakhal",
  namalsk: "namalsk",
  esseker: "esseker",
  deerisle: "deerisle",
  banov: "banov",
  takistan: "takistan",
  chiemsee: "chiemsee",
  utes: "utes",
  zelenogorsk: "zelenogorsk",
  melkart: "melkart",
  iztek: "iztek",
  pripyat: "pripyat",
  rostow: "rostow",
  biela: "biela",
  barrington: "barrington",
  swarog: "swarog",
  kunar: "kunar",
  anemoi: "anemoi",
  bitterroot: "bitterroot",
  kopa: "kopa",
  lux: "lux",
  alteria: "alteria",
  yiprit: "yiprit",
  valning: "valning",
  eden: "eden",
  vela: "vela",
  chimera: "chimera",
  balkan: "balkan",
  foothold: "foothold",
  panthera: "panthera",
  lingor: "lingor",
  thirsk: "thirsk",
  taviana: "taviana",
  napf: "napf",
  chernobyl: "chernobyl",
  fallujah: "fallujah",
  sparrow: "sparrow",
  deadcity: "deadcity",
};

export function countryToFlag(code) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "";
  const offset = 0x1f1e6;
  const first = code.toUpperCase().charCodeAt(0) - 65 + offset;
  const second = code.toUpperCase().charCodeAt(1) - 65 + offset;
  return String.fromCodePoint(first) + String.fromCodePoint(second);
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function renderPingBadge(pingValue) {
  const pingSpan = document.createElement("span");
  let pingClass = "ping-good";
  if (pingValue > 100) pingClass = "ping-bad";
  else if (pingValue > 50) pingClass = "ping-ok";
  pingSpan.className = `ping-badge ${pingClass}`;
  pingSpan.textContent = `${pingValue}ms`;
  return pingSpan;
}

export function getPlayerBadgeClass(players, maxPlayers) {
  const pct = maxPlayers ? players / maxPlayers : 0;
  if ((pct >= 0.95 || players >= maxPlayers) && maxPlayers > 0) return "high";
  if (pct >= 0.7) return "medium";
  return "low";
}

export function applyPingResult(server, statusObj) {
  if (statusObj !== null && statusObj !== undefined) {
    server.realPing = statusObj.ping;
    server.ping = statusObj.ping;
    if (statusObj.status) server.status = statusObj.status;
    if (statusObj.players !== null && statusObj.players !== undefined) {
      server.players = statusObj.players;
    }
    if (statusObj.maxPlayers !== null && statusObj.maxPlayers !== undefined) {
      server.maxPlayers = statusObj.maxPlayers;
    }
    if (statusObj.name) {
      if (server.name === "Unknown Server" || !server.id) {
        server.name = statusObj.name;
      }
    }
    server.failedPing = false;
    if (statusObj.mods && statusObj.mods.length > 0) {
      server.mods = statusObj.mods;
    }
    if (statusObj.time) server.time = statusObj.time;
    if (statusObj.map) server.map = statusObj.map;
    server.thirdPerson = statusObj.thirdPerson;
    server.modded = statusObj.modded;
    if (statusObj.password !== undefined) {
      server.password = statusObj.password;
    }
    return true;
  } else {
    server.realPing = -1;
    server.failedPing = true;
    return false;
  }
}

// Keep behaviourally in sync with src/main/validation.js (isValidIpOrHost /
// isValidPort) — the renderer cannot use node:net, so net.isIP() is mirrored
// with the regexes below. Parity is enforced by
// __tests__/unit/validationParity.test.js.

// IPv4 octet without leading zeros, matching net.isIP() (e.g. "01.2.3.4" is rejected).
const IPV4_OCTET = "(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])";
const ipv4Regex = new RegExp(`^${IPV4_OCTET}(?:\\.${IPV4_OCTET}){3}$`);

// Pure-hex RFC 4291 IPv6 forms: full and all compressed (::) shapes.
const IPV6_SEG = "[0-9a-fA-F]{1,4}";
const ipv6Regex = new RegExp(
  "^(?:" +
    `(?:${IPV6_SEG}:){7}${IPV6_SEG}|` +
    `(?:${IPV6_SEG}:){1,7}:|` +
    `(?:${IPV6_SEG}:){1,6}:${IPV6_SEG}|` +
    `(?:${IPV6_SEG}:){1,5}(?::${IPV6_SEG}){1,2}|` +
    `(?:${IPV6_SEG}:){1,4}(?::${IPV6_SEG}){1,3}|` +
    `(?:${IPV6_SEG}:){1,3}(?::${IPV6_SEG}){1,4}|` +
    `(?:${IPV6_SEG}:){1,2}(?::${IPV6_SEG}){1,5}|` +
    `${IPV6_SEG}:(?::${IPV6_SEG}){1,6}|` +
    `:(?:(?::${IPV6_SEG}){1,7}|:)` +
    ")$",
);

// Mirrors net.isIP() == 6 semantics, including IPv4-embedded forms such as
// "::ffff:1.2.3.4": the dotted tail must be a valid IPv4 address and counts
// as two hex groups when validating the head.
function isValidIpv6(value) {
  if (!value.includes(".")) {
    return ipv6Regex.test(value);
  }
  const lastColon = value.lastIndexOf(":");
  if (lastColon === -1) return false;
  const embeddedV4 = value.slice(lastColon + 1);
  const hexHead = value.slice(0, lastColon + 1);
  return ipv4Regex.test(embeddedV4) && ipv6Regex.test(`${hexHead}0:0`);
}

export function isValidIpOrHost(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 253) {
    return false;
  }
  if (ipv4Regex.test(value)) {
    return true;
  }
  // net.isIP() accepts an optional non-empty "%zone" suffix on IPv6 addresses
  const zoneMatch = value.match(/^([^%]+)%([^\s%]+)$/);
  if (!value.includes("%") || zoneMatch) {
    if (isValidIpv6(zoneMatch ? zoneMatch[1] : value)) {
      return true;
    }
  }
  if (value.toLowerCase() === "localhost") {
    return true;
  }
  const hostnameRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return hostnameRegex.test(value);
}

export function isValidPort(value) {
  if (typeof value === "string" && !/^\d+$/.test(value)) return false;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

