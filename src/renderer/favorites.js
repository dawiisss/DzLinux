import { state, addFavorite } from "./state.js";
import { showToast } from "./feedback.js";
import { renderServers } from "./serverBrowser.js";
import { applyPingResult, isValidIpOrHost, isValidPort } from "./utils.js";
import { buildServerRow, buildDetailRow } from "./serverRow.js";

const placeholderCache = new Map();

// Cap concurrent GameDig queries when pinging favorites — one simultaneous
// UDP query per favorite could exhaust sockets on large favorite lists.
const FAVORITES_PING_CONCURRENCY = 50;

export function renderFavoritesManager() {
  const tbody = document.getElementById("favoritesListBody");
  if (!tbody) return;

  tbody.replaceChildren();

  if (state.favorites.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="empty-state-msg">No favorited servers</td></tr>';
    return;
  }

  const serverMap = new Map();
  state.allServers.forEach(s => serverMap.set(`${s.ip}:${s.port}`, s));

  state.favorites.forEach((fav) => {
    const { ip, port } = fav;
    const _favKey = `${ip}:${port}`;
    let server = serverMap.get(_favKey);
    if (!server) {
      if (placeholderCache.has(_favKey)) {
        server = placeholderCache.get(_favKey);
      } else {
        server = {
          id: `fav-${ip.replace(/\./g, "-")}-${port}`,
          ip: ip,
          port: port,
          queryPort: fav.queryPort || null,
          name: fav.name || "Unknown Server (Offline / Unlisted)",
          players: 0,
          maxPlayers: 0,
          mods: [],
          realPing: undefined,
          country: "",
          thirdPerson: false,
          modded: false,
          time: "",
          password: false,
        };
        placeholderCache.set(_favKey, server);
      }
    }

    const isExpanded = state.expandedServerId === server.id;
    const tr = buildServerRow(server, true);
    tbody.appendChild(tr);

    if (isExpanded) {
      tbody.appendChild(buildDetailRow(server, true));
    }
  });
}

export function initFavorites() {
  document.getElementById("addFavBtn").addEventListener("click", async () => {
    const ip = document.getElementById("favIpInput").value.trim();
    const port = document.getElementById("favPortInput").value.trim();
    const name = document.getElementById("favNameInput").value.trim();

    if (!ip || !port) {
      showToast("Please enter both IP and port", "#ff5a5f", "alert");
      return;
    }
    if (!isValidIpOrHost(ip)) {
      showToast("Please enter a valid IP address or domain name", "#ff5a5f", "alert");
      return;
    }
    if (!isValidPort(port)) {
      showToast("Please enter a valid port number (1-65535)", "#ff5a5f", "alert");
      return;
    }

    const favKey = `${ip}:${parseInt(port, 10)}`;
    if (!state.favoritesSet.has(favKey)) {
      try {
        await addFavorite(ip, port, null, name);
      } catch (err) {
        console.error("Failed to add favorite:", err);
        showToast("Failed to save favorite", "#ff5a5f", "alert");
        return;
      }
      showToast("Added to favorites", "#ff9f1c", "star");
      document.getElementById("favIpInput").value = "";
      document.getElementById("favPortInput").value = "";
      document.getElementById("favNameInput").value = "";
      renderServers();
      renderFavoritesManager();
    } else {
      showToast("Server already favorited", "#ff5a5f", "alert");
    }
  });

  document
    .getElementById("refreshFavPingsBtn")
    .addEventListener("click", async () => {
      const serverMap = new Map();
      state.allServers.forEach((s) => {
        serverMap.set(`${s.ip}:${s.port}`, s);
      });

      state.favorites.forEach((fav) => {
        const ip = fav.ip;
        const port = parseInt(fav.port, 10);
        const key = `${ip}:${port}`;
        const server = serverMap.get(key) || placeholderCache.get(key);
        if (server) {
          server.realPing = undefined;
          server.isPinging = false;
        }
      });

      // Bounded worker pool: at most FAVORITES_PING_CONCURRENCY queries in
      // flight at once, regardless of how many favorites exist.
      const favoritesToPing = [...state.favorites];
      let nextPingIndex = 0;

      const pingWorker = async () => {
        while (nextPingIndex < favoritesToPing.length) {
          const fav = favoritesToPing[nextPingIndex++];
          const ip = fav.ip;
          const port =
            typeof fav.port === "number" ? fav.port : parseInt(fav.port, 10);
          const key = `${ip}:${port}`;
          const server = serverMap.get(key) || placeholderCache.get(key);
          if (server) {
            const isFirstPing = server.realPing === undefined;
            try {
              const statusObj = await window.api.servers.ping(
                server.ip,
                server.port,
                server.queryPort,
              );
              applyPingResult(server, statusObj);
            } catch {
              applyPingResult(server, null);
            }
            if (isFirstPing) {
              state.totalPingedCount = (state.totalPingedCount || 0) + 1;
            }
          }
        }
      };

      const workerCount = Math.min(
        FAVORITES_PING_CONCURRENCY,
        favoritesToPing.length,
      );
      await Promise.all(Array.from({ length: workerCount }, pingWorker));
      renderFavoritesManager();
      document.dispatchEvent(new CustomEvent("dzlinux:update-stats", { detail: { ip: null, port: null, queryPort: null, ping: 0, statusObj: null, forceOffline: true } }));
    });
}

// Listen for custom events to avoid circular dependency
document.addEventListener("dzlinux:render-favorites", () => {
  renderFavoritesManager();
});
