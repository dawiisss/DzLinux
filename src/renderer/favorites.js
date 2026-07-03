import { state, addFavorite } from "./state.js";
import { showToast } from "./feedback.js";
import { renderServers } from "./serverBrowser.js";
import { applyPingResult } from "./utils.js";
import { buildServerRow, buildDetailRow } from "./serverRow.js";

export function renderFavoritesManager() {
  const tbody = document.getElementById("favoritesListBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (state.favorites.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="empty-state-msg">NO FAVORITED SERVERS</td></tr>';
    return;
  }

  state.favorites.forEach((fav) => {
    const { ip, port } = fav;
    const _favKey = `${ip}:${port}`;
    let server = state.allServers.find(
      (s) => s.ip === ip && s.port.toString() === port.toString(),
    );
    if (!server) {
      server = {
        id: `fav-${ip.replace(/\./g, "-")}-${port}`,
        ip: ip,
        port: port,
        queryPort: fav.queryPort || null,
        name: fav.name || "UNKNOWN SERVER (OFFLINE / UNLISTED)",
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
      showToast("Please enter both IP and port", "#ff5a5f", "⚠️");
      return;
    }

    const favKey = `${ip}:${port}`;
    if (!state.favoritesSet.has(favKey)) {
      await addFavorite(ip, port, null, name);
      showToast("Added to favorites", "#ff9f1c", "⭐");
      document.getElementById("favIpInput").value = "";
      document.getElementById("favPortInput").value = "";
      document.getElementById("favNameInput").value = "";
      renderServers();
      renderFavoritesManager();
    } else {
      showToast("Server already favorited", "#ff5a5f", "⚠️");
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
        const port = parseInt(fav.port);
        const server = serverMap.get(`${ip}:${port}`);
        if (server) {
          server.realPing = undefined;
          server.isPinging = false;
        }
      });

      const pingPromises = state.favorites.map(async (fav) => {
        const ip = fav.ip;
        const port =
          typeof fav.port === "number" ? fav.port : parseInt(fav.port);
        const server = serverMap.get(`${ip}:${port}`);
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
      });

      await Promise.all(pingPromises);
      renderFavoritesManager();
      // updateStatsInline is in serverBrowser.js; use dynamic import to avoid hard circular dep at module init
      import("./serverBrowser.js").then(({ updateStatsInline }) =>
        updateStatsInline(),
      );
    });
}
