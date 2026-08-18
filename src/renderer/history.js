import { state, addFavorite, removeFavorite } from "./state.js";
import { showToast } from "./feedback.js";
import { openAnalyticsModal } from "./historyChartModal.js";
import { escapeHtml } from "./utils.js";
import { connectToServer } from "./serverBrowser/serverBrowserTable.js";

let historyRecords = [];
let historySearchQuery = "";
// Generation counter: incremented on each render so stale auto-ping callbacks from prior renders are discarded (Rule 12)
let pingGeneration = 0;
const MAX_CONCURRENT_PINGS = 5;

export async function loadAndRenderHistory() {
  if (!window.api || !window.api.history) return;

  try {
    const records = await window.api.history.get();
    historyRecords = Array.isArray(records) ? records : [];

    // Sync state.history and state.historySet for main Server Browser "Recently Played" filter pill
    state.history = historyRecords.map((r) => ({
      ip: r.ip,
      port: r.port,
      name: r.name,
      map: r.map,
      ping: r.lastPing,
      players: r.lastPlayers,
      maxPlayers: r.maxPlayers,
    }));
    state.historySet = new Set(historyRecords.map((r) => `${r.ip}:${r.port}`));

    renderHistoryTable();
  } catch (err) {
    console.error("Failed to load connection history:", err);
  }
}

export function renderHistoryTable() {
  const tbody = document.getElementById("historyListBody");
  if (!tbody) return;

  // Abort any in-flight auto-pings from a previous render by advancing the generation counter
  pingGeneration++;
  const currentGeneration = pingGeneration;

  tbody.replaceChildren();

  const query = historySearchQuery.trim().toLowerCase();
  const filtered = historyRecords.filter((rec) => {
    if (!query) return true;
    const nameMatch = (rec.name || "").toLowerCase().includes(query);
    const ipMatch = `${rec.ip}:${rec.port}`.includes(query);
    const mapMatch = (rec.map || "").toLowerCase().includes(query);
    const noteMatch = (rec.customNote || "").toLowerCase().includes(query);
    return nameMatch || ipMatch || mapMatch || noteMatch;
  });

  if (filtered.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.className = "empty-state-msg";
    td.style.padding = "24px";
    td.style.textAlign = "center";
    td.style.color = "var(--text-muted)";
    td.textContent = historySearchQuery
      ? "No history entries match your search."
      : "No connection history recorded yet. Connect to a server to log history!";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  // Collect rows that need a background ping so we can batch-process them after the render loop
  const zeroPingEntries = [];

  filtered.forEach((rec) => {
    const tr = document.createElement("tr");
    tr.className = "server-row";
    tr.addEventListener("dblclick", () => {
      connectToServer(rec.ip, rec.port);
    });

    const serverId = rec.id || `${rec.ip}:${rec.port}`;
    const isFav = state.favoritesSet.has(serverId);

    // 1. Last Ping
    const tdPing = document.createElement("td");
    const pingVal = rec.lastPing > 0 ? `${rec.lastPing} ms` : "--";
    tdPing.innerHTML = `<span style="font-weight: 600; color: ${getPingColor(rec.lastPing)}">${pingVal}</span>`;
    tr.appendChild(tdPing);

    // Collect for deferred batch ping instead of firing inline (Rule 12 — abort mechanism)
    if (!rec.lastPing || rec.lastPing <= 0) {
      zeroPingEntries.push({ rec, tdPing });
    }

    // 2. Server Name & IP
    const tdName = document.createElement("td");
    const safeIpPort = `${escapeHtml(String(rec.ip))}:${escapeHtml(String(rec.port))}`;
    tdName.innerHTML = `
      <div style="font-weight: 600; color: var(--text-bright); font-size: 0.92rem;">${escapeHtml(rec.name)}</div>
      <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace; opacity: 0.8;">${safeIpPort}</div>
    `;
    tr.appendChild(tdName);

    // 3. Map
    const tdMap = document.createElement("td");
    tdMap.style.color = "var(--text-bright)";
    tdMap.textContent = rec.map || "Chernarus";
    tr.appendChild(tdMap);

    // 4. Last Connected
    const tdLast = document.createElement("td");
    tdLast.style.color = "var(--text-muted)";
    tdLast.textContent = formatTimestamp(rec.lastJoined);
    tr.appendChild(tdLast);

    // 5. Sessions
    const tdSessions = document.createElement("td");
    tdSessions.style.textAlign = "center";
    tdSessions.innerHTML = `<span class="badge" style="background: rgba(255, 159, 28, 0.15); color: #ff9f1c; padding: 2px 8px; border-radius: 12px; font-weight: 600;">${rec.playCount || 1}</span>`;
    tr.appendChild(tdSessions);

    // 6. Custom Note
    const tdNote = document.createElement("td");
    if (rec.customNote) {
      tdNote.innerHTML = `<span style="color: #2ec4b6; font-style: italic;"><app-icon name="sticky-note" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"></app-icon>${escapeHtml(rec.customNote)}</span>`;
    } else {
      tdNote.innerHTML = `<span style="color: var(--text-muted); opacity: 0.5;">No notes</span>`;
    }
    tr.appendChild(tdNote);

    // 7. Action
    const tdAction = document.createElement("td");
    tdAction.style.textAlign = "right";

    const actionContainer = document.createElement("div");
    actionContainer.style.display = "inline-flex";
    actionContainer.style.gap = "6px";
    actionContainer.style.alignItems = "center";

    // Reconnect Button
    const btnJoin = document.createElement("button");
    btnJoin.className = "btn btn-primary btn-sm";
    btnJoin.title = "Connect to server";
    btnJoin.innerHTML = `<app-icon name="play"></app-icon>`;
    btnJoin.addEventListener("click", () => {
      connectToServer(rec.ip, rec.port);
    });

    // Analytics Button
    const btnAnalytics = document.createElement("button");
    btnAnalytics.className = "btn btn-outline btn-sm";
    btnAnalytics.title = "View Server Connection Analytics";
    btnAnalytics.innerHTML = `<app-icon name="chart-line"></app-icon>`;
    btnAnalytics.addEventListener("click", () => {
      openAnalyticsModal(serverId);
    });

    // Favorite Toggle Button
    const btnFav = document.createElement("button");
    btnFav.className = "btn btn-outline btn-sm";
    btnFav.title = isFav ? "Remove from Favorites" : "Add to Favorites";
    btnFav.innerHTML = `<app-icon name="${isFav ? "star" : "star-off"}" style="color: ${isFav ? "#ff9f1c" : "inherit"}"></app-icon>`;
    btnFav.addEventListener("click", async () => {
      if (isFav) {
        await removeFavorite(rec.ip, rec.port);
        showToast("Removed from Favorites", "#ff5a5f", "star-off");
      } else {
        await addFavorite(rec.ip, rec.port, rec.queryPort || null, rec.name);
        showToast("Added to Favorites", "#ff9f1c", "star");
      }
      renderHistoryTable();
    });

    // Delete Entry Button
    const btnDelete = document.createElement("button");
    btnDelete.className = "btn btn-outline btn-sm";
    btnDelete.title = "Delete History Entry";
    btnDelete.style.color = "var(--accent-red)";
    btnDelete.innerHTML = `<app-icon name="trash"></app-icon>`;
    btnDelete.addEventListener("click", async () => {
      try {
        await window.api.history.delete(serverId);
        showToast("History entry deleted", "#2ec4b6", "trash");
        await loadAndRenderHistory();
      } catch (err) {
        console.error("Failed to delete history entry:", err);
        showToast("Failed to delete entry", "#ff5a5f", "alert");
      }
    });

    actionContainer.appendChild(btnJoin);
    actionContainer.appendChild(btnAnalytics);
    actionContainer.appendChild(btnFav);
    actionContainer.appendChild(btnDelete);

    tdAction.appendChild(actionContainer);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  });

  // Deferred batch auto-ping: process up to MAX_CONCURRENT_PINGS zero-ping entries sequentially.
  // Each step checks the generation counter so a new render aborts stale in-flight pings (Rule 12).
  if (zeroPingEntries.length > 0 && window.api && window.api.servers && window.api.servers.ping) {
    const batch = zeroPingEntries.slice(0, MAX_CONCURRENT_PINGS);
    (async () => {
      for (const { rec, tdPing } of batch) {
        // Abort if a newer render has started
        if (currentGeneration !== pingGeneration) return;
        try {
          const statusObj = await window.api.servers.ping(rec.ip, rec.port);
          if (currentGeneration !== pingGeneration) return;
          if (statusObj && typeof statusObj.ping === "number" && statusObj.ping > 0) {
            rec.lastPing = statusObj.ping;
            const pingSpan = tdPing.querySelector("span");
            if (pingSpan) {
              pingSpan.textContent = `${statusObj.ping} ms`;
              pingSpan.style.color = getPingColor(statusObj.ping);
            }
          }
        } catch {
          // Ping failed for this entry, continue with next
        }
      }
    })();
  }
}

function getPingColor(ping) {
  if (!ping || ping <= 0) return "var(--text-muted)";
  if (ping < 60) return "#2ec4b6";
  if (ping < 120) return "#ff9f1c";
  return "#ff5a5f";
}

function formatTimestamp(ms) {
  if (!ms) return "Unknown";
  const now = Date.now();
  const diff = now - ms;

  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  const d = new Date(ms);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}


export function initHistoryManager() {
  const searchInput = document.getElementById("historySearchInput");
  const clearBtn = document.getElementById("btnClearHistory");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      historySearchQuery = e.target.value;
      renderHistoryTable();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to clear all server connection history?")) return;
      try {
        await window.api.history.clear();
        showToast("All history cleared", "#2ec4b6", "trash");
        await loadAndRenderHistory();
      } catch (err) {
        console.error("Failed to clear history:", err);
        showToast("Failed to clear history", "#ff5a5f", "alert");
      }
    });
  }

  window.addEventListener("history-note-updated", () => {
    loadAndRenderHistory();
  });
}
