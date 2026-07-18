import { state } from "../state.js";
import { refreshLocalModsCache } from "../modManager.js";
import { serverPassesFilters } from "./serverBrowserCore.js";
import { buildServerRow, renderMetadataBadges } from "../serverRow.js";
import { applyPingResult, getPlayerBadgeClass, renderPingBadge } from "../utils.js";

let isServersBatchListenerAdded = false;
let _needsResort = false;
let _resortTimer = null;
let _renderPending = false;
let _renderTimer = null;
let _statsPending = false;
let _statsTimer = null;

const existingServersMap = new Map();
const PING_TIMEOUT_MS = 10000;

export async function refreshExpandedServerMods() {
  if (state.expandedServerId) {
    await refreshLocalModsCache();
    document.dispatchEvent(new CustomEvent("dzlinux:render-servers"));
  }
}

export function updateStatsBar(filtered) {
  const pingedServers = state.allServers.filter(
    (s) => s.realPing !== undefined && s.realPing !== -1 && !s.failedPing
  );
  const totalPlayers = pingedServers.reduce(
    (sum, s) => sum + (s.players || 0),
    0
  );
  document.getElementById("statTotalServers").textContent =
    pingedServers.length;
  document.getElementById("statTotalPlayers").textContent = totalPlayers;
  document.getElementById("statFilteredServers").textContent = filtered.length;
}

export function updateFooterTimestamp() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const el = document.getElementById("footerLastRefresh");
  if (el) el.textContent = `LAST REFRESH: ${timeStr}`;
}

export function setFooterStatus(online) {
  const dot = document.getElementById("footerStatusDot");
  const text = document.getElementById("footerStatusText");
  const banner = document.getElementById("connectionBanner");
  if (dot)
    dot.style.background = online ? "var(--accent-green)" : "var(--accent-red)";
  if (text) text.textContent = online ? "CONNECTED" : "OFFLINE";
  if (banner) banner.style.display = online ? "none" : "flex";
}

export function startCountdown() {
  if (state.autoRefresh.countdownInterval)
    clearInterval(state.autoRefresh.countdownInterval);
  if (state.autoRefresh.interval) clearInterval(state.autoRefresh.interval);

  const badge = document.getElementById("countdownBadge");

  const isEnabled =
    state.settings.autoRefreshEnabled === "false"
      ? false
      : Boolean(state.settings.autoRefreshEnabled);
  if (!isEnabled) {
    if (badge) {
      badge.textContent = `MANUAL`;
      badge.title = "Auto-Refresh Disabled";
    }
    return;
  }

  const refreshSeconds = parseInt(state.settings.autoRefreshTime) || 360;
  state.autoRefresh.seconds = refreshSeconds;

  if (badge) {
    badge.textContent = `${state.autoRefresh.seconds}s`;
    badge.title = "Auto-refresh countdown";
  }

  state.autoRefresh.countdownInterval = setInterval(() => {
    state.autoRefresh.seconds--;
    if (badge) badge.textContent = `${state.autoRefresh.seconds}s`;
    if (state.autoRefresh.seconds <= 0) {
      clearInterval(state.autoRefresh.countdownInterval);
    }
  }, 1000);

  state.autoRefresh.interval = setInterval(() => {
    refreshServers(true);
  }, refreshSeconds * 1000);
}

export function scheduleRenderServers() {
  if (_renderPending) return;
  _renderPending = true;
  _renderTimer = setTimeout(() => {
    _renderTimer = null;
    _renderPending = false;
    document.dispatchEvent(new CustomEvent("dzlinux:render-servers"));
  }, 200);
}

export function updateStatsInline() {
  if (_statsPending) return;
  _statsPending = true;
  if (_statsTimer) clearTimeout(_statsTimer);
  _statsTimer = setTimeout(() => {
    _statsTimer = null;
    _statsPending = false;
    updateStatsInlineSync();
  }, 200);
}

export function updateStatsInlineSync() {
  const allPinged = state.allServers.filter(
    (s) => s.realPing !== undefined && s.realPing !== -1 && !s.failedPing
  );
  const filteredCount = allPinged.filter((s) => serverPassesFilters(s)).length;
  document.getElementById("statTotalServers").textContent = allPinged.length;
  document.getElementById("statTotalPlayers").textContent = allPinged.reduce(
    (sum, s) => sum + (s.players || 0),
    0
  );
  document.getElementById("statFilteredServers").textContent = filteredCount;

  const totalPages = Math.ceil(filteredCount / state.pagination.size) || 1;
  const tbody = document.getElementById("serverListBody");
  const visibleRows = tbody
    ? tbody.querySelectorAll("tr.server-row").length
    : 0;
  const startIdx = (state.pagination.page - 1) * state.pagination.size;
  const endIdx = Math.min(startIdx + visibleRows, filteredCount);
  document.getElementById("paginationInfo").textContent =
    `Showing ${filteredCount ? startIdx + 1 : 0} - ${endIdx} of ${filteredCount} servers (Page ${state.pagination.page}/${totalPages})`;
  document.getElementById("nextPageBtn").disabled =
    state.pagination.page >= totalPages;
}

export function insertServerRow(server) {
  if (!serverPassesFilters(server)) return;
  const rowId = `row-${server.id}`;
  if (document.getElementById(rowId)) return;
  const tbody = document.getElementById("serverListBody");
  const visibleRows = tbody.querySelectorAll("tr.server-row").length;
  if (visibleRows >= state.pagination.size) return;
  const tr = buildServerRow(server);
  tbody.appendChild(tr);

  const allPinged = state.allServers.filter(
    (s) => s.realPing !== undefined && s.realPing !== -1 && !s.failedPing
  );
  const filteredCount = allPinged.filter((s) => serverPassesFilters(s)).length;
  const startIdx = (state.pagination.page - 1) * state.pagination.size;
  const endIdx = Math.min(startIdx + visibleRows + 1, filteredCount);
  const totalPages = Math.ceil(filteredCount / state.pagination.size) || 1;
  document.getElementById("paginationInfo").textContent =
    `Showing ${filteredCount ? startIdx + 1 : 0} - ${endIdx} of ${filteredCount} servers (Page ${state.pagination.page}/${totalPages})`;
  document.getElementById("nextPageBtn").disabled =
    state.pagination.page >= totalPages;
}

async function asyncPool(iterable, iteratorFn, concurrency, shouldAbortFn) {
  const executing = new Set();
  for (const item of iterable) {
    if (shouldAbortFn && shouldAbortFn()) {
      break;
    }
    const p = Promise.resolve().then(() => iteratorFn(item));
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

export async function startBackgroundPinging() {
  if (state.bgPing.isRunning) return;
  state.bgPing.isRunning = true;
  const myGeneration = state.bgPing.generation;
  const seen = new Set();
  const queue = [];
  for (const s of state.allServers) {
    if (s.realPing === undefined) {
      const key = `${s.ip}:${s.port}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push(s);
      }
    }
  }

  await asyncPool(
    queue,
    async (server) => {
      if (myGeneration !== state.bgPing.generation) return;
      if (server.realPing !== undefined) return;

      server.isPinging = true;
      let statusObj = null;
      try {
        statusObj = await Promise.race([
          window.api.servers.ping(server.ip, server.port, server.queryPort),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("TIMEOUT")), PING_TIMEOUT_MS)
          ),
        ]);
      } catch {
        statusObj = null;
      }

      if (myGeneration !== state.bgPing.generation) {
        server.isPinging = false;
        return;
      }
      server.isPinging = false;
      const isFirstPing = server.realPing === undefined;

      applyPingResult(server, statusObj);

      if (!serverPassesFilters(server)) {
        if (!_needsResort) {
          _needsResort = true;
          if (_resortTimer) clearTimeout(_resortTimer);
          _resortTimer = setTimeout(() => {
            _resortTimer = null;
            _needsResort = false;
            import("../serverBrowser.js").then(({ renderServers }) => {
              if (state.expandedServerId === null) renderServers();
            });
          }, 400);
        }
        updateStatsInline();
        return;
      }

      if (statusObj !== null) {
        if (statusObj.name) {
          const rowEl = document.getElementById(`row-${server.id}`);
          if (rowEl) {
            const nameCell = rowEl.querySelector(".server-name-cell");
            if (nameCell) {
              nameCell.textContent = statusObj.name;
              nameCell.title = statusObj.name;
            }
          }
          const favRowEl = document.getElementById(`fav-row-${server.id}`);
          if (favRowEl) {
            const favNameCell = favRowEl.querySelector(".server-name-cell");
            if (favNameCell) {
              favNameCell.textContent = statusObj.name;
              favNameCell.title = statusObj.name;
            }
          }
        }

        const rowId =
          server.id ||
          `${server.ip}:${server.port}`.replace(/[^a-zA-Z0-9]/g, "-");
        const metaCell = document.getElementById(`meta-cell-${rowId}`);
        if (metaCell) {
          metaCell.replaceChildren();
          metaCell.appendChild(renderMetadataBadges(server));
        }
        const favMetaCell = document.getElementById(`fav-meta-cell-${rowId}`);
        if (favMetaCell) {
          favMetaCell.replaceChildren();
          favMetaCell.appendChild(renderMetadataBadges(server));
        }
      }

      if (isFirstPing) {
        state.totalPingedCount = (state.totalPingedCount || 0) + 1;
      }

      if (
        server.players > 0 ||
        (statusObj !== null && statusObj.players !== null)
      ) {
        const rowId =
          server.id ||
          `${server.ip}:${server.port}`.replace(/[^a-zA-Z0-9]/g, "-");
        const playerCell = document.getElementById(`player-cell-${rowId}`);
        if (playerCell) {
          const bc = getPlayerBadgeClass(server.players, server.maxPlayers);
          playerCell.replaceChildren();
          const ps = document.createElement("span");
          ps.className = `player-badge ${bc}`;
          ps.textContent = `${server.players}/${server.maxPlayers}`;
          playerCell.appendChild(ps);
        }
        const pingCell = document.getElementById(`ping-cell-${rowId}`);
        if (pingCell) {
          pingCell.replaceChildren();
          pingCell.appendChild(renderPingBadge(server.realPing));
        }
      }

      if (server.players > 0) {
        if (!_needsResort) {
          _needsResort = true;
          if (_resortTimer) clearTimeout(_resortTimer);
          _resortTimer = setTimeout(() => {
            _resortTimer = null;
            _needsResort = false;
            import("../serverBrowser.js").then(({ renderServers }) => {
              if (state.expandedServerId === null) renderServers();
            });
          }, 400);
        }
      }
      updateStatsInline();
      insertServerRow(server);
    },
    state.settings?.queryConcurrency || 500,
    () => myGeneration !== state.bgPing.generation
  );

  state.bgPing.isRunning = false;
  
  const shouldRerender = state.sort.column === "ping" || document.getElementById("serverListBody").childElementCount === 0;
  if (shouldRerender) {
    document.dispatchEvent(new CustomEvent("dzlinux:render-servers"));
  }

  const stillUnpinged = state.allServers.filter(
    (s) => s.realPing === undefined
  ).length;
  if (stillUnpinged > 0) {
    setTimeout(() => {
      if (state.bgPing.generation !== myGeneration) return;
      if (state.sort.column === "ping") {
        document.dispatchEvent(new CustomEvent("dzlinux:render-servers"));
      }
      startBackgroundPinging();
    }, 15000);
  }
}

export async function refreshServers(isBackground = false) {
  state.bgPing.generation++;
  const myGeneration = state.bgPing.generation;

  state.allServers = [];
  existingServersMap.clear();
  state.totalPingedCount = 0;
  state.bgPing.queue = [];
  state.bgPing.isRunning = false;

  if (!isBackground) {
    document.getElementById("serverListBody").innerHTML = `
      <tr class="skeleton-row"><td colspan="8"><div class="skeleton-bar" style="width: 60%"></div></td></tr>
      <tr class="skeleton-row"><td colspan="8"><div class="skeleton-bar" style="width: 45%"></div></td></tr>
      <tr class="skeleton-row"><td colspan="8"><div class="skeleton-bar" style="width: 70%"></div></td></tr>
    `;
  }

  try {
    await refreshLocalModsCache();

    if (!isServersBatchListenerAdded) {
      window.api.servers.onBatch((batch, generationId) => {
        if (
          generationId !== undefined &&
          generationId !== state.bgPing.generation
        ) {
          return;
        }
        batch.forEach((newServer) => {
          const key = `${newServer.ip}:${newServer.port}`;
          const existingIdx = existingServersMap.has(key) ? existingServersMap.get(key) : -1;

          if (existingIdx !== -1) {
            const liveStats = {
              realPing: state.allServers[existingIdx].realPing,
              isPinging: state.allServers[existingIdx].isPinging,
              name: state.allServers[existingIdx].name,
            };
            if (
              state.allServers[existingIdx].realPing !== undefined &&
              !state.allServers[existingIdx].failedPing
            ) {
              liveStats.players = state.allServers[existingIdx].players;
              liveStats.maxPlayers = state.allServers[existingIdx].maxPlayers;
              liveStats.status = state.allServers[existingIdx].status;
            }
            state.allServers[existingIdx] = {
              ...state.allServers[existingIdx],
              ...newServer,
              ...liveStats,
            };
          } else {
            existingServersMap.set(key, state.allServers.length);
            state.allServers.push({
              ...newServer,
              originalIndex: state.allServers.length,
            });
          }
        });
        updateFooterTimestamp();
        scheduleRenderServers();
      });
      isServersBatchListenerAdded = true;
    }

    const finalServers = await window.api.servers.fetch(myGeneration);
    if (myGeneration !== state.bgPing.generation) return;
    if (finalServers && finalServers.length > 0) {
      finalServers.forEach((newServer) => {
        const key = `${newServer.ip}:${newServer.port}`;
        const existingIdx = existingServersMap.has(key) ? existingServersMap.get(key) : -1;

        if (existingIdx !== -1) {
          state.allServers[existingIdx] = {
            ...state.allServers[existingIdx],
            ...newServer,
          };
        } else {
          existingServersMap.set(key, state.allServers.length);
          state.allServers.push({
            ...newServer,
            originalIndex: state.allServers.length,
          });
        }
      });
      state.expandedServerId = null;
      document.dispatchEvent(new CustomEvent("dzlinux:render-servers"));
      if (!state.bgPing.isRunning) startBackgroundPinging();
    }
    setFooterStatus(true);
  } catch (e) {
    console.error("Failed to refresh servers", e);
    setFooterStatus(false);
  }

  updateFooterTimestamp();
  startCountdown();
}

document.addEventListener("dzlinux:update-stats", () => {
  updateStatsInline();
});
