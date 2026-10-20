import { favoriteKey } from "../favoriteIdentity.js";
import { state, upsertHistoryRecord } from "../state.js";
import { escapeHtml, isValidIpOrHost, isValidPort, getReportedPopulation } from "../utils.js";
import { showToast } from "../feedback.js";
import { triggerSteamworksSync, refreshLocalModsCache } from "../modManager.js";
import { buildServerRow, buildDetailRow } from "../serverRow.js";
import { STAR_FAV_SVG, STAR_UNFAV_SVG } from "../utils.js";
import { getCombinedAndFilteredServers } from "./serverBrowserCore.js";
import { updateStatsBar, refreshServers } from "./serverBrowserRender.js";
import { calculateTrustScore } from "../trustScore.js";
import { getServerModCount, loadServerMods } from "../serverMods.js";

export function renderServers() {
  const tbody = document.getElementById("serverListBody");
  if (!tbody) return;

  // Dynamically update the country filter's options (if currently open) or its group pill
  // visibility (if closed) as the active filtered server list changes.
  const dropdown = document.getElementById("ms-dropdown-country");
  const isOpen = dropdown && dropdown.style.display === "block";
  document.dispatchEvent(new CustomEvent("dzlinux:populate-country-dropdown", { detail: { isOpen } }));

  let savedExpandedId = null;
  let savedScrollTop = 0;
  if (state.expandedServerId) {
    const oldDetail = document.getElementById(
      `detail-${state.expandedServerId}`
    );
    if (oldDetail) {
      savedScrollTop = oldDetail.scrollTop || 0;
      savedExpandedId = state.expandedServerId;
    }
  }

  const filtered = getCombinedAndFilteredServers();

  if (state.expandedServerId !== null && state.cachedSortOrder) {
    filtered.sort((a, b) => {
      const idxA = state.cachedSortOrder.has(a.id)
        ? state.cachedSortOrder.get(a.id)
        : -1;
      const idxB = state.cachedSortOrder.has(b.id)
        ? state.cachedSortOrder.get(b.id)
        : -1;
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  } else {
    const favoritesSet = new Set(
      state.favorites.map((f) => `${f.ip}:${f.port}`)
    );
    filtered.sort((a, b) => {
      const isFavA = favoritesSet.has(favoriteKey(a.ip, a.port)) ? 1 : 0;
      const isFavB = favoritesSet.has(favoriteKey(b.ip, b.port)) ? 1 : 0;
      if (isFavA !== isFavB) return isFavB - isFavA;

      let cmp = 0;
      switch (state.sort.column) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "players":
          cmp = a.players - b.players;
          if (cmp === 0)
            cmp = (a.originalIndex ?? Infinity) - (b.originalIndex ?? Infinity);
          if (cmp === 0) cmp = a.name.localeCompare(b.name);
          break;
        case "ip":
          cmp = a.ip.localeCompare(b.ip);
          break;
        case "ping": {
          const valA =
            a.realPing !== undefined && a.realPing !== -1
              ? a.realPing
              : a.ping
                ? a.ping
                : Infinity;
          const valB =
            b.realPing !== undefined && b.realPing !== -1
              ? b.realPing
              : b.ping
                ? b.ping
                : Infinity;
          if (valA === Infinity && valB === Infinity) {
            cmp = (a.originalIndex ?? Infinity) - (b.originalIndex ?? Infinity);
            if (cmp === 0) cmp = a.name.localeCompare(b.name);
            return state.sort.direction === "asc" ? cmp : -cmp;
          } else if (valA === Infinity) {
            return 1;
          } else if (valB === Infinity) {
            return -1;
          } else {
            cmp = valA - valB;
            if (cmp === 0)
              cmp =
                (a.originalIndex ?? Infinity) - (b.originalIndex ?? Infinity);
            if (cmp === 0) cmp = a.name.localeCompare(b.name);
            return state.sort.direction === "asc" ? cmp : -cmp;
          }
        }
        case "mods": {
          const modsA = a.mods ? a.mods.length : 0;
          const modsB = b.mods ? b.mods.length : 0;
          cmp = modsA - modsB;
          if (cmp === 0)
            cmp = (a.originalIndex ?? Infinity) - (b.originalIndex ?? Infinity);
          if (cmp === 0) cmp = a.name.localeCompare(b.name);
          break;
        }
        default:
          cmp = a.players - b.players;
          if (cmp === 0)
            cmp = (a.originalIndex ?? Infinity) - (b.originalIndex ?? Infinity);
          if (cmp === 0) cmp = a.name.localeCompare(b.name);
      }
      return state.sort.direction === "asc" ? cmp : -cmp;
    });

    state.cachedSortOrder = new Map();
    for (let i = 0; i < filtered.length; i++) {
      state.cachedSortOrder.set(filtered[i].id, i);
    }
  }

  updateStatsBar(filtered);

  const totalServers = filtered.length;
  const listMode = state.settings.listMode || "paging";
  const paginationBar = document.querySelector(".pagination-bar");

  if (paginationBar) {
    paginationBar.style.display = listMode === "virtual" ? "none" : "flex";
  }

  let startIdx = 0;
  let endIdx = 0;

  if (listMode === "paging") {
    const totalPages = Math.ceil(totalServers / state.pagination.size) || 1;
    if (state.pagination.page > totalPages) state.pagination.page = totalPages;
    if (state.pagination.page < 1) state.pagination.page = 1;

    startIdx = (state.pagination.page - 1) * state.pagination.size;
    endIdx = Math.min(startIdx + state.pagination.size, totalServers);

    if (tbody) {
      tbody.style.paddingTop = "0px";
      tbody.style.paddingBottom = "0px";
    }

    const paginationInfo = document.getElementById("paginationInfo");
    if (paginationInfo) {
      paginationInfo.textContent = `Showing ${totalServers ? startIdx + 1 : 0} - ${endIdx} of ${totalServers} servers (Page ${state.pagination.page}/${totalPages})`;
    }

    const prevBtn = document.getElementById("prevPageBtn");
    if (prevBtn) prevBtn.disabled = state.pagination.page === 1;

    const nextBtn = document.getElementById("nextPageBtn");
    if (nextBtn) nextBtn.disabled = state.pagination.page === totalPages;
  } else {
    // Progressive Infinite Scroll
    if (!state.virtualEndIdx) state.virtualEndIdx = state.pagination.size;
    
    // Reset virtualEndIdx if filters severely reduced totalServers
    if (state.virtualEndIdx > totalServers + state.pagination.size) {
       state.virtualEndIdx = state.pagination.size;
    }

    startIdx = 0;
    endIdx = Math.min(state.virtualEndIdx, totalServers);

    if (tbody) {
      tbody.style.paddingTop = "0px";
      tbody.style.paddingBottom = "0px";
    }
  }

  const paginatedServers = filtered.slice(startIdx, endIdx);

  const existingRows = new Map();
  tbody
    .querySelectorAll("tr.skeleton-row, tr:not(.server-row):not(.detail-row)")
    .forEach((tr) => tr.remove());
  tbody.querySelectorAll("tr.server-row").forEach((tr) => {
    const match = tr.id.match(/^row-(.+)$/);
    if (match) existingRows.set(match[1], tr);
  });
  const existingDetail = tbody.querySelector("tr.detail-row");
  if (existingDetail) {
    if (!state.expandedServerId || existingDetail.id !== `detail-${state.expandedServerId}`) {
       existingDetail.remove();
    }
  }

  let prevTr = null;
  paginatedServers.forEach((server) => {
    void loadServerMods(server);
    let tr = existingRows.get(server.id);
    if (tr) {
      existingRows.delete(server.id);
      const modCount = tr.querySelector(".server-mod-count");
      if (modCount) modCount.textContent = getServerModCount(server);
      const starBtn = tr.querySelector(".star-btn");
      if (starBtn) {
        const isFav = state.favoritesSet.has(favoriteKey(server.ip, server.port));
        const currentlyActive = starBtn.classList.contains("active");
        if (isFav !== currentlyActive) {
          starBtn.innerHTML = isFav ? STAR_FAV_SVG : STAR_UNFAV_SVG;
          starBtn.className = `star-btn ${isFav ? "active" : ""}`;
          starBtn.title = isFav ? "Remove from Favorites" : "Add to Favorites";
          starBtn.setAttribute(
            "aria-label",
            isFav ? "Remove from Favorites" : "Add to Favorites"
          );
        }
      }
      const nameCell = tr.querySelector(".server-name-cell");
      if (nameCell && nameCell.textContent !== server.name) {
        nameCell.textContent = server.name;
        nameCell.title = server.name;
      }
      const securityCell = tr.querySelector(".col-security");
      if (securityCell && state.settings && state.settings.enableTrustScore !== false) {
        const { level, reasons } = calculateTrustScore(server);
        const shieldIcon = securityCell.querySelector("app-icon");
        if (shieldIcon && shieldIcon.className !== `shield-${level}`) {
          shieldIcon.className = `shield-${level}`;
          securityCell.title = reasons.join(", ");
        }
      }
    } else {
      tr = buildServerRow(server);
    }

    if (prevTr) {
      let insertAfterNode = prevTr;
      if (state.expandedServerId && prevTr.id === `row-${state.expandedServerId}`) {
         const detailNode = document.getElementById(`detail-${state.expandedServerId}`);
         if (detailNode) insertAfterNode = detailNode;
      }
      if (insertAfterNode.nextSibling !== tr) insertAfterNode.after(tr);
    } else {
      const firstRow = tbody.querySelector("tr.server-row");
      if (firstRow) {
        if (firstRow !== tr) tbody.insertBefore(tr, firstRow);
      } else {
        tbody.appendChild(tr);
      }
    }
    prevTr = tr;
  });

  existingRows.forEach((tr) => tr.remove());

  if (savedExpandedId) {
    const serverRow = document.getElementById(`row-${savedExpandedId}`);
    const server = state.allServers.find((s) => s.id === savedExpandedId);
    if (serverRow && server) {
      let detailRow = document.getElementById(`detail-${savedExpandedId}`);
      if (!detailRow) {
         detailRow = buildDetailRow(server);
      }
      detailRow.scrollTop = savedScrollTop;
      serverRow.after(detailRow);
      serverRow.classList.add("expanded");
    } else {
      state.expandedServerId = null;
      const detailRow = document.getElementById(`detail-${savedExpandedId}`);
      if (detailRow) detailRow.remove();
    }
  }
}

let activeConnectionId = null;
let connectionStarting = false;
let unsubscribeConnectionCancelled = null;
function finishConnection(id, launched = false) {
  if (activeConnectionId === id) activeConnectionId = null;
  if (id) void window.api.connection?.finish(id, launched).catch((error) => console.error("Connection cleanup failed:", error));
}

export function cancelPendingConnection() {
  finishConnection(activeConnectionId);

  state.currentModCheckGeneration++;
  if (state.currentModQueryRequestId) {
    window.api.servers.cancelPingRequest?.(state.currentModQueryRequestId);
    state.currentModQueryRequestId = null;
  }
  if (state.currentModCheckInterval) clearInterval(state.currentModCheckInterval);
  if (state.currentModLaunchTimer) clearTimeout(state.currentModLaunchTimer);
  state.currentModCheckInterval = null;
  state.currentModLaunchTimer = null;
  const modal = document.getElementById("modModal");
  if (modal) modal.style.display = "none";
}

export async function connectToServer(ip, port, options = {}) {
  if (!isValidIpOrHost(ip) || !isValidPort(port)) {
    showToast("Invalid server address or port", "#ef233c", "alert");
    return;
  }
  if (options.automaticConnectionId && (activeConnectionId || connectionStarting)) {
    finishConnection(options.automaticConnectionId);
    return;
  }
  cancelPendingConnection();
  const checkGeneration = state.currentModCheckGeneration;
  let connectionId = options.automaticConnectionId || null;
  connectionStarting = true;
  try {
    if (!connectionId && window.api.connection) connectionId = await window.api.connection.begin();
    if (checkGeneration !== state.currentModCheckGeneration) { finishConnection(connectionId); return; }
    activeConnectionId = connectionId;
  } catch (error) {
    showToast("Could not start connection: " + error.message, "var(--accent-red)", "alert");
    return;
  } finally { connectionStarting = false; }

  const live = state.allServers.find(
    (server) => server.ip === ip && String(server.port) === String(port)
  );
  const provided = options.serverContext;
  const historical = provided?.ip === ip && String(provided.port) === String(port) ? provided : null;
  const source = live || historical;
  const serverObj = source ? {
    ...live,
    name: live?.name || historical?.name,
    map: live?.map || historical?.map,
    queryPort: live?.queryPort || historical?.queryPort,
    reportedPlayers: source.reportedPlayers,
    reportedCapacity: source.reportedCapacity,
    realPing: source.realPing,
    failedPing: source.failedPing,
  } : null;
  try {
  if (state.currentModCheckInterval) {
    clearInterval(state.currentModCheckInterval);
    state.currentModCheckInterval = null;
  }
  if (state.currentModLaunchTimer) {
    clearTimeout(state.currentModLaunchTimer);
    state.currentModLaunchTimer = null;
  }
  const previousModal = document.getElementById("modModal");
  if (previousModal) previousModal.style.display = "none";
    console.log(`Connecting to ${ip}:${port}... verifying mods`);
    await addToHistory(ip, port, serverObj);
    if (checkGeneration !== state.currentModCheckGeneration) return;

  let requiredMods = [];
  const launchGame = () => connectionId
    ? window.api.game.launch(ip, port, requiredMods, connectionId)
    : window.api.game.launch(ip, port, requiredMods);

  if (!options.forceModQuery && serverObj && serverObj.mods && serverObj.mods.length > 0) {
    requiredMods = serverObj.mods;
  } else {
    console.log("Querying server for detailed rules via GameDig...");
    showToast("Querying server for detailed rules...", "#ff9f1c", "signal");
    const requestId = options.forceModQuery ? "connection-" + checkGeneration : null;
    if (requestId) state.currentModQueryRequestId = requestId;
    try {
      requiredMods = requestId
        ? await window.api.servers.queryMods(ip, port, serverObj?.queryPort, requestId)
        : await window.api.servers.queryMods(ip, port, serverObj?.queryPort);
    } finally {
      if (state.currentModQueryRequestId === requestId) state.currentModQueryRequestId = null;
    }
  }

  if (checkGeneration !== state.currentModCheckGeneration) return;
  if (!Array.isArray(requiredMods)) {
    showToast("Server appears to be offline or unreachable", "#ef233c", "alert");
    finishConnection(connectionId);
    return;
  }

  const { missingMods, hasAllMods } =
    await window.api.game.checkRequired(requiredMods);
  if (checkGeneration !== state.currentModCheckGeneration) return;

  if (hasAllMods) {
    showToast("All mods synced! Launching DayZ client...", "#2ec4b6", "play");
    const launched = await launchGame()
      .then(() => true)
      .catch((err) => {
        if (checkGeneration === state.currentModCheckGeneration) {
          showToast(`Launch failed: ${err.message}`, "#ef233c", "alert");
        }
        return false;
      });
    finishConnection(connectionId, launched);
    if (!launched || checkGeneration !== state.currentModCheckGeneration) return;
    if (state.settings.enableGameMode && state.settings.protonPath &&
        state.settings.protonPath !== "default") {
      showToast(
        "GameMode active — system prioritization engaged",
        "#48cae4",
        "zap"
      );
    }
  } else {
    const modal = document.getElementById("modModal");
    const list = document.getElementById("missingModsList");
    const statusText = document.getElementById("modStatusText");
    statusText.innerText = "Waiting for you to subscribe via Workshop...";

    const renderModalList = (currentMissingMods) => {
      list.replaceChildren();
      requiredMods.forEach((mod) => {
        const isMissing = currentMissingMods.some((m) => m.id === mod.id);
        const li = document.createElement("li");
        li.className = `mod-item ${isMissing ? "missing" : "installed"}`;

        const modInfoDiv = document.createElement("div");
        modInfoDiv.innerHTML = `<span style="font-weight:700;">${escapeHtml(mod.name)}</span> <span style="color:var(--text-dim);font-size:0.75rem;">(ID: ${escapeHtml(mod.id)})</span>`;
        li.appendChild(modInfoDiv);

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "mod-item-actions";

        const statusLabel = document.createElement("span");
        statusLabel.className = `mod-status-label ${isMissing ? "missing" : "installed"}`;
        statusLabel.textContent = isMissing ? "[Not Subscribed]" : "[Ready]";
        actionsDiv.appendChild(statusLabel);

        if (isMissing) {
          const subBtn = document.createElement("button");
          subBtn.textContent = "Subscribe";
          subBtn.addEventListener("click", () => {
            triggerSteamworksSync(mod.id, mod.name, statusLabel);
          });
          actionsDiv.appendChild(subBtn);

          window.api.steamworks
             .downloadInfo(mod.id)
             .then((info) => {
               if (info && info.total > 0) {
                 const pct = Math.floor(info.progress * 100);
                 statusLabel.textContent = `[${pct}% Syncing...]`;
                 statusLabel.style.color = "var(--accent)";
                 subBtn.style.display = "none";
               }
             })
             .catch(() => {});
        }

        li.appendChild(actionsDiv);
        list.appendChild(li);
      });
    };

    renderModalList(missingMods);
    modal.style.display = "flex";

    const autoBtn = document.getElementById("modalAutoDownloadBtn");
    if (missingMods.length > 0) {
      autoBtn.style.display = "inline-flex";
      autoBtn.disabled = false;
      autoBtn.removeAttribute("aria-disabled");
      autoBtn.style.opacity = "1";
      autoBtn.innerHTML = `
        <app-icon name="download" style="width: 1rem; height: 1rem;"></app-icon>
        Subscribe All & Connect
      `;
      const newAutoBtn = autoBtn.cloneNode(true);
      autoBtn.parentNode.replaceChild(newAutoBtn, autoBtn);
      newAutoBtn.addEventListener("click", () => {
        newAutoBtn.disabled = true;
        newAutoBtn.setAttribute("aria-disabled", "true");
        newAutoBtn.innerHTML = `
          <app-icon name="loader" style="width: 1rem; height: 1rem;"></app-icon>
          Syncing...
        `;
        newAutoBtn.style.opacity = "0.7";
        missingMods.forEach((mod) => {
          triggerSteamworksSync(mod.id, mod.name, null);
        });
      });
    } else {
      autoBtn.style.display = "none";
    }

    if (state.currentModCheckInterval) {
      clearInterval(state.currentModCheckInterval);
    }
    let modCheckInProgress = false;
    state.currentModCheckInterval = setInterval(() => {
      if (modCheckInProgress) return;
      modCheckInProgress = true;
      void window.api.game.checkRequired(requiredMods)
        .then(({ missingMods: updatedMissing, hasAllMods: nowHasAll }) => {
          if (checkGeneration !== state.currentModCheckGeneration) return;
          renderModalList(updatedMissing);

          if (nowHasAll) {
            clearInterval(state.currentModCheckInterval);
            state.currentModCheckInterval = null;
            statusText.innerText = "All mods verified — launching the game client.";
            statusText.style.color = "var(--accent-green)";
            state.currentModLaunchTimer = setTimeout(async () => {
              state.currentModLaunchTimer = null;
              try {
              if (checkGeneration !== state.currentModCheckGeneration) return;
              modal.style.display = "none";
              statusText.style.color = "var(--accent)";
              await refreshLocalModsCache();
              if (checkGeneration !== state.currentModCheckGeneration) return;
              renderServers();
              await launchGame();
              finishConnection(connectionId, true);
              } catch (error) {
                if (checkGeneration === state.currentModCheckGeneration) {
                  finishConnection(connectionId);
                  showToast("Launch preparation failed: " + error.message, "#ef233c", "alert");
                }
              }
            }, 2000);
          }
        })
        .catch((err) => {
          if (checkGeneration !== state.currentModCheckGeneration) return;
          console.error("Mod verification failed:", err);
          showToast(`Mod verification failed: ${err.message}`, "#ef233c", "alert");
        })
        .finally(() => { modCheckInProgress = false; });
    }, 2500);

    const cancelBtn = document.getElementById("modalCancelBtn");
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener("click", () => {
      cancelPendingConnection();

    });
  }
  } catch (err) {
    if (checkGeneration !== state.currentModCheckGeneration) return;
    finishConnection(connectionId);
    console.error(`Failed to connect to ${ip}:${port}:`, err);
    showToast(`Failed to connect: ${err.message || "Unknown error"}`, "#ef233c", "alert");
  }
}

async function addToHistory(ip, port, serverObj) {
  if (state.settings && (state.settings.enableHistory === false || state.settings.showHistoryTab === false)) return;
  if (!window.api?.history) return;
  const observedPing = serverObj?.realPing ?? serverObj?.ping;
  const payload = {
    ip, port: Number(port),
    name: serverObj?.name || ip + ":" + port,
    map: serverObj?.map || "",
    queryPort: serverObj?.queryPort || null,
    ping: !serverObj?.failedPing && Number.isFinite(observedPing) && observedPing > 0 ? observedPing : null,
    ...getReportedPopulation(serverObj),
  };
  const publish = (record) => {
    if (!record) return;
    upsertHistoryRecord(record);
    window.dispatchEvent(new CustomEvent("history-changed", { detail: { serverId: record.id } }));
  };
  let record;
  try {
    record = await window.api.history.record(payload);
    publish(record);
  } catch (error) {
    console.error("Failed to record connection attempt:", error);
    return;
  }
  if (payload.ping === null && record?.lastActivityId && window.api.servers?.ping) {
    window.api.servers.ping(ip, Number(port), payload.queryPort).then(async (result) => {
      if (!result) return;
      publish(await window.api.history.record({
        ...payload, name: result.name || payload.name,
        map: result.map || payload.map,
        ping: Number.isFinite(result.ping) && result.ping > 0 ? result.ping : null,
        ...getReportedPopulation(result),
        updateOnly: true, activityId: record.lastActivityId,
      }));
    }).catch((error) => console.warn("History metadata update failed:", error.message));
  }
}

export function initServerBrowser() {
  unsubscribeConnectionCancelled?.();
  unsubscribeConnectionCancelled = window.api?.connection?.onCancelled((connection) => {
    if (connection.id === activeConnectionId) cancelPendingConnection();
  }) || null;

  const prevBtn = document.getElementById("prevPageBtn");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (state.pagination.page > 1) {
        state.pagination.page--;
        state.expandedServerId = null;
        renderServers();
      }
    });
  }

  const nextBtn = document.getElementById("nextPageBtn");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      const filtered = getCombinedAndFilteredServers();
      const totalPages = Math.ceil(filtered.length / state.pagination.size) || 1;
      if (state.pagination.page < totalPages) {
        state.pagination.page++;
        state.expandedServerId = null;
        renderServers();
      }
    });
  }

  const refreshBtn = document.getElementById("refreshServersBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      refreshServers();
    });
  }

  const tableScroll = document.querySelector(".table-scroll");
  if (tableScroll) {
    tableScroll.addEventListener("scroll", () => {
      if (state.expandedServerId) {
        const detailRow = document.getElementById(`detail-${state.expandedServerId}`);
        if (detailRow) {
          const rect = detailRow.getBoundingClientRect();
          const containerRect = tableScroll.getBoundingClientRect();
          if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) {
            state.expandedServerId = null;
            renderServers();
          }
        }
      }

      if (state.settings.listMode === "virtual") {
        const { scrollTop, scrollHeight, clientHeight } = tableScroll;
        // Load more when scrolled within 300px of the bottom
        if (scrollTop + clientHeight >= scrollHeight - 300) {
          const totalServers = getCombinedAndFilteredServers().length;
          if (state.virtualEndIdx < totalServers) {
            state.virtualEndIdx += state.pagination.size;
            renderServers();
          }
        }
      }
    }, { passive: true });
  }
}

// Event listeners for circular dependency avoidance
document.addEventListener("dzlinux:render-servers", () => {
  renderServers();
});

document.addEventListener("dzlinux:connect-server", (e) => {
  const s = e.detail?.server;
  if (s && s.ip && s.port) {
    connectToServer(s.ip, s.port, { serverContext: s, ...e.detail?.options });
  }
});

