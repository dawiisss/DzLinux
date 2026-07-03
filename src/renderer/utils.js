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

export function applyPingResult(server, statusObj) {
  if (statusObj !== null && statusObj !== undefined) {
    server.realPing = statusObj.ping;
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
    server.realPing = server.ping || 120;
    server.failedPing = true;
    return false;
  }
}
