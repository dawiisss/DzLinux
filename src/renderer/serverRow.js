import { state, addFavorite, removeFavorite } from "./state.js";
import { showToast, copyToClipboard } from "./feedback.js";
import {
  countryToFlag,
  MAP_NAMES,
  renderPingBadge,
  applyPingResult,
  STAR_FAV_SVG,
  STAR_UNFAV_SVG,
  getPlayerBadgeClass,
} from "./utils.js";
import { triggerSteamworksSync } from "./modManager.js";
import { calculateTrustScore } from "./trustScore.js";

// Helper to resolve callbacks to avoid circular dependencies
export function buildDetailRow(server, isFavoritesView = false) {
  const trDetail = document.createElement("tr");
  trDetail.className = "detail-row";
  trDetail.id = isFavoritesView
    ? `fav-detail-${server.id}`
    : `detail-${server.id}`;

  const tdColspan = document.createElement("td");
  tdColspan.colSpan = (state.settings && state.settings.enableTrustScore !== false) ? 9 : 8;

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
    Refresh
  `;
  refreshModsBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    refreshModsBtn.disabled = true;
    refreshModsBtn.innerHTML = `
      <app-icon name="loader" style="width: 0.8rem; height: 0.8rem;"></app-icon>
      Fetching...
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
          `Mods refreshed: ${freshMods.length} mods found`,
          "#2ec4b6",
          "cube",
        );
      } else {
        server.mods = [];
        server.hasQueriedMods = true;
        server.isQueryingMods = false;
        showToast("No mods found for this server", "#ff9f1c", "alert");
      }
    } catch {
      refreshModsBtn.disabled = false;
      refreshModsBtn.innerHTML = `
        <app-icon name="refresh" style="width: 0.8rem; height: 0.8rem;"></app-icon>
        Refresh
      `;
      showToast("Failed to refresh mods", "#ff5a5f", "alert");
      return;
    }
    refreshModsBtn.disabled = false;
    refreshModsBtn.innerHTML = `
      <app-icon name="refresh" style="width: 0.8rem; height: 0.8rem;"></app-icon>
      Refresh
    `;
    if (state.expandedServerId === server.id) {
      const oldDetail = document.getElementById(`detail-${server.id}`);
      if (oldDetail) {
        const savedScrollTop = oldDetail.scrollTop || 0;
        const newDetail = buildDetailRow(server);
        oldDetail.replaceWith(newDetail);
        newDetail.scrollTop = savedScrollTop;
      }
      const favTab = document.getElementById("favorites");
      if (favTab && favTab.classList.contains("active")) {
        document.dispatchEvent(new CustomEvent("dzlinux:render-favorites"));
      }
    }
  });
  headerDiv.appendChild(refreshModsBtn);

  const subscribeAllBtn = document.createElement("button");
  subscribeAllBtn.className = "btn-refresh-mods";
  subscribeAllBtn.style.marginLeft = "8px";
  subscribeAllBtn.title = "Subscribe to all missing mods";
  subscribeAllBtn.innerHTML = `
    <app-icon name="download" style="width: 0.8rem; height: 0.8rem;"></app-icon>
    Subscribe all
  `;
  subscribeAllBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!server.mods || server.mods.length === 0) return;

    const missingMods = server.mods.filter(
      (mod) => !state.localModsSet.has(mod.id),
    );
    if (missingMods.length === 0) {
      showToast("All mods are already installed!", "#2ec4b6", "check");
      return;
    }

    showToast(
      `Queuing ${missingMods.length} mods for subscription...`,
      "#48cae4",
      "download",
    );
    missingMods.forEach((mod) => {
      if (!state.activeDownloads.has(mod.id)) {
        const lbl = document.getElementById(`status-label-${mod.id}`);
        triggerSteamworksSync(mod.id, mod.name, lbl);
      }
    });
  });

  if (
    server.mods &&
    server.mods.some((mod) => !state.localModsSet.has(mod.id))
  ) {
    headerDiv.appendChild(subscribeAllBtn);
  }

  detailDiv.appendChild(headerDiv);

  if (!server.mods || server.mods.length === 0) {
    if (server.modded && !server.hasQueriedMods) {
      const loadingDiv = document.createElement("div");
      loadingDiv.style.color = "var(--accent)";
      loadingDiv.style.fontSize = "0.85rem";
      loadingDiv.style.fontFamily = "'Share Tech Mono', monospace";
      loadingDiv.textContent = "Querying Server for Mod list...";
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
              if (isFavoritesView) {
                document.dispatchEvent(
                  new CustomEvent("dzlinux:render-favorites"),
                );
              } else {
                document.dispatchEvent(
                  new CustomEvent("dzlinux:render-servers"),
                );
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
        "Unable to fetch mod list from server. Server firewall may be blocking A2S queries.";
      detailDiv.appendChild(errorDiv);
    } else {
      const emptyDiv = document.createElement("div");
      emptyDiv.style.color = "var(--text-dim)";
      emptyDiv.style.fontSize = "0.85rem";
      emptyDiv.style.fontFamily = "'Share Tech Mono', monospace";
      emptyDiv.textContent =
        "No workshop mods detected. Standard Vanilla client gameplay connects directly.";
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
      // Removed Mod ID display for cleaner UI
      modPill.appendChild(infoDiv);

      const pillActions = document.createElement("div");
      pillActions.className = "mod-pill-actions";
      const statusLabel = document.createElement("span");
      statusLabel.id = `status-label-${mod.id}`;

      const activeEntry = state.activeDownloads.get(mod.id);
      if (activeEntry) {
        activeEntry.statusLabel = statusLabel;
        statusLabel.className = "mod-pill-status";
        statusLabel.textContent = activeEntry.lastStatusText || "Syncing...";
        statusLabel.style.color = "var(--accent)";
      } else if (isInstalledLocal) {
        statusLabel.className = "mod-pill-status installed";
        statusLabel.textContent = "✓";
      } else {
        statusLabel.className = "mod-pill-status missing";
        statusLabel.textContent = "";
        const downloadBtn = document.createElement("button");
        downloadBtn.innerHTML = '<app-icon name="download"></app-icon>';
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

function createRowSkeleton(server, isFavoritesView, canExpand) {
  const isExpanded = state.expandedServerId === server.id;
  const tr = document.createElement("tr");
  tr.id = isFavoritesView ? `fav-row-${server.id}` : `row-${server.id}`;
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
      document.dispatchEvent(new CustomEvent("dzlinux:render-favorites"));
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
          const oldTr = document.getElementById(
            `row-${state.expandedServerId}`,
          );
          if (oldTr) oldTr.classList.remove("expanded");
        }
        state.expandedServerId = server.id;
        tr.classList.add("expanded");
        tr.after(buildDetailRow(server, false));
      }
    }
  });

  return tr;
}

function buildStarCell(server, serverKey, isFav) {
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
    try {
      if (state.favoritesSet.has(serverKey)) {
        await removeFavorite(server.ip, server.port);
        starBtn.innerHTML = STAR_UNFAV_SVG;
        starBtn.className = "star-btn";
        starBtn.title = "Add to Favorites";
        starBtn.setAttribute("aria-label", "Add to Favorites");
        showToast("Removed from favorites", "#ff5a5f", STAR_UNFAV_SVG);
      } else {
        await addFavorite(server.ip, server.port, server.queryPort, server.name);
        starBtn.innerHTML = STAR_FAV_SVG;
        starBtn.className = "star-btn active";
        starBtn.title = "Remove from Favorites";
        starBtn.setAttribute("aria-label", "Remove from Favorites");
        showToast("Added to favorites", "#ffd700", STAR_FAV_SVG);
      }
    } catch (err) {
      console.error("Failed to update favorite:", err);
      showToast("Failed to update favorites", "#ff5a5f", "alert");
      return;
    }
    document.dispatchEvent(new CustomEvent("dzlinux:render-servers"));
    const favTab = document.getElementById("favorites");
    if (favTab && favTab.classList.contains("active")) {
      document.dispatchEvent(new CustomEvent("dzlinux:render-favorites"));
    }
  });
  tdStar.appendChild(starBtn);
  return tdStar;
}

function buildPingCell(server, isFavoritesView, pingCellId, metaCellId) {
  const tdPing = document.createElement("td");
  tdPing.id = pingCellId;

  if (server.realPing !== undefined && server.realPing !== null) {
    if (server.realPing === -1) {
      const timeoutSpan = document.createElement("span");
      timeoutSpan.className = "ping-badge ping-bad";
      timeoutSpan.textContent = "Timeout";
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
      tdPing.textContent = isFavoritesView ? "Pinging..." : "--";
    }
    if (isFavoritesView && !server.isPinging) {
      const isFirstPing = server.realPing === undefined;
      server.isPinging = true;
      window.api.servers
        .ping(server.ip, server.port, server.queryPort)
        .then(async (statusObj) => {
          server.isPinging = false;
          applyPingResult(server, statusObj);
          if (statusObj !== null) {
            if (statusObj.name) {
              const favRowEl = document.getElementById(`fav-row-${server.id}`);
              if (favRowEl) {
                const favNameCell = favRowEl.querySelector(".server-name-cell");
                if (favNameCell) {
                  favNameCell.textContent = statusObj.name;
                  favNameCell.title = statusObj.name;
                }
              }
              const rowEl = document.getElementById(`row-${server.id}`);
              if (rowEl) {
                const nameCell = rowEl.querySelector(".server-name-cell");
                if (nameCell) {
                  nameCell.textContent = statusObj.name;
                  nameCell.title = statusObj.name;
                }
              }
            }
          }
          if (isFirstPing) {
            state.totalPingedCount = (state.totalPingedCount || 0) + 1;
          }
          const cell = document.getElementById(pingCellId);
          if (cell) {
            cell.replaceChildren();
            if (server.realPing === -1 || server.failedPing) {
              const timeoutSpan = document.createElement("span");
              timeoutSpan.className = "ping-badge ping-bad";
              timeoutSpan.textContent = "Timeout";
              cell.appendChild(timeoutSpan);
            } else {
              cell.appendChild(renderPingBadge(server.realPing));
            }
          }
          const metaCell = document.getElementById(metaCellId);
          if (metaCell) {
            metaCell.replaceChildren();
            metaCell.appendChild(renderMetadataBadges(server));
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
            cell.replaceChildren();
            const timeoutSpan = document.createElement("span");
            timeoutSpan.className = "ping-badge ping-bad";
            timeoutSpan.textContent = "Timeout";
            cell.appendChild(timeoutSpan);
          }
        });
    }
  }
  return tdPing;
}

function buildActionCell(server, pingCellId, metaCellId) {
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
      applyPingResult(server, statusObj);
    } catch {
      applyPingResult(server, null);
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
      pingCell.replaceChildren();
      if (server.realPing === -1 || server.failedPing) {
        const timeoutSpan = document.createElement("span");
        timeoutSpan.className = "ping-badge ping-bad";
        timeoutSpan.textContent = "Timeout";
        pingCell.appendChild(timeoutSpan);
      } else {
        pingCell.appendChild(renderPingBadge(server.realPing));
      }
    }
    const metaCell = document.getElementById(metaCellId);
    if (metaCell) {
      metaCell.replaceChildren();
      metaCell.appendChild(renderMetadataBadges(server));
    }
  });
  tdAction.appendChild(pingBtn);

  const btn = document.createElement("button");
  btn.className = "btn-connect";
  btn.textContent = "Connect";
  btn.addEventListener("click", async () => {
    const { connectToServer } = await import("./serverBrowser.js");
    connectToServer(server.ip, server.port);
  });
  tdAction.appendChild(btn);

  return tdAction;
}

export function buildServerRow(server, isFavoritesView = false) {
  const serverKey = `${server.ip}:${server.port}`;
  const isFav = state.favoritesSet.has(serverKey);
  const metaCellId = isFavoritesView
    ? `fav-meta-cell-${server.id}`
    : `meta-cell-${server.id || serverKey.replace(/[^a-zA-Z0-9]/g, "-")}`;
  const pingCellId = isFavoritesView
    ? `fav-ping-cell-${server.id}`
    : `ping-cell-${server.id || serverKey.replace(/[^a-zA-Z0-9]/g, "-")}`;

  const hasMods = server.mods && server.mods.length > 0;
  const canExpand = hasMods || server.modded;

  const tr = createRowSkeleton(server, isFavoritesView, canExpand);

  // Star
  const tdStar = buildStarCell(server, serverKey, isFav);

  // Security / Trust Score
  const tdSecurity = document.createElement("td");
  tdSecurity.className = "col-security";
  tdSecurity.style.textAlign = "center";
  const { level, reasons } = calculateTrustScore(server);
  const shieldIcon = document.createElement("app-icon");
  shieldIcon.setAttribute("name", "shield");
  shieldIcon.className = `shield-${level}`;
  shieldIcon.style.width = "1.2rem";
  shieldIcon.style.height = "1.2rem";
  shieldIcon.style.verticalAlign = "middle";
  tdSecurity.appendChild(shieldIcon);
  tdSecurity.title = reasons.join(", ");

  // Name
  const tdName = document.createElement("td");
  tdName.className = "server-name-cell";
  tdName.textContent = server.name;
  tdName.title = server.name;
  if (isFavoritesView && server.originalIndex === undefined) {
    tdName.style.color = "var(--text-dim)";
  }

  // Players
  const tdPlayers = document.createElement("td");
  tdPlayers.id = isFavoritesView
    ? `fav-player-cell-${server.id}`
    : `player-cell-${server.id || serverKey.replace(/[^a-zA-Z0-9]/g, "-")}`;
  const playerSpan = document.createElement("span");
  const badgeClass = getPlayerBadgeClass(server.players, server.maxPlayers);
  playerSpan.className = `player-badge ${badgeClass}`;
  playerSpan.textContent = `${server.players}/${server.maxPlayers}`;
  tdPlayers.appendChild(playerSpan);

  // Mods
  const tdMods = document.createElement("td");
  tdMods.style.textAlign = "center";
  tdMods.style.fontFamily = "'Share Tech Mono', monospace";
  tdMods.textContent = server.mods ? server.mods.length : "0";

  // Ping
  const tdPing = buildPingCell(server, isFavoritesView, pingCellId, metaCellId);

  // Metadata
  const tdMetadata = document.createElement("td");
  tdMetadata.id = metaCellId;
  tdMetadata.appendChild(renderMetadataBadges(server));

  // IP
  const tdIp = document.createElement("td");
  const ipSpan = document.createElement("span");
  ipSpan.className = "ip-cell";
  ipSpan.title = "Click to copy address";
  ipSpan.textContent = serverKey;
  const copyIcon = document.createElement("app-icon");
  copyIcon.setAttribute("name", "copy");
  ipSpan.appendChild(copyIcon);
  ipSpan.setAttribute("tabindex", "0");
  ipSpan.setAttribute("role", "button");
  ipSpan.setAttribute("aria-label", "Copy IP Address");
  ipSpan.addEventListener("click", () => copyToClipboard(serverKey));
  ipSpan.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      copyToClipboard(serverKey);
    }
  });
  tdIp.appendChild(ipSpan);

  // Actions
  const tdAction = buildActionCell(server, pingCellId, metaCellId);

  tr.appendChild(tdStar);
  tr.appendChild(tdSecurity);
  tr.appendChild(tdName);
  tr.appendChild(tdPlayers);
  tr.appendChild(tdMods);
  tr.appendChild(tdPing);
  tr.appendChild(tdMetadata);
  tr.appendChild(tdIp);
  tr.appendChild(tdAction);

  return tr;
}

export function renderMetadataBadges(server) {
  const badgesWrapper = document.createElement("div");
  badgesWrapper.className = "badges-wrapper";
  if (server.monetized) {
    const monetizedBadge = document.createElement("span");
    monetizedBadge.className = "hud-badge badge-approved";
    monetizedBadge.innerHTML = "\u{1F4B0} Approved";
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
  cBadge.textContent = server.modded ? "Modded" : "Vanilla";
  badgesWrapper.appendChild(cBadge);
  if (server.time) {
    const tBadge = document.createElement("span");
    tBadge.className = "hud-badge badge-time";
    const hr = parseInt(server.time.split(":")[0], 10);
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
    lockBadge.textContent = "\uD83D\uDD12 Locked";
    badgesWrapper.appendChild(lockBadge);
  }
  return badgesWrapper;
}
