import { favoriteKey } from "../favoriteIdentity.js";
import { state, markServerDataChanged } from "../state.js";
import { refreshLocalModsCache } from "../modManager.js";
import { serverPassesFilters } from "./serverBrowserCore.js";
import {
  buildServerRow,
  renderMetadataBadges,
  updateServerRowPresentation,
} from "../serverRow.js";
import { applyPingResult, getPlayerBadgeClass, renderPingBadge } from "../utils.js";
import { cancelServerModQueries } from "../serverMods.js";

let _needsResort = false;
let _resortTimer = null;
let _renderPending = false;
let _renderTimer = null;
let _statsPending = false;
let _statsTimer = null;
let inFlightRefreshPromise = null;
let inFlightRefreshKey = null;
let isFetchingServers = false;

const existingServersMap = new Map();
const PING_TIMEOUT_MS = 10000;

function updateRefreshProgressIndicator() {
  const indicator = document.getElementById("refreshProgressIndicator");
  if (!indicator) return;
  const isRefreshing = Boolean(
    isFetchingServers || inFlightRefreshPromise || state.bgPing.isRunning,
  );
  indicator.hidden = !isRefreshing;
  if (isRefreshing) {
    indicator.title = "Refreshing server list...";
  }
}

function stopAutoRefreshTimers() {
  if (state.autoRefresh.countdownInterval) {
    clearInterval(state.autoRefresh.countdownInterval);
    state.autoRefresh.countdownInterval = null;
  }
  if (state.autoRefresh.interval) {
    clearInterval(state.autoRefresh.interval);
    state.autoRefresh.interval = null;
  }
}

function clearPendingRenderTimers() {
  if (_renderTimer) {
    clearTimeout(_renderTimer);
    _renderTimer = null;
  }
  _renderPending = false;
  if (_resortTimer) {
    clearTimeout(_resortTimer);
    _resortTimer = null;
  }
  _needsResort = false;
  if (_statsTimer) {
    clearTimeout(_statsTimer);
    _statsTimer = null;
  }
  _statsPending = false;
}

function computeRefreshInputKey() {
  const modDir = state.settings?.modDirectory || "";
  const trust = state.settings?.enableTrustScore !== false ? "1" : "0";
  const favs = (state.favorites || state.settings?.favorites || [])
    .map((f) =>
      typeof f === "string"
        ? f
        : `${f?.ip || ""}:${f?.port || ""}:${f?.queryPort || ""}:${f?.name || ""}`,
    )
    .join("|");
  return `${modDir}::${trust}::${favs}`;
}

function rekeyMountedServerDom(oldId, newId) {
  if (!oldId || !newId || oldId === newId) return;
  const rowEl = document.getElementById(`row-${oldId}`);
  if (rowEl) {
    rowEl.id = `row-${newId}`;
    const playerCell = document.getElementById(`player-cell-${oldId}`);
    if (playerCell) playerCell.id = `player-cell-${newId}`;
    const pingCell = document.getElementById(`ping-cell-${oldId}`);
    if (pingCell) pingCell.id = `ping-cell-${newId}`;
    const metaCell = document.getElementById(`meta-cell-${oldId}`);
    if (metaCell) metaCell.id = `meta-cell-${newId}`;
  }
  const detailEl = document.getElementById(`detail-${oldId}`);
  if (detailEl) {
    detailEl.id = `detail-${newId}`;
  }
  const favRowEl = document.getElementById(`fav-row-${oldId}`);
  if (favRowEl) {
    favRowEl.id = `fav-row-${newId}`;
    const favPlayerCell = document.getElementById(`fav-player-cell-${oldId}`);
    if (favPlayerCell) favPlayerCell.id = `fav-player-cell-${newId}`;
    const favPingCell = document.getElementById(`fav-ping-cell-${oldId}`);
    if (favPingCell) favPingCell.id = `fav-ping-cell-${newId}`;
    const favMetaCell = document.getElementById(`fav-meta-cell-${oldId}`);
    if (favMetaCell) favMetaCell.id = `fav-meta-cell-${newId}`;
  }
  const favDetailEl = document.getElementById(`fav-detail-${oldId}`);
  if (favDetailEl) {
    favDetailEl.id = `fav-detail-${newId}`;
  }
  if (state.expandedServerId === oldId) {
    state.expandedServerId = newId;
  }
  if (state.hoveredRowId === oldId) {
    state.hoveredRowId = newId;
  }
}

function liveMeasurements(server, newServer = null) {
  if (!Number.isFinite(server.realPing) || server.realPing < 0 || server.failedPing) return {};
  const preserved = {
    realPing: server.realPing,
    ping: server.ping,
    failedPing: false,
    status: server.status,
    players: server.players,
    maxPlayers: server.maxPlayers,
    reportedPlayers: server.reportedPlayers ?? null,
    reportedCapacity: server.reportedCapacity ?? null,
    thirdPerson: server.thirdPerson,
    modded: server.modded,
    password: Boolean(server.password),
  };
  if (
    server.name &&
    server.name !== "Unknown Server" &&
    (!newServer?.name ||
      newServer.name === "Unknown Server" ||
      newServer.isFavoritePlaceholder)
  ) {
    preserved.name = server.name;
  }
  if (server.map && !newServer?.map) {
    preserved.map = server.map;
  }
  if (server.time && !newServer?.time) {
    preserved.time = server.time;
  }
  if (server.queryPort && !newServer?.queryPort) {
    preserved.queryPort = server.queryPort;
  }
  return preserved;
}

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
  const totalEl = document.getElementById("statTotalServers");
  if (totalEl) totalEl.textContent = pingedServers.length;
  const playersEl = document.getElementById("statTotalPlayers");
  if (playersEl) playersEl.textContent = totalPlayers;
  const filteredEl = document.getElementById("statFilteredServers");
  if (filteredEl) filteredEl.textContent = filtered.length;
}

export function updateFooterTimestamp() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const el = document.getElementById("footerLastRefresh");
  if (el) el.textContent = `Last refresh: ${timeStr}`;
}

export function setFooterStatus(online) {
  const dot = document.getElementById("footerStatusDot");
  const text = document.getElementById("footerStatusText");
  const banner = document.getElementById("connectionBanner");
  if (dot)
    dot.style.background = online ? "var(--accent-green)" : "var(--accent-red)";
  if (text) text.textContent = online ? "Connected" : "Offline";
  if (banner) banner.style.display = online ? "none" : "flex";
}

export function startCountdown() {
  stopAutoRefreshTimers();

  const badge = document.getElementById("countdownBadge");

  const isEnabled =
    state.settings?.autoRefreshEnabled === "false"
      ? false
      : Boolean(state.settings?.autoRefreshEnabled);
  if (!isEnabled) {
    if (badge) {
      badge.textContent = "Manual";
      badge.title = "Auto-refresh disabled";
    }
    return;
  }

  const refreshSeconds = parseInt(state.settings?.autoRefreshTime) || 360;
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
      state.autoRefresh.countdownInterval = null;
    }
  }, 1000);

  state.autoRefresh.interval = setInterval(() => {
    refreshServers(true);
  }, refreshSeconds * 1000);
}

export function scheduleRenderServers() {
  if (_renderPending) return;
  _renderPending = true;
  const scheduledGeneration = state.bgPing.generation;
  _renderTimer = setTimeout(() => {
    _renderTimer = null;
    _renderPending = false;
    if (scheduledGeneration !== state.bgPing.generation) return;
    document.dispatchEvent(new CustomEvent("dzlinux:render-servers"));
  }, 200);
}

export function updateStatsInline() {
  if (_statsPending) return;
  _statsPending = true;
  if (_statsTimer) clearTimeout(_statsTimer);
  const scheduledGeneration = state.bgPing.generation;
  _statsTimer = setTimeout(() => {
    _statsTimer = null;
    _statsPending = false;
    if (scheduledGeneration !== state.bgPing.generation) return;
    updateStatsInlineSync();
  }, 200);
}

export function updateStatsInlineSync() {
  const allPinged = state.allServers.filter(
    (s) => s.realPing !== undefined && s.realPing !== -1 && !s.failedPing
  );
  const filteredCount = allPinged.filter((s) => serverPassesFilters(s)).length;
  const totalEl = document.getElementById("statTotalServers");
  if (totalEl) totalEl.textContent = allPinged.length;
  const playersEl = document.getElementById("statTotalPlayers");
  if (playersEl) {
    playersEl.textContent = allPinged.reduce(
      (sum, s) => sum + (s.players || 0),
      0
    );
  }
  const filteredEl = document.getElementById("statFilteredServers");
  if (filteredEl) filteredEl.textContent = filteredCount;

  const totalPages = Math.ceil(filteredCount / state.pagination.size) || 1;
  const tbody = document.getElementById("serverListBody");
  const visibleRows = tbody
    ? tbody.querySelectorAll("tr.server-row").length
    : 0;
  const startIdx = (state.pagination.page - 1) * state.pagination.size;
  const endIdx = Math.min(startIdx + visibleRows, filteredCount);
  const paginationInfo = document.getElementById("paginationInfo");
  if (paginationInfo) {
    paginationInfo.textContent =
      `Showing ${filteredCount ? startIdx + 1 : 0} - ${endIdx} of ${filteredCount} servers (Page ${state.pagination.page}/${totalPages})`;
  }
  const nextBtn = document.getElementById("nextPageBtn");
  if (nextBtn) {
    nextBtn.disabled = state.pagination.page >= totalPages;
  }
}

export function insertServerRow(server) {
  if (!serverPassesFilters(server)) return;
  const rowId = `row-${server.id}`;
  if (document.getElementById(rowId)) return;
  const tbody = document.getElementById("serverListBody");
  if (!tbody) return;
  const visibleRows = tbody.querySelectorAll("tr.server-row").length;
  if (visibleRows >= state.pagination.size) return;
  const tr = buildServerRow(server);
  if (tr && typeof tr === "object" && "nodeType" in tr) {
    tbody.appendChild(tr);
  }
  updateStatsInline();
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
  updateRefreshProgressIndicator();
  const myGeneration = state.bgPing.generation;
  const seen = new Set();
  const priorityQueue = [];
  const secondaryQueue = [];
  for (const s of state.allServers) {
    if (s.realPing === undefined || s._needsRefreshPing) {
      const key = favoriteKey(s.ip, s.port) || `${s.ip}:${s.port}`;
      if (!seen.has(key)) {
        seen.add(key);
        if (
          s._needsRefreshPing &&
          Number.isFinite(s.realPing) &&
          s.realPing >= 0 &&
          !s.failedPing
        ) {
          priorityQueue.push(s);
        } else {
          secondaryQueue.push(s);
        }
      }
    }
  }
  const queue = priorityQueue.concat(secondaryQueue);

  await asyncPool(
    queue,
    async (server) => {
      if (myGeneration !== state.bgPing.generation || server._removed) return;
      if (server.realPing !== undefined && !server._needsRefreshPing) return;

      server.isPinging = true;
      let statusObj = null;
      const requestId = `${myGeneration}:${state.bgPing.nextRequestId++}`;
      let timeoutId = null;
      try {
        statusObj = await Promise.race([
          window.api.servers.ping(server.ip, server.port, server.queryPort, requestId),
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              window.api.servers.cancelPingRequest?.(requestId);
              reject(new Error("TIMEOUT"));
            }, PING_TIMEOUT_MS);
          }),
        ]);
      } catch {
        statusObj = null;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }

      if (myGeneration !== state.bgPing.generation || server._removed) {
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
            if (myGeneration !== state.bgPing.generation) return;
            import("../serverBrowser.js").then(({ renderServers }) => {
              if (myGeneration !== state.bgPing.generation) return;
              if (state.expandedServerId === null) renderServers();
            });
          }, 400);
        }
        updateStatsInline();
        return;
      }

      const rowEl = document.getElementById(`row-${server.id}`);
      const favRowEl = document.getElementById(`fav-row-${server.id}`);
      if (typeof updateServerRowPresentation === "function") {
        if (rowEl) updateServerRowPresentation(rowEl, server, false);
        if (favRowEl) updateServerRowPresentation(favRowEl, server, true);
      } else {
        if (statusObj !== null) {
          if (statusObj.name) {
            if (rowEl) {
              const nameCell = rowEl.querySelector(".server-name-cell");
              if (nameCell) {
                nameCell.textContent = statusObj.name;
                nameCell.title = statusObj.name;
              }
            }
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
      }

      if (isFirstPing) {
        state.totalPingedCount = (state.totalPingedCount || 0) + 1;
      }

      if (server.players > 0 || !isFirstPing) {
        if (!_needsResort) {
          _needsResort = true;
          if (_resortTimer) clearTimeout(_resortTimer);
          _resortTimer = setTimeout(() => {
            _resortTimer = null;
            _needsResort = false;
            if (myGeneration !== state.bgPing.generation) return;
            import("../serverBrowser.js").then(({ renderServers }) => {
              if (myGeneration !== state.bgPing.generation) return;
              if (state.expandedServerId === null) renderServers();
            });
          }, 400);
        }
      }
      updateStatsInline();
      insertServerRow(server);
    },
    state.settings?.queryConcurrency || 150,
    () => myGeneration !== state.bgPing.generation
  );

  // An older pool must not reset the running flag for a newer refresh.
  if (myGeneration !== state.bgPing.generation) return;
  state.bgPing.isRunning = false;
  updateRefreshProgressIndicator();

  const tbody = document.getElementById("serverListBody");
  const shouldRerender =
    state.sort.column === "ping" || Boolean(tbody && tbody.childElementCount === 0);
  if (shouldRerender) {
    document.dispatchEvent(new CustomEvent("dzlinux:render-servers"));
  }

  const stillUnpinged = state.allServers.filter(
    (s) => s.realPing === undefined || s._needsRefreshPing
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

export function refreshServers(isBackground = false) {
  stopAutoRefreshTimers();

  const inputKey = computeRefreshInputKey();
  const refreshBtn = document.getElementById("refreshServersBtn");
  if (refreshBtn && !isBackground) {
    refreshBtn.disabled = true;
    refreshBtn.setAttribute("aria-busy", "true");
  }

  if (inFlightRefreshPromise && inFlightRefreshKey === inputKey) {
    if (!isBackground && state.allServers.length === 0) {
      const tbody = document.getElementById("serverListBody");
      if (tbody) {
        tbody.innerHTML = `
          <tr class="skeleton-row"><td colspan="9"><div class="skeleton-bar" style="width: 60%"></div></td></tr>
          <tr class="skeleton-row"><td colspan="9"><div class="skeleton-bar" style="width: 45%"></div></td></tr>
          <tr class="skeleton-row"><td colspan="9"><div class="skeleton-bar" style="width: 70%"></div></td></tr>
        `;
      }
    }
    return inFlightRefreshPromise;
  }

  cancelServerModQueries();
  clearPendingRenderTimers();
  const previousGeneration = state.bgPing.generation;
  state.bgPing.generation++;
  const myGeneration = state.bgPing.generation;
  if (previousGeneration > 0) {
    window.api?.servers?.cancelPingGeneration?.(previousGeneration);
  }

  state.bgPing.queue = [];
  state.bgPing.isRunning = false;
  isFetchingServers = true;
  updateRefreshProgressIndicator();
  for (const existing of state.allServers) {
    if (existing && typeof existing === "object") {
      existing._needsRefreshPing = true;
    }
  }

  if (!isBackground && state.allServers.length === 0) {
    const tbody = document.getElementById("serverListBody");
    if (tbody) {
      tbody.innerHTML = `
        <tr class="skeleton-row"><td colspan="9"><div class="skeleton-bar" style="width: 60%"></div></td></tr>
        <tr class="skeleton-row"><td colspan="9"><div class="skeleton-bar" style="width: 45%"></div></td></tr>
        <tr class="skeleton-row"><td colspan="9"><div class="skeleton-bar" style="width: 70%"></div></td></tr>
      `;
    }
  }

  inFlightRefreshKey = inputKey;
  const runPromise = (async () => {
    try {
      await refreshLocalModsCache();
      if (myGeneration !== state.bgPing.generation) return;

      const finalServers = await window.api.servers.fetch(myGeneration);
      if (myGeneration !== state.bgPing.generation) return;

      const previousByAddress = new Map();
      for (const existing of state.allServers) {
        if (!existing || !existing.ip) continue;
        const key =
          favoriteKey(existing.ip, existing.port) ||
          `${existing.ip}:${existing.port}`;
        if (!previousByAddress.has(key)) {
          previousByAddress.set(key, existing);
        }
      }

      if (Array.isArray(finalServers) && finalServers.length > 0) {
        const nextServers = [];
        const nextMap = new Map();

        finalServers.forEach((newServer) => {
          if (!newServer || !newServer.ip) return;
          const key =
            favoriteKey(newServer.ip, newServer.port) ||
            `${newServer.ip}:${newServer.port}`;
          const existingInBatchIdx = nextMap.has(key) ? nextMap.get(key) : -1;

          if (existingInBatchIdx !== -1) {
            const target = nextServers[existingInBatchIdx];
            const measurements = liveMeasurements(target, newServer);
            Object.assign(target, newServer, measurements, {
              originalIndex: existingInBatchIdx,
              isFavoritePlaceholder: Boolean(newServer.isFavoritePlaceholder),
              _removed: false,
            });
            return;
          }

          if (previousByAddress.has(key)) {
            const model = previousByAddress.get(key);
            previousByAddress.delete(key);
            const previousId = model.id;
            const measurements = liveMeasurements(model, newServer);
            const preservedMods =
              ((model.hasQueriedMods && !model.modQueryFailed) ||
                (Array.isArray(model.mods) && model.mods.length > 0)) &&
              (!newServer.mods || newServer.mods.length === 0)
                ? {
                    mods: Array.isArray(model.mods) ? model.mods : [],
                    hasQueriedMods: Boolean(model.hasQueriedMods),
                    modQueryFailed: false,
                    modded:
                      Array.isArray(model.mods) && model.mods.length > 0
                        ? true
                        : Boolean(
                            measurements.modded !== undefined
                              ? measurements.modded
                              : model.modded,
                          ),
                  }
                : {};

            if (newServer.verifiedCommunity === undefined) {
              delete model.verifiedCommunity;
            }
            if (newServer.monetized === undefined) {
              delete model.monetized;
            }

            const resetPingState =
              measurements.realPing === undefined
                ? {
                    realPing: newServer.realPing,
                    failedPing: Boolean(newServer.failedPing),
                  }
                : {};
            const needsRefreshPing =
              newServer.realPing !== undefined
                ? false
                : Boolean(model._needsRefreshPing);

            Object.assign(
              model,
              newServer,
              resetPingState,
              preservedMods,
              measurements,
              {
                originalIndex: nextServers.length,
                isFavoritePlaceholder: Boolean(newServer.isFavoritePlaceholder),
                _needsRefreshPing: needsRefreshPing,
                _removed: false,
              },
            );
            if (previousId && model.id && previousId !== model.id) {
              rekeyMountedServerDom(previousId, model.id);
            }
            nextMap.set(key, nextServers.length);
            nextServers.push(model);
          } else {
            const model = {
              ...newServer,
              isFavoritePlaceholder: Boolean(newServer.isFavoritePlaceholder),
              originalIndex: nextServers.length,
              _needsRefreshPing: false,
              _removed: false,
            };
            nextMap.set(key, nextServers.length);
            nextServers.push(model);
          }
        });

        for (const staleModel of previousByAddress.values()) {
          staleModel._removed = true;
        }

        state.allServers = nextServers;
        existingServersMap.clear();
        for (const [k, idx] of nextMap.entries()) {
          existingServersMap.set(k, idx);
        }
        state.totalPingedCount = state.allServers.filter(
          (s) => s.realPing !== undefined
        ).length;
        if (
          state.expandedServerId &&
          !state.allServers.some((s) => s.id === state.expandedServerId)
        ) {
          state.expandedServerId = null;
        }
        markServerDataChanged();
        document.dispatchEvent(new CustomEvent("dzlinux:render-servers"));
        if (!state.bgPing.isRunning) startBackgroundPinging();
      } else if (Array.isArray(finalServers)) {
        for (const staleModel of previousByAddress.values()) {
          staleModel._removed = true;
        }
        state.allServers = [];
        existingServersMap.clear();
        state.totalPingedCount = 0;
        state.expandedServerId = null;
        markServerDataChanged();
        document.dispatchEvent(new CustomEvent("dzlinux:render-servers"));
      }
      setFooterStatus(true);
    } catch (e) {
      if (myGeneration !== state.bgPing.generation) return;
      console.error("Failed to refresh servers", e);
      setFooterStatus(false);
    } finally {
      if (inFlightRefreshPromise === runPromise) {
        inFlightRefreshPromise = null;
        inFlightRefreshKey = null;
      }
      if (myGeneration === state.bgPing.generation) {
        isFetchingServers = false;
        const btn = document.getElementById("refreshServersBtn");
        if (btn) {
          btn.disabled = false;
          btn.removeAttribute("aria-busy");
        }
        updateRefreshProgressIndicator();
        updateFooterTimestamp();
        startCountdown();
      }
    }
  })();

  inFlightRefreshPromise = runPromise;
  return runPromise;
}

document.addEventListener("dzlinux:update-stats", () => {
  updateStatsInlineSync();
});
