import { state } from "./state.js";

// Enrich displayed rows without holding up the much larger population sweep.
const CONCURRENCY = 8;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 1000;
const cache = new Map();
const pending = new Map();
let waiting = [];
let active = 0;
let nextRequestId = 0;

export function getServerModCount(server) {
  if (server.mods?.length || (server.hasQueriedMods && !server.modQueryFailed)) {
    return String(server.mods?.length || 0);
  }
  return server.modQueryFailed ? "—" : "…";
}

function notify(server) {
  document.dispatchEvent(new CustomEvent("dzlinux:server-mods-updated", { detail: { server } }));
}

function applyResult(server, mods) {
  server.isQueryingMods = false;
  server.hasQueriedMods = true;
  server.modQueryFailed = mods === null;
  if (mods !== null) {
    server.mods = mods;
    if (mods.length) server.modded = true;
  }
  notify(server);
}

export function rememberServerMods(server, mods) {
  const key = `${server.ip}:${server.port}`;
  cache.delete(key);
  cache.set(key, { mods, timestamp: Date.now() });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}

function drain() {
  const concurrency = Math.min(CONCURRENCY,
    Math.max(1, Math.floor((state.settings?.queryConcurrency || 150) / 8)));
  while (active < concurrency && waiting.length) {
    const entry = waiting.shift();
    if (entry.cancelled) continue;
    if (entry.server.modQueryGeneration !== entry.revision) {
      if (pending.get(entry.key) === entry) pending.delete(entry.key);
      entry.resolve(null);
      continue;
    }
    if (!document.getElementById(`row-${entry.server.id}`) &&
        !document.getElementById(`fav-row-${entry.server.id}`) &&
        !document.getElementById(`detail-${entry.server.id}`) &&
        !document.getElementById(`fav-detail-${entry.server.id}`)) {
      // Paging/resorting can remove a row before its metadata slot is free.
      // Do not leave the current page waiting behind rows that are now hidden.
      entry.server.isQueryingMods = false;
      if (pending.get(entry.key) === entry) pending.delete(entry.key);
      entry.resolve(null);
      continue;
    }
    active++;
    entry.running = true;
    void (async () => {
      let mods = null;
      try {
        mods = await window.api.servers.queryMods(
          entry.server.ip, entry.server.port, entry.server.queryPort, entry.requestId,
        );
        if (!Array.isArray(mods)) mods = null;
      } catch {
        // Explicit Refresh remains available after a failed background query.
      }
      if (!entry.cancelled && entry.server.modQueryGeneration === entry.revision &&
          state.bgPing.generation === entry.generation) {
        if (mods !== null) {
          rememberServerMods(entry.server, mods);
        }
        applyResult(entry.server, mods);
      }
      entry.resolve(mods);
    })().catch(error => {
      console.error("Failed to update server mod count:", error);
      entry.resolve(null);
    }).finally(() => {
      active--;
      if (pending.get(entry.key) === entry) pending.delete(entry.key);
      drain();
    });
  }
}

export function loadServerMods(server) {
  if (server.mods?.length || (server.hasQueriedMods && !server.modQueryFailed)) {
    return Promise.resolve(server.mods || []);
  }
  const key = `${server.ip}:${server.port}`;
  if (server.modQueryFailed) return Promise.resolve(null);
  const saved = cache.get(key);
  if (saved && Date.now() - saved.timestamp < CACHE_TTL_MS) {
    applyResult(server, saved.mods);
    return Promise.resolve(saved.mods);
  }
  const existing = pending.get(key);
  if (existing && !existing.cancelled) return existing.promise;
  const generation = state.bgPing.generation;
  const revision = server.modQueryGeneration = (server.modQueryGeneration || 0) + 1;
  const entry = { key, server, generation, revision,
    requestId: `${generation}:mods:${nextRequestId++}`, cancelled: false };
  entry.promise = new Promise(resolve => { entry.resolve = resolve; });
  server.isQueryingMods = true;
  server.modQueryFailed = false;
  server.hasQueriedMods = false;
  pending.set(key, entry);
  waiting.push(entry);
  // Defer dispatch until the current row render has finished attaching nodes.
  queueMicrotask(drain);
  return entry.promise;
}

export function cancelServerModQueries() {
  for (const entry of pending.values()) {
    entry.cancelled = true;
    if (entry.running) window.api.servers.cancelPingRequest?.(entry.requestId);
    if (entry.server.modQueryGeneration === entry.revision) entry.server.isQueryingMods = false;
    entry.resolve(null);
  }
  pending.clear();
  waiting = [];
}
