import { state, addFavorite, removeFavorite } from "./state.js";
import { showToast, copyToClipboard } from "./feedback.js";
import { countryToFlag, MAP_NAMES, renderPingBadge } from "./utils.js";
import { triggerSteamworksSync } from "./modManager.js";

const STAR_FAV_SVG = `<app-icon name="star" fill="currentColor" style="width: 1.1rem; height: 1.1rem; vertical-align: middle; color: #ffd700;"></app-icon>`;
const STAR_UNFAV_SVG = `<app-icon name="star" fill="none" style="width: 1.1rem; height: 1.1rem; vertical-align: middle; color: var(--text-dim);"></app-icon>`;

// Helper to resolve callbacks to avoid circular dependencies
function getRenderers() {
  return Promise.all([
    import("./serverBrowser.js"),
    import("./favorites.js")
  ]).then(([browser, fav]) => ({
    renderServers: browser.renderServers,
    renderFavoritesManager: fav.renderFavoritesManager
  }));
}

export function buildDetailRow(server, isFavoritesView = false) {
  const trDetail = document.createElement("tr");
  trDetail.className = "detail-row";
  trDetail.id = isFavoritesView ? `fav-detail-${server.id}` : `detail-${server.id}`;

  const tdColspan = document.createElement("td");
  tdColspan.colSpan = 8;

  const detailDiv = document.createElement("div");
  detailDiv.className = "detail-container";

  const headerDiv = document.createElement("div");
  headerDiv.className = "detail-header";
  headerDiv.innerHTML = `
    <app-icon name="cube" style="width: 1.1rem; height: 1.1rem; color: var(--accent); vertical-align: middle;"></app-icon>
    Mods (${server.mods ? server.mods.length : 0})
  `;

  const refreshModsBtn = document.createElement("button");
  refreshModsBtn.className = "btn-refresh-mods";
  refreshModsBtn.title =
    "Refresh mods for this server via A2S query (replaces cached record)";
  refreshModsBtn.innerHTML = `
    <app-icon name="refresh" style="width: 0.8rem; height: 0.8rem;"></app-icon>
    REFRESH
  `;
  refreshModsBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    refreshModsBtn.disabled = true;
    refreshModsBtn.innerHTML = `
      <app-icon name="loader" style="width: 0.8rem; height: 0.8rem;"></app-icon>
      FETCHING...
    `;
    try {
      const freshMods = await window.api.servers.refreshModCache(
        server.ip,
        server.port,
        server.queryPort,
      );
      if (freshMods && freshMods.length > 0) {
        server.mods = freshMods;
        server.hasQueriedMods = true;
        server.isQueryingMods = false;
        showToast(
          `MODS REFRESHED: ${freshMods.length} MODS FOUND`,
          "#2ec4b6",
          `<app-icon name="cube" style="width: 1.1rem; height: 1.1rem; color: #2ec4b6;"></app-icon>`,
        );
      } else {
        server.mods = [];
        server.hasQueriedMods = true;
        server.isQueryingMods = false;
        showToast("NO MODS FOUND FOR THIS SERVER", "#ff9f1c", "⚠️");
      }
    } catch {
      refreshModsBtn.disabled = false;
      refreshModsBtn.innerHTML = `
        <app-icon name="refresh" style="width: 0.8rem; height: 0.8rem;"></app-icon>
        REFRESH
      `;
      showToast("FAILED TO REFRESH MODS", "#ff5a5f", "⚠️");
      return;
    }
    if (state.expandedServerId === server.id) {
      const { renderServers, renderFavoritesManager } = await getRenderers();
      renderServers();
      const favTab = document.getElementById("favorites");
      if (favTab && favTab.classList.contains("active")) {
        renderFavoritesManager();
      }
    }
  });
  headerDiv.appendChild(refreshModsBtn);
  detailDiv.appendChild(headerDiv);

  if (!server.mods || server.mods.length === 0) {
    if (server.modded && !server.hasQueriedMods) {
      const loadingDiv = document.createElement("div");
      loadingDiv.style.color = "var(--accent)";
      loadingDiv.style.fontSize = "0.85rem";
      loadingDiv.style.fontFamily = "'Share Tech Mono', monospace";
      loadingDiv.textContent = "QUERYING SERVER FOR MOD LIST...";
      detailDiv.appendChild(loadingDiv);

      if (!server.isQueryingMods) {
        server.isQueryingMods = true;
        window.api.servers
          .queryMods(server.ip, server.port, server.queryPort)
          .then(async (queriedMods) => {
            server.mods = queriedMods || [];
            server.isQueryingMods = false;
            server.hasQueriedMods = true;
            if (state.expandedServerId === server.id) {
              const { renderServers, renderFavoritesManager } = await getRenderers();
              if (isFavoritesView) {
                renderFavoritesManager();
              } else {
                renderServers();
              }
            }
          })
          .catch(() => {
            server.isQueryingMods = false;
            server.hasQueriedMods = false;
          });
      }
    } else if (server.modded && server.hasQueriedMods) {
      const errorDiv = document.createElement("div");
      errorDiv.style.color = "#ff5a5f";
      errorDiv.style.fontSize = "0.85rem";
      errorDiv.style.fontFamily = "'Share Tech Mono', monospace";
      errorDiv.textContent =
        "UNABLE TO FETCH MOD LIST FROM SERVER. SERVER FIREWALL MAY BE BLOCKING A2S QUERIES.";
      detailDiv.appendChild(errorDiv);
    } else {
      const emptyDiv = document.createElement("div");
      emptyDiv.style.color = "var(--text-dim)";
      emptyDiv.style.fontSize = "0.85rem";
      emptyDiv.style.fontFamily = "'Share Tech Mono', monospace";
      emptyDiv.textContent =
        "NO WORKSHOP MODS DETECTED. STANDARD VANILLA CLIENT GAMEPLAY CONNECTS DIRECTLY.";
      detailDiv.appendChild(emptyDiv);
    }
  } else {
    const gridDiv = document.createElement("div");
    gridDiv.className = "mods-grid";
    server.mods.forEach((mod) => {
      const isInstalledLocal = state.localModsSet.has(mod.id);
      const modPill = document.createElement("div");
      modPill.className = `mod-pill ${isInstalledLocal ? "installed" : "missing"}`;
      const infoDiv = document.createElement("div");
      infoDiv.className = "mod-pill-info";
      const nameSpan = document.createElement("span");
      nameSpan.className = "mod-pill-name";
      nameSpan.textContent = mod.name;
      nameSpan.title = mod.name;
      infoDiv.appendChild(nameSpan);
      const idSpan = document.createElement("span");
      idSpan.className = "mod-pill-id";
      idSpan.textContent = `ID: ${mod.id}`;
      infoDiv.appendChild(idSpan);
      modPill.appendChild(infoDiv);

      const pillActions = document.createElement("div");
      pillActions.className = "mod-pill-actions";
      const statusLabel = document.createElement("span");

      const activeEntry = state.activeDownloads.get(mod.id);
      if (activeEntry) {
        activeEntry.statusLabel = statusLabel;
        statusLabel.className = "mod-pill-status";
        statusLabel.textContent = activeEntry.lastStatusText || "SYNCING...";
        statusLabel.style.color = "var(--accent)";
      } else if (isInstalledLocal) {
        statusLabel.className = "mod-pill-status installed";
        statusLabel.textContent = "✓ READY";
      } else {
        statusLabel.className = "mod-pill-status missing";
        statusLabel.textContent = "NOT SUBSCRIBED";
        const downloadBtn = document.createElement("button");
        downloadBtn.innerHTML = "⬇️";
        downloadBtn.title = "Sync Mod natively via Steam Client";
        downloadBtn.setAttribute("aria-label", "Subscribe and Download");
        downloadBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          triggerSteamworksSync(mod.id, mod.name, statusLabel);
        });
        pillActions.appendChild(downloadBtn);
      }
      pillActions.insertBefore(statusLabel, pillActions.firstChild);
      modPill.appendChild(pillActions);
      gridDiv.appendChild(modPill);
    });
    detailDiv.appendChild(gridDiv);
  }

  tdColspan.appendChild(detailDiv);
  trDetail.appendChild(tdColspan);
  return trDetail;
}

export function buildServerRow(server, isFavoritesView = false) {
  const serverKey = `${server.ip}:${server.port}`;
  const isFav = state.favoritesSet.has(serverKey);
  const isExpanded = state.expandedServerId === server.id;

  const tr = document.createElement("tr");
  tr.id = isFavoritesView ? `fav-row-${server.id}` : `row-${server.id}`;
  const hasMods = server.mods && server.mods.length > 0;
  const canExpand = hasMods || server.modded;
  tr.className = `server-row ${isExpanded ? "expanded" : ""} ${canExpand ? "has-mods" : "no-mods"}`;

  tr.addEventListener("mouseenter", () => {
    state.hoveredRowId = server.id;
  });
  tr.addEventListener("mouseleave", () => {
    if (state.hoveredRowId === server.id) state.hoveredRowId = null;
  });
  if (state.hoveredRowId === server.id) {
    tr.classList.add("force-hover");
  }

  tr.addEventListener("click", async (e) => {
    if (
      e.target.closest(".star-btn") ||
      e.target.closest(".btn-ping") ||
      e.target.closest(".btn-connect") ||
      e.target.closest(".ip-cell")
    ) {
      return;
    }
    if (!canExpand) return;

    if (isFavoritesView) {
      state.expandedServerId = isExpanded ? null : server.id;
      const { renderFavoritesManager } = await getRenderers();
      renderFavoritesManager();
    } else {
      if (state.expandedServerId === server.id) {
        state.expandedServerId = null;
        tr.classList.remove("expanded");
        const detailRow = document.getElementById(`detail-${server.id}`);
        if (detailRow) detailRow.remove();
      } else {
        if (state.expandedServerId) {
          const oldDetail = document.getElementById(
            `detail-${state.expandedServerId}`,
          );
          if (oldDetail) oldDetail.remove();
          const oldTr = document.getElementById(`row-${state.expandedServerId}`);
          if (oldTr) oldTr.classList.remove("expanded");
        }
        state.expandedServerId = server.id;
        tr.classList.add("expanded");
        tr.after(buildDetailRow(server, false));
      }
    }
  });

  // Star
  const tdStar = document.createElement("td");
  tdStar.style.textAlign = "center";
  const starBtn = document.createElement("button");
  starBtn.className = `star-btn ${isFav ? "active" : ""}`;
  starBtn.innerHTML = isFav ? STAR_FAV_SVG : STAR_UNFAV_SVG;
  starBtn.title = isFav ? "Remove from Favorites" : "Add to Favorites";
  starBtn.setAttribute(
    "aria-label",
    isFav ? "Remove from Favorites" : "Add to Favorites",
  );
  starBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const { renderServers, renderFavoritesManager } = await getRenderers();
    if (state.favoritesSet.has(serverKey)) {
      await removeFavorite(server.ip, server.port);
      starBtn.innerHTML = STAR_UNFAV_SVG;
      starBtn.className = "star-btn";
      starBtn.title = "Add to Favorites";
      starBtn.setAttribute("aria-label", "Add to Favorites");
      showToast("REMOVED FROM FAVORITES", "#ff5a5f", STAR_UNFAV_SVG);
    } else {
      await addFavorite(
        server.ip,
        server.port,
        server.queryPort,
        server.name,
      );
      starBtn.innerHTML = STAR_FAV_SVG;
      starBtn.className = "star-btn active";
      starBtn.title = "Remove from Favorites";
      starBtn.setAttribute("aria-label", "Remove from Favorites");
      showToast("ADDED TO FAVORITES", "#ffd700", STAR_FAV_SVG);
    }
    renderServers();
    const favTab = document.getElementById("favorites");
    if (favTab && favTab.classList.contains("active")) {
      renderFavoritesManager();
    }
  });
  tdStar.appendChild(starBtn);

  // Name
  const tdName = document.createElement("td");
  tdName.className = "server-name-cell";
  tdName.textContent = server.name;
  tdName.title = server.name;
  if (isFavoritesView && !state.allServers.find(s => s.ip === server.ip && s.port.toString() === server.port.toString())) {
    tdName.style.color = "var(--text-dim)";
  }

  // Players
  const tdPlayers = document.createElement("td");
  tdPlayers.id = isFavoritesView ? `fav-player-cell-${server.id}` : `player-cell-${server.id || serverKey.replace(/[^a-zA-Z0-9]/g, "-")}`;
  const playerSpan = document.createElement("span");
  const pct = server.maxPlayers ? server.players / server.maxPlayers : 0;
  let badgeClass = "low";
  if (
    (pct >= 0.95 || server.players >= server.maxPlayers) &&
    server.maxPlayers > 0
  ) {
    badgeClass = "high";
  } else if (pct >= 0.7) {
    badgeClass = "medium";
  }
  playerSpan.className = `player-badge ${badgeClass}`;
  playerSpan.textContent = `${server.players}/${server.maxPlayers}`;
  tdPlayers.appendChild(playerSpan);

  // Mods
  const tdMods = document.createElement("td");
  tdMods.style.textAlign = "center";
  tdMods.style.fontFamily = "'Share Tech Mono', monospace";
  tdMods.textContent = server.mods ? server.mods.length : "0";

  // Ping
  const tdPing = document.createElement("td");
  const pingCellId = isFavoritesView ? `fav-ping-cell-${server.id}` : `ping-cell-${server.id || serverKey.replace(/[^a-zA-Z0-9]/g, "-")}`;
  tdPing.id = pingCellId;

  if (server.realPing !== undefined && server.realPing !== null) {
    if (server.realPing === -1) {
      const timeoutSpan = document.createElement("span");
      timeoutSpan.className = "ping-badge ping-bad";
      timeoutSpan.textContent = "TIMEOUT";
      tdPing.appendChild(timeoutSpan);
    } else {
      tdPing.appendChild(renderPingBadge(server.realPing));
    }
  } else {
    tdPing.style.fontFamily = "'Share Tech Mono', monospace";
    tdPing.style.fontSize = "0.75rem";
    if (server.ping) {
      const approxSpan = document.createElement("span");
      approxSpan.className = "ping-badge ping-approx";
      approxSpan.textContent = `~${server.ping}ms`;
      approxSpan.title =
        "Approximate ping from server list. Full ping in progress...";
      tdPing.appendChild(approxSpan);
    } else {
      tdPing.style.color = "var(--text-dim)";
      tdPing.textContent = isFavoritesView ? "PINGING..." : "--";
    }
    if (isFavoritesView && !server.isPinging) {
      const isFirstPing = server.realPing === undefined;
      server.isPinging = true;
      window.api.servers
        .ping(server.ip, server.port, server.queryPort)
        .then(async (statusObj) => {
          server.isPinging = false;
          if (statusObj !== null) {
            server.realPing = statusObj.ping;
            if (statusObj.status) server.status = statusObj.status;
            if (statusObj.players !== null)
              server.players = statusObj.players;
            if (statusObj.maxPlayers !== null)
              server.maxPlayers = statusObj.maxPlayers;
            if (statusObj.name && server.name === "Unknown Server")
              server.name = statusObj.name;
            if (statusObj.mods && statusObj.mods.length > 0)
              server.mods = statusObj.mods;
            if (statusObj.time) server.time = statusObj.time;
            if (statusObj.map) server.map = statusObj.map;
            server.thirdPerson = statusObj.thirdPerson;
            server.modded = statusObj.modded;
            server.failedPing = false;
          } else {
            server.realPing = server.ping || 120;
            server.failedPing = true;
          }
          if (isFirstPing) {
            state.totalPingedCount = (state.totalPingedCount || 0) + 1;
          }
          const cell = document.getElementById(pingCellId);
          if (cell) {
            cell.innerHTML = "";
            if (server.realPing === -1 || server.failedPing) {
              const timeoutSpan = document.createElement("span");
              timeoutSpan.className = "ping-badge ping-bad";
              timeoutSpan.textContent = "TIMEOUT";
              cell.appendChild(timeoutSpan);
            } else {
              cell.appendChild(renderPingBadge(server.realPing));
            }
          }
        })
        .catch(() => {
          server.isPinging = false;
          server.realPing = -1;
          server.failedPing = true;
          if (isFirstPing) {
            state.totalPingedCount = (state.totalPingedCount || 0) + 1;
          }
          const cell = document.getElementById(pingCellId);
          if (cell) {
            cell.innerHTML = "";
            const timeoutSpan = document.createElement("span");
            timeoutSpan.className = "ping-badge ping-bad";
            timeoutSpan.textContent = "TIMEOUT";
            cell.appendChild(timeoutSpan);
          }
        });
    }
  }

  // Metadata
  const tdMetadata = document.createElement("td");
  const badgesWrapper = document.createElement("div");
  badgesWrapper.className = "badges-wrapper";
  if (server.monetized) {
    const monetizedBadge = document.createElement("span");
    monetizedBadge.className = "hud-badge badge-approved";
    monetizedBadge.innerHTML = "\u{1F4B0} APPROVED";
    monetizedBadge.title =
      "Officially Approved by Bohemia Interactive for Monetization";
    badgesWrapper.appendChild(monetizedBadge);
  }
  if (server.country) {
    const flagBadge = document.createElement("span");
    flagBadge.className = "hud-badge badge-country";
    flagBadge.textContent = `${countryToFlag(server.country)} ${server.country.toUpperCase()}`;
    flagBadge.title = server.country.toUpperCase();
    badgesWrapper.appendChild(flagBadge);
  }
  const pBadge = document.createElement("span");
  pBadge.className = `hud-badge badge-${server.thirdPerson ? "3pp" : "1pp"}`;
  pBadge.textContent = server.thirdPerson ? "3PP" : "1PP";
  badgesWrapper.appendChild(pBadge);
  const cBadge = document.createElement("span");
  cBadge.className = `hud-badge badge-${server.modded ? "modded" : "vanilla"}`;
  cBadge.textContent = server.modded ? "MODDED" : "VANILLA";
  badgesWrapper.appendChild(cBadge);
  if (server.time) {
    const tBadge = document.createElement("span");
    tBadge.className = "hud-badge badge-time";
    const hr = parseInt(server.time.split(":")[0]);
    const sun = hr >= 6 && hr <= 18 ? "\u2600\uFE0F" : "\uD83C\uDF19";
    tBadge.textContent = `${sun} ${server.time}`;
    badgesWrapper.appendChild(tBadge);
  }
  if (server.map) {
    const mapName = MAP_NAMES[server.map.toLowerCase()] || server.map;
    const mapBadge = document.createElement("span");
    mapBadge.className = "hud-badge badge-map";
    mapBadge.textContent = `\uD83D\uDDFA\uFE0F ${mapName}`;
    badgesWrapper.appendChild(mapBadge);
  }
  if (server.password) {
    const lockBadge = document.createElement("span");
    lockBadge.className = "hud-badge badge-lock";
    lockBadge.textContent = "\uD83D\uDD12 LOCKED";
    badgesWrapper.appendChild(lockBadge);
  }
  tdMetadata.appendChild(badgesWrapper);

  // IP
  const tdIp = document.createElement("td");
  const ipSpan = document.createElement("span");
  ipSpan.className = "ip-cell";
  ipSpan.title = "Click to copy address";
  ipSpan.textContent = serverKey;
  ipSpan.addEventListener("click", () => copyToClipboard(serverKey));
  tdIp.appendChild(ipSpan);

  // Actions
  const tdAction = document.createElement("td");
  tdAction.style.textAlign = "right";
  tdAction.style.whiteSpace = "nowrap";
  const pingBtn = document.createElement("button");
  pingBtn.className = "btn-ping";
  pingBtn.innerHTML = `
    <app-icon name="signal" style="width: 0.95rem; height: 0.95rem;"></app-icon>
  `;
  pingBtn.setAttribute("aria-label", "Ping Server");
  pingBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (pingBtn.classList.contains("disabled")) return;
    pingBtn.classList.add("disabled");
    pingBtn.innerHTML = `
      <app-icon name="loader" style="width: 0.95rem; height: 0.95rem;"></app-icon>
    `;
    const isFirstPing = server.realPing === undefined;
    try {
      const statusObj = await window.api.servers.ping(
        server.ip,
        server.port,
        server.queryPort,
      );
      if (statusObj !== null) {
        server.realPing = statusObj.ping;
        if (statusObj.status) server.status = statusObj.status;
        if (statusObj.players !== null) server.players = statusObj.players;
        if (statusObj.maxPlayers !== null)
          server.maxPlayers = statusObj.maxPlayers;
        if (statusObj.name && server.name === "Unknown Server")
          server.name = statusObj.name;
        if (statusObj.mods && statusObj.mods.length > 0)
          server.mods = statusObj.mods;
        if (statusObj.time) server.time = statusObj.time;
        if (statusObj.map) server.map = statusObj.map;
        server.thirdPerson = statusObj.thirdPerson;
        server.modded = statusObj.modded;
        server.failedPing = false;
      } else {
        server.realPing = -1;
        server.failedPing = true;
      }
    } catch {
      server.realPing = -1;
      server.failedPing = true;
    }
    if (isFirstPing) {
      state.totalPingedCount = (state.totalPingedCount || 0) + 1;
    }
    pingBtn.classList.remove("disabled");
    pingBtn.innerHTML = `
      <app-icon name="signal" style="width: 0.95rem; height: 0.95rem;"></app-icon>
    `;
    const pingCell = document.getElementById(pingCellId);
    if (pingCell) {
      pingCell.innerHTML = "";
      if (server.realPing === -1 || server.failedPing) {
        const timeoutSpan = document.createElement("span");
        timeoutSpan.className = "ping-badge ping-bad";
        timeoutSpan.textContent = "TIMEOUT";
        pingCell.appendChild(timeoutSpan);
      } else {
        pingCell.appendChild(renderPingBadge(server.realPing));
      }
    }
  });
  tdAction.appendChild(pingBtn);
  const btn = document.createElement("button");
  btn.className = "btn-connect";
  btn.textContent = "CONNECT";
  btn.addEventListener("click", async () => {
    const { connectToServer } = await import("./serverBrowser.js");
    connectToServer(server.ip, server.port);
  });
  tdAction.appendChild(btn);

  tr.appendChild(tdStar);
  tr.appendChild(tdName);
  tr.appendChild(tdPlayers);
  tr.appendChild(tdMods);
  tr.appendChild(tdPing);
  tr.appendChild(tdMetadata);
  tr.appendChild(tdIp);
  tr.appendChild(tdAction);

  return tr;
}
