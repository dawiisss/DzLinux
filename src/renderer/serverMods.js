import { state } from "./state.js";
import { favoriteKey } from "./favoriteIdentity.js";

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

function publishResult(server, consumers = []) {
  const targets = new Set([server, ...consumers]);
  // Browser refreshes can replace entries while a query is pending. Resolve
  // the current object at completion, including entries that were never rendered.
  const key = favoriteKey(server.ip, server.port);
  const current = state.allServers.find(item => favoriteKey(item.ip, item.port) === key);
  if (current) targets.add(current);
  const fields = ["mods", "hasQueriedMods", "modded", "isQueryingMods", "modQueryFailed"];
  // Update every object before notifying views, which may synchronously read
  // another representation of the same server while rebuilding its details.
  for (const target of targets) {
    if (target !== server) for (const field of fields) target[field] = server[field];
  }
  for (const target of targets) notify(target);
}

function applyResult(server, mods, consumers = []) {
  server.isQueryingMods = false;
  server.hasQueriedMods = true;
  server.modQueryFailed = mods === null;
  if (mods !== null) {
    server.mods = mods;
    if (mods.length) server.modded = true;
  }
  publishResult(server, consumers);
}

export function rememberServerMods(server, mods) {
  const key = favoriteKey(server.ip, server.port);
  cache.delete(key);
  cache.set(key, { mods, timestamp: Date.now() });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}

function cancelEntry(entry) {
  entry.cancelled = true;
  if (entry.running && entry.requestId) window.api.servers.cancelPingRequest?.(entry.requestId);
  for (const server of entry.consumers) server.isQueryingMods = false;
  entry.resolve(null);
  if (pending.get(entry.key) === entry) pending.delete(entry.key);
}

// Explicit and automatic queries share ownership by address, even when Browser
// and Favorites use different objects and row IDs for that address.
export function beginServerModRefresh(server) {
  const key = favoriteKey(server.ip, server.port);
  const previous = pending.get(key);
  const consumers = new Set(previous?.consumers || []);
  if (previous) cancelEntry(previous);
  consumers.add(server);
  const browser = state.allServers.find((item) => favoriteKey(item.ip, item.port) === key);
  if (browser) consumers.add(browser);
  const entry = { key, server, consumers, explicit: true, cancelled: false };
  entry.promise = new Promise(resolve => { entry.resolve = resolve; });
  pending.set(key, entry);
  cache.delete(key);
  for (const consumer of consumers) consumer.isQueryingMods = true;
  const isCurrent = () => pending.get(key) === entry && !entry.cancelled;
  return {
    isCurrent,
    finish() {
      if (!isCurrent()) return;
      pending.delete(key);
      const mods = server.modQueryFailed ? null : server.mods;
      if (mods !== null) rememberServerMods(server, mods);
      publishResult(server, consumers);
      entry.resolve(mods);
    },
  };
}

function drain() {
  const concurrency = Math.min(CONCURRENCY,
    Math.max(1, Math.floor((state.settings?.queryConcurrency || 150) / 8)));
  while (active < concurrency && waiting.length) {
    const entry = waiting.shift();
    if (entry.cancelled) continue;
    if (entry.server.modQueryGeneration !== entry.revision) {
      cancelEntry(entry);
      continue;
    }
    const mounted = [...entry.consumers].some(server =>
      ["row-", "fav-row-", "detail-", "fav-detail-"].some(prefix => document.getElementById(prefix + server.id)));
    if (!mounted) {
      // Paging/resorting can remove a row before its metadata slot is free.
      // Do not leave the current page waiting behind rows that are now hidden.
      cancelEntry(entry);
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
      if (!entry.cancelled && pending.get(entry.key) === entry && entry.server.modQueryGeneration === entry.revision &&
          state.bgPing.generation === entry.generation) {
        pending.delete(entry.key);
        if (mods !== null) {
          rememberServerMods(entry.server, mods);
        }
        applyResult(entry.server, mods, entry.consumers);
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
  const key = favoriteKey(server.ip, server.port);
  const existing = pending.get(key);
  if (existing && !existing.cancelled) {
    existing.consumers.add(server);
    server.isQueryingMods = true;
    return existing.promise;
  }
  if (server.mods?.length || (server.hasQueriedMods && !server.modQueryFailed)) {
    return Promise.resolve(server.mods || []);
  }
  if (server.modQueryFailed) return Promise.resolve(null);
  const saved = cache.get(key);
  if (saved && Date.now() - saved.timestamp < CACHE_TTL_MS) {
    applyResult(server, saved.mods);
    return Promise.resolve(saved.mods);
  }
  const generation = state.bgPing.generation;
  const revision = server.modQueryGeneration = (server.modQueryGeneration || 0) + 1;
  const entry = { key, server, generation, revision, consumers: new Set([server]),
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
    // A server-list refresh cancels background enrichment, not an explicit
    // refresh being performed in another view.
    if (!entry.explicit) cancelEntry(entry);
  }
  waiting = [];
}
