import { favoriteKey } from "./favoriteIdentity.js";
import { state, addFavorite, removeFavorite, markServerDataChanged } from "./state.js";
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
import { getServerModCount, loadServerMods, beginServerModRefresh } from "./serverMods.js";
import { createModSizeLabel } from "./modDownloadSize.js";

let manualPingCounter = 0;

export function updatePlayerCell(playerCell, server) {
  if (!playerCell || !server) return;
  const players = server.players ?? 0;
  const maxPlayers = server.maxPlayers ?? 0;
  const badgeClass = getPlayerBadgeClass(players, maxPlayers);
  const nextClass = `player-badge ${badgeClass}`;
  const nextText = `${players}/${maxPlayers}`;
  let badge = playerCell.querySelector(".player-badge");
  if (!badge) {
    playerCell.replaceChildren();
    badge = document.createElement("span");
    playerCell.appendChild(badge);
  }
  if (badge.className !== nextClass) {
    badge.className = nextClass;
  }
  if (badge.textContent !== nextText) {
    badge.textContent = nextText;
  }
}

export function updatePingCell(pingCell, server, isFavoritesView = false) {
  if (!pingCell || !server) return;
  pingCell.replaceChildren();
  if (server.realPing !== undefined && server.realPing !== null) {
    pingCell.style.fontFamily = "";
    pingCell.style.fontSize = "";
    pingCell.style.color = "";
    if (server.realPing === -1 || server.failedPing) {
      const timeoutSpan = document.createElement("span");
      timeoutSpan.className = "ping-badge ping-bad";
      timeoutSpan.textContent = "Timeout";
      pingCell.appendChild(timeoutSpan);
    } else {
      pingCell.appendChild(renderPingBadge(server.realPing));
    }
  } else {
    pingCell.style.fontFamily = "'Share Tech Mono', monospace";
    pingCell.style.fontSize = "0.75rem";
    if (server.ping) {
      pingCell.style.color = "";
      const approxSpan = document.createElement("span");
      approxSpan.className = "ping-badge ping-approx";
      approxSpan.textContent = `~${server.ping}ms`;
      approxSpan.title =
        "Approximate ping from server list. Full ping in progress...";
      pingCell.appendChild(approxSpan);
    } else {
      pingCell.style.color = "var(--text-dim)";
      pingCell.textContent = isFavoritesView ? "Pinging..." : "--";
    }
  }
}

export function updateServerRowPresentation(tr, server, isFavoritesView = false) {
  if (!tr || !server) return;
  tr._serverModel = server;

  const serverKey = favoriteKey(server.ip, server.port) || `${server.ip}:${server.port}`;
  const isFav = Boolean(state.favoritesSet?.has(serverKey));
  const hasMods = Boolean(server.mods && server.mods.length > 0);
  const canExpand = Boolean(hasMods || server.modded);

  tr.classList.toggle("has-mods", canExpand);
  tr.classList.toggle("no-mods", !canExpand);
  tr.classList.toggle("expanded", state.expandedServerId === server.id);

  const starBtn = tr.querySelector(".star-btn");
  if (starBtn) {
    const currentlyActive = starBtn.classList.contains("active");
    if (isFav !== currentlyActive) {
      starBtn.innerHTML = isFav ? STAR_FAV_SVG : STAR_UNFAV_SVG;
      starBtn.className = `star-btn ${isFav ? "active" : ""}`;
      starBtn.title = isFav ? "Remove from Favorites" : "Add to Favorites";
      starBtn.setAttribute(
        "aria-label",
        isFav ? "Remove from Favorites" : "Add to Favorites",
      );
    }
  }

  const securityCell = tr.querySelector(".col-security");
  if (securityCell) {
    const { level, reasons } = calculateTrustScore(server);
    const shieldIcon = securityCell.querySelector("app-icon");
    const nextClass = `shield-${level}`;
    if (shieldIcon && shieldIcon.className !== nextClass) {
      shieldIcon.className = nextClass;
    }
    const nextTitle = reasons.join(", ");
    if (securityCell.title !== nextTitle) {
      securityCell.title = nextTitle;
    }
  }

  const nameCell = tr.querySelector(".server-name-cell");
  if (nameCell) {
    const displayName = server.name || "";
    if (nameCell.textContent !== displayName) {
      nameCell.textContent = displayName;
    }
    if (nameCell.title !== displayName) {
      nameCell.title = displayName;
    }
    nameCell.style.color =
      isFavoritesView && server.originalIndex === undefined
        ? "var(--text-dim)"
        : "";
  }

  const rowSuffix = server.id || serverKey.replace(/[^a-zA-Z0-9]/g, "-");
  const playerCellId = isFavoritesView
    ? `fav-player-cell-${server.id}`
    : `player-cell-${rowSuffix}`;
  const playerCell =
    tr.querySelector('[id^="player-cell-"], [id^="fav-player-cell-"]') ||
    document.getElementById(playerCellId);
  if (playerCell) {
    if (playerCell.id !== playerCellId) playerCell.id = playerCellId;
    updatePlayerCell(playerCell, server);
  }

  const modCount = tr.querySelector(".server-mod-count");
  if (modCount) {
    const nextCount = String(getServerModCount(server));
    if (modCount.textContent !== nextCount) {
      modCount.textContent = nextCount;
    }
  }

  const pingCellId = isFavoritesView
    ? `fav-ping-cell-${server.id}`
    : `ping-cell-${rowSuffix}`;
  const pingCell =
    tr.querySelector('[id^="ping-cell-"], [id^="fav-ping-cell-"]') ||
    document.getElementById(pingCellId);
  if (pingCell) {
    if (pingCell.id !== pingCellId) pingCell.id = pingCellId;
    updatePingCell(pingCell, server, isFavoritesView);
  }

  const metaCellId = isFavoritesView
    ? `fav-meta-cell-${server.id}`
    : `meta-cell-${rowSuffix}`;
  const metaCell =
    tr.querySelector('[id^="meta-cell-"], [id^="fav-meta-cell-"]') ||
    document.getElementById(metaCellId);
  if (metaCell) {
    if (metaCell.id !== metaCellId) metaCell.id = metaCellId;
    metaCell.replaceChildren();
    metaCell.appendChild(renderMetadataBadges(server));
  }

  const ipCell = tr.querySelector(".ip-cell");
  if (ipCell && ipCell.firstChild && ipCell.firstChild.nodeType === Node.TEXT_NODE) {
    if (ipCell.firstChild.nodeValue !== serverKey) {
      ipCell.firstChild.nodeValue = serverKey;
    }
  }
}

function updateVisibleModRows(server) {
  for (const isFavoritesView of [false, true]) {
    const prefix = isFavoritesView ? "fav-" : "";
    const row = document.getElementById(`${prefix}row-${server.id}`);
    if (row) {
      const expandable = Boolean(server.mods?.length || server.modded);
      row.classList.toggle("has-mods", expandable);
      row.classList.toggle("no-mods", !expandable);
    }
    const count = row?.querySelector(".server-mod-count");
    if (count) count.textContent = getServerModCount(server);

    if (state.expandedServerId !== server.id) continue;
    const detail = document.getElementById(`${prefix}detail-${server.id}`);
    if (!detail) continue;
    const scrollTop = detail.scrollTop;
    const replacement = buildDetailRow(server, isFavoritesView);
    detail.replaceWith(replacement);
    replacement.scrollTop = scrollTop;
  }
}

document.addEventListener("dzlinux:server-mods-updated", event => {
  updateVisibleModRows(event.detail.server);
});

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

  const headerActions = document.createElement("div");
  headerActions.className = "detail-header-actions";
  headerActions.appendChild(createModSizeLabel(server));
  headerDiv.appendChild(headerActions);

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
    const request = beginServerModRefresh(server);
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
      if (!request.isCurrent()) return;
      if (freshMods === null) throw new Error("Server is unreachable");
      server.modQueryFailed = false;
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
      request.finish();
    } catch {
      if (!request.isCurrent()) return;
      server.isQueryingMods = false;
      server.hasQueriedMods = true;
      server.modQueryFailed = true;
      request.finish();
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
  });
  headerActions.appendChild(refreshModsBtn);

  const subscribeAllBtn = document.createElement("button");
  subscribeAllBtn.className = "btn-refresh-mods";
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
    headerActions.appendChild(subscribeAllBtn);
  }

  detailDiv.appendChild(headerDiv);

  if (!server.mods || server.mods.length === 0) {
    if (server.modded && !server.hasQueriedMods) {
      const loadingDiv = document.createElement("div");
      loadingDiv.style.color = "var(--accent)";
      loadingDiv.style.fontSize = "0.85rem";
      loadingDiv.style.fontFamily = "'Share Tech Mono', monospace";
      loadingDiv.textContent = "Querying server for mod list...";
      detailDiv.appendChild(loadingDiv);

      void loadServerMods(server);
    } else if (server.modQueryFailed) {
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
    const uncertainMods = new Set(state.localMods
      .filter((mod) => state.modScanSnapshot?.stale ||
        mod.scanStatus === "unreadable" || mod.scanStatus === "partial")
      .map((mod) => mod.id));
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
        statusLabel.innerHTML = '<app-icon name="check" role="img" aria-label="Installed"></app-icon>';
      } else {
        statusLabel.className = "mod-pill-status missing";
        statusLabel.textContent = uncertainMods.has(mod.id) ? "Unverified" : "";
        if (uncertainMods.has(mod.id)) {
          statusLabel.title = "Local files could not be fully checked. Retry the scan or sync this mod.";
        }
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
  tr._serverModel = server;
  tr.id = isFavoritesView ? `fav-row-${server.id}` : `row-${server.id}`;
  tr.className = `server-row ${isExpanded ? "expanded" : ""} ${canExpand ? "has-mods" : "no-mods"}`;

  tr.addEventListener("mouseenter", () => {
    const currentServer = tr._serverModel || server;
    state.hoveredRowId = currentServer.id;
  });
  tr.addEventListener("mouseleave", () => {
    const currentServer = tr._serverModel || server;
    if (state.hoveredRowId === currentServer.id) state.hoveredRowId = null;
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
    const currentServer = tr._serverModel || server;
    if (currentServer._removed) return;
    if (!canExpand && !currentServer.mods?.length && !currentServer.modded) return;

    if (isFavoritesView) {
      const currentlyExpanded = state.expandedServerId === currentServer.id;
      state.expandedServerId = currentlyExpanded ? null : currentServer.id;
      document.dispatchEvent(new CustomEvent("dzlinux:render-favorites"));
    } else {
      if (state.expandedServerId === currentServer.id) {
        state.expandedServerId = null;
        tr.classList.remove("expanded");
        const detailRow = document.getElementById(`detail-${currentServer.id}`);
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
        state.expandedServerId = currentServer.id;
        tr.classList.add("expanded");
        tr.after(buildDetailRow(currentServer, false));
      }
    }
  });

  return tr;
}

function buildStarCell(tr, server, serverKey, isFav) {
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
    const currentServer = tr._serverModel || server;
    if (currentServer._removed) return;
    const currentKey = favoriteKey(currentServer.ip, currentServer.port);
    try {
      if (state.favoritesSet.has(currentKey)) {
        await removeFavorite(currentServer.ip, currentServer.port);
        starBtn.innerHTML = STAR_UNFAV_SVG;
        starBtn.className = "star-btn";
        starBtn.title = "Add to Favorites";
        starBtn.setAttribute("aria-label", "Add to Favorites");
        showToast("Removed from favorites", "#ff5a5f", "star");
      } else {
        await addFavorite(
          currentServer.ip,
          currentServer.port,
          currentServer.queryPort,
          currentServer.name,
        );
        starBtn.innerHTML = STAR_FAV_SVG;
        starBtn.className = "star-btn active";
        starBtn.title = "Remove from Favorites";
        starBtn.setAttribute("aria-label", "Remove from Favorites");
        showToast("Added to favorites", "#ffd700", "star");
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

function buildPingCell(tr, server, isFavoritesView, pingCellId) {
  const tdPing = document.createElement("td");
  tdPing.id = pingCellId;
  updatePingCell(tdPing, server, isFavoritesView);

  if (
    isFavoritesView &&
    (server.realPing === undefined || server.realPing === null) &&
    !server.isPinging
  ) {
    const isFirstPing = server.realPing === undefined;
    const myGeneration = state.bgPing.generation;
    server.isPinging = true;
    window.api.servers
      .ping(server.ip, server.port, server.queryPort)
      .then(async (statusObj) => {
        server.isPinging = false;
        if (server._removed || myGeneration !== state.bgPing.generation) return;
        applyPingResult(server, statusObj);
        if (statusObj !== null) {
          void loadServerMods(server);
        }
        if (isFirstPing) {
          state.totalPingedCount = (state.totalPingedCount || 0) + 1;
        }
        const favRowEl = document.getElementById(`fav-row-${server.id}`) || tr;
        if (favRowEl && (!favRowEl._serverModel || favRowEl._serverModel === server)) {
          updateServerRowPresentation(favRowEl, server, true);
        }
        const rowEl = document.getElementById(`row-${server.id}`);
        if (rowEl && (!rowEl._serverModel || rowEl._serverModel === server)) {
          updateServerRowPresentation(rowEl, server, false);
        }
      })
      .catch(() => {
        server.isPinging = false;
        if (server._removed || myGeneration !== state.bgPing.generation) return;
        applyPingResult(server, null);
        if (isFirstPing) {
          state.totalPingedCount = (state.totalPingedCount || 0) + 1;
        }
        const favRowEl = document.getElementById(`fav-row-${server.id}`) || tr;
        if (favRowEl && (!favRowEl._serverModel || favRowEl._serverModel === server)) {
          updateServerRowPresentation(favRowEl, server, true);
        }
        const rowEl = document.getElementById(`row-${server.id}`);
        if (rowEl && (!rowEl._serverModel || rowEl._serverModel === server)) {
          updateServerRowPresentation(rowEl, server, false);
        }
      });
  }
  return tdPing;
}

function buildActionCell(tr, server, isFavoritesView) {
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
    const currentServer = tr._serverModel || server;
    if (currentServer._removed) return;
    const myGeneration = state.bgPing.generation;
    const pingToken = ++manualPingCounter;
    tr._activePingToken = pingToken;

    pingBtn.classList.add("disabled");
    pingBtn.innerHTML = `
      <app-icon name="loader" style="width: 0.95rem; height: 0.95rem;"></app-icon>
    `;
    const isFirstPing = currentServer.realPing === undefined;
    let statusObj = null;
    try {
      statusObj = await window.api.servers.ping(
        currentServer.ip,
        currentServer.port,
        currentServer.queryPort,
      );
    } catch {
      statusObj = null;
    }

    if (tr._activePingToken === pingToken) {
      pingBtn.classList.remove("disabled");
      pingBtn.innerHTML = `
        <app-icon name="signal" style="width: 0.95rem; height: 0.95rem;"></app-icon>
      `;
    }

    if (
      tr._activePingToken !== pingToken ||
      currentServer._removed ||
      myGeneration !== state.bgPing.generation ||
      (tr._serverModel && tr._serverModel !== currentServer)
    ) {
      return;
    }

    applyPingResult(currentServer, statusObj);
    if (statusObj !== null) void loadServerMods(currentServer);
    if (isFirstPing) {
      state.totalPingedCount = (state.totalPingedCount || 0) + 1;
    }

    updateServerRowPresentation(tr, currentServer, isFavoritesView);
    const otherRow = document.getElementById(
      isFavoritesView
        ? `row-${currentServer.id}`
        : `fav-row-${currentServer.id}`,
    );
    if (otherRow && (!otherRow._serverModel || otherRow._serverModel === currentServer)) {
      updateServerRowPresentation(otherRow, currentServer, !isFavoritesView);
    }
    markServerDataChanged();
    document.dispatchEvent(new CustomEvent("dzlinux:update-stats"));
    document.dispatchEvent(new CustomEvent("dzlinux:render-servers"));
  });
  tdAction.appendChild(pingBtn);

  const btn = document.createElement("button");
  btn.className = "btn-connect";
  btn.textContent = "Connect";
  btn.addEventListener("click", async () => {
    const currentServer = tr._serverModel || server;
    if (currentServer._removed) return;
    const { connectToServer } = await import("./serverBrowser.js");
    connectToServer(currentServer.ip, currentServer.port, {
      serverContext: currentServer,
    });
  });
  tdAction.appendChild(btn);

  return tdAction;
}

export function buildServerRow(server, isFavoritesView = false) {
  const serverKey = favoriteKey(server.ip, server.port) || `${server.ip}:${server.port}`;
  const isFav = Boolean(state.favoritesSet?.has(serverKey));
  const rowSuffix = server.id || serverKey.replace(/[^a-zA-Z0-9]/g, "-");
  const metaCellId = isFavoritesView
    ? `fav-meta-cell-${server.id}`
    : `meta-cell-${rowSuffix}`;
  const pingCellId = isFavoritesView
    ? `fav-ping-cell-${server.id}`
    : `ping-cell-${rowSuffix}`;

  const hasMods = server.mods && server.mods.length > 0;
  const canExpand = hasMods || server.modded;

  const tr = createRowSkeleton(server, isFavoritesView, canExpand);

  // Star
  const tdStar = buildStarCell(tr, server, serverKey, isFav);

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
    : `player-cell-${rowSuffix}`;
  updatePlayerCell(tdPlayers, server);

  // Mods
  const tdMods = document.createElement("td");
  tdMods.className = "server-mod-count";
  tdMods.style.textAlign = "center";
  tdMods.style.fontFamily = "'Share Tech Mono', monospace";
  tdMods.textContent = getServerModCount(server);

  // Ping
  const tdPing = buildPingCell(tr, server, isFavoritesView, pingCellId);

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
  ipSpan.addEventListener("click", () => {
    const currentServer = tr._serverModel || server;
    copyToClipboard(
      favoriteKey(currentServer.ip, currentServer.port) ||
        `${currentServer.ip}:${currentServer.port}`,
    );
  });
  ipSpan.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const currentServer = tr._serverModel || server;
      copyToClipboard(
        favoriteKey(currentServer.ip, currentServer.port) ||
          `${currentServer.ip}:${currentServer.port}`,
      );
    }
  });
  tdIp.appendChild(ipSpan);

  // Actions
  const tdAction = buildActionCell(tr, server, isFavoritesView);

  tr.appendChild(tdStar);
  tr.appendChild(tdSecurity);
  tr.appendChild(tdName);
  tr.appendChild(tdPlayers);
  tr.appendChild(tdMods);
  tr.appendChild(tdPing);
  tr.appendChild(tdMetadata);
  tr.appendChild(tdIp);
  tr.appendChild(tdAction);

  if (server.realPing >= 0 && !server.failedPing) void loadServerMods(server);
  tdMods.textContent = getServerModCount(server);

  return tr;
}

export function renderMetadataBadges(server) {
  const badgesWrapper = document.createElement("div");
  badgesWrapper.className = "badges-wrapper";
  const appendBadgeIconAndText = (badgeEl, iconName, text) => {
    const icon = document.createElement("app-icon");
    icon.setAttribute("name", iconName);
    icon.setAttribute("aria-hidden", "true");
    badgeEl.appendChild(icon);
    badgeEl.appendChild(document.createTextNode(` ${text}`));
  };
  if (server.monetized) {
    const monetizedBadge = document.createElement("span");
    monetizedBadge.className = "hud-badge badge-approved";
    appendBadgeIconAndText(monetizedBadge, "coins", "Approved");
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
    const timeIcon = hr >= 6 && hr <= 18 ? "sun" : "moon";
    appendBadgeIconAndText(tBadge, timeIcon, server.time);
    badgesWrapper.appendChild(tBadge);
  }
  if (server.map) {
    const mapName = MAP_NAMES[server.map.toLowerCase()] || server.map;
    const mapBadge = document.createElement("span");
    mapBadge.className = "hud-badge badge-map";
    appendBadgeIconAndText(mapBadge, "map", mapName);
    badgesWrapper.appendChild(mapBadge);
  }
  if (server.password) {
    const lockBadge = document.createElement("span");
    lockBadge.className = "hud-badge badge-lock";
    appendBadgeIconAndText(lockBadge, "lock", "Locked");
    badgesWrapper.appendChild(lockBadge);
  }
  return badgesWrapper;
}
