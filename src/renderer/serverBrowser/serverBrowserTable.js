import { state } from "../state.js";
import { escapeHtml } from "../utils.js";
import { showToast } from "../feedback.js";
import { triggerSteamworksSync, refreshLocalModsCache } from "../modManager.js";
import { buildServerRow, buildDetailRow } from "../serverRow.js";
import { STAR_FAV_SVG, STAR_UNFAV_SVG } from "../utils.js";
import { getCombinedAndFilteredServers } from "./serverBrowserCore.js";
import { updateStatsBar, refreshServers } from "./serverBrowserRender.js";

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
      const isFavA = favoritesSet.has(`${a.ip}:${a.port}`) ? 1 : 0;
      const isFavB = favoritesSet.has(`${b.ip}:${b.port}`) ? 1 : 0;
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
    let tr = existingRows.get(server.id);
    if (tr) {
      existingRows.delete(server.id);
      const starBtn = tr.querySelector(".star-btn");
      if (starBtn) {
        const isFav = state.favoritesSet.has(`${server.ip}:${server.port}`);
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

export async function connectToServer(ip, port) {
  try {
    console.log(`Connecting to ${ip}:${port}... verifying mods`);
    await addToHistory(ip, port);

  const serverObj = state.allServers.find(
    (s) => s.ip === ip && s.port.toString() === port.toString()
  );
  let requiredMods = [];

  if (serverObj && serverObj.mods && serverObj.mods.length > 0) {
    requiredMods = serverObj.mods;
  } else {
    console.log("Querying server for detailed rules via GameDig...");
    showToast("Querying server for detailed rules...", "#ff9f1c", "🛰️");
    requiredMods = await window.api.servers.queryMods(
      ip,
      port,
      serverObj?.queryPort
    );
  }

  const { missingMods, hasAllMods } =
    await window.api.game.checkRequired(requiredMods);

  if (hasAllMods) {
    showToast("All mods synced! Launching DayZ client...", "#2ec4b6", "🚀");
    if (state.settings.enableGameMode) {
      showToast(
        "GameMode active — system prioritization engaged",
        "#48cae4",
        "⚡"
      );
    }
    window.api.game.launch(ip, port, requiredMods);
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
    state.currentModCheckInterval = setInterval(async () => {
      const { missingMods: updatedMissing, hasAllMods: nowHasAll } =
        await window.api.game.checkRequired(requiredMods);
      renderModalList(updatedMissing);

      if (nowHasAll) {
        clearInterval(state.currentModCheckInterval);
        state.currentModCheckInterval = null;
        statusText.innerText =
          ">>>> All mods verified! Dispatching game client...";
        statusText.style.color = "var(--accent-green)";
        setTimeout(async () => {
          modal.style.display = "none";
          statusText.style.color = "var(--accent)";
          await refreshLocalModsCache();
          renderServers();
          window.api.game.launch(ip, port, requiredMods);
        }, 2000);
      }
    }, 2500);

    const cancelBtn = document.getElementById("modalCancelBtn");
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener("click", () => {
      if (state.currentModCheckInterval) {
        clearInterval(state.currentModCheckInterval);
        state.currentModCheckInterval = null;
      }
      modal.style.display = "none";
    });
  }
  } catch (err) {
    console.error(`Failed to connect to ${ip}:${port}:`, err);
    showToast(`Failed to connect: ${err.message || "Unknown error"}`, "#ef233c", "⚠️");
  }
}

async function addToHistory(ip, port) {
  const serverObj = state.allServers.find(
    (s) => s.ip === ip && s.port === port
  );
  const name = serverObj ? serverObj.name : `${ip}:${port}`;

  state.history = state.history.filter(
    (h) => !(h.ip === ip && h.port === port)
  );
  state.history.unshift({ ip, port, name, timestamp: Date.now() });
  if (state.history.length > 50) state.history = state.history.slice(0, 50);

  state.historySet = new Set(state.history.map((h) => `${h.ip}:${h.port}`));

  state.settings.history = state.history;
  await window.api.settings.save(state.settings);
}

export function initServerBrowser() {
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
  if (e.detail && e.detail.server) {
    connectToServer(e.detail.server);
  }
});

