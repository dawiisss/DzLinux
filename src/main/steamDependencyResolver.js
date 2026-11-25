const axios = require("axios");
const { createQueryLimiter } = require("./queryLimiter");

const dependencyCache = new Map();
const inFlightRequests = new Map();
const requestSlots = createQueryLimiter(4);
const MAX_DEPTH = 5;
const MAX_GRAPH_NODES = 2000;
const MAX_CHILDREN = 100;
const MAX_TREE_NODES = 5000;
const BATCH_SIZE = 50;
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 1000;

function makeNode(id, name, children = [], flags = {}) {
  return { id, name: name || `Mod ${id}`, children, ...flags };
}

function parseFileSize(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+$/.test(value)) return null;
  const bytes = Number(value);
  return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
}

async function fetchChunk(ids, signal) {
  const formData = new URLSearchParams({ itemcount: String(ids.length) });
  ids.forEach((id, index) => formData.append(`publishedfileids[${index}]`, id));
  const response = await requestSlots.run(() => axios.post(
    "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
    formData.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 5000, signal },
  ), signal).catch(() => null);
  signal?.throwIfAborted();

  const entries = new Map();
  const details = response?.data?.response?.publishedfiledetails;
  const requested = new Set(ids);
  if (!Array.isArray(details)) return entries;
  for (const item of details) {
    const id = String(item?.publishedfileid ?? "");
    if (!requested.has(id) || item.result !== 1) continue;
    const children = Array.isArray(item.children) ? item.children : [];
    const childIds = [...new Set(children.slice(0, MAX_CHILDREN)
      .filter(child => child?.publishedfileid)
      .map(child => String(child.publishedfileid)))];
    const entry = {
      title: item.title || `Mod ${id}`,
      childIds,
      truncated: children.length > MAX_CHILDREN,
      sizeBytes: parseFileSize(item.file_size),
      timestamp: Date.now(),
    };
    entries.set(id, entry);
    dependencyCache.delete(id);
    dependencyCache.set(id, entry);
  }
  while (dependencyCache.size > MAX_CACHE_ENTRIES) {
    dependencyCache.delete(dependencyCache.keys().next().value);
  }
  return entries;
}

async function fetchPublishedFileDetailsBatch(modIds, signal) {
  const entries = new Map();
  if (!Array.isArray(modIds)) return entries;
  signal?.throwIfAborted();
  const pending = new Set();
  const missing = [];
  const now = Date.now();
  for (const id of new Set(modIds.filter(Boolean).map(String))) {
    const cached = dependencyCache.get(id);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      entries.set(id, cached);
    } else if (!signal && inFlightRequests.has(id)) {
      pending.add(inFlightRequests.get(id));
    } else {
      missing.push(id);
    }
  }

  for (let index = 0; index < missing.length; index += BATCH_SIZE) {
    const chunk = missing.slice(index, index + BATCH_SIZE);
    const request = fetchChunk(chunk, signal);
    // Cancellable jobs own their HTTP requests. Download-size callers can share
    // uncancellable work without inheriting another caller's cancellation.
    if (!signal) {
      chunk.forEach(id => inFlightRequests.set(id, request));
      const release = () => {
        for (const id of chunk) {
          if (inFlightRequests.get(id) === request) inFlightRequests.delete(id);
        }
      };
      void request.then(release, release);
    }
    pending.add(request);
  }
  const requested = new Set(modIds.map(String));
  for (const batch of await Promise.all(pending)) {
    for (const [id, entry] of batch) {
      if (requested.has(id)) entries.set(id, entry);
    }
  }
  signal?.throwIfAborted();
  return entries;
}

async function getModDownloadSizes(modIds) {
  const ids = [...new Set(modIds.map(String))];
  const entries = await fetchPublishedFileDetailsBatch(ids);
  return ids.map(id => ({ id, sizeBytes: entries.get(id)?.sizeBytes ?? null }));
}

async function collectDependencies(roots, signal) {
  const graph = new Map();
  const queued = new Set(roots);
  let frontier = roots;
  for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth++) {
    const details = await fetchPublishedFileDetailsBatch(frontier, signal);
    const next = [];
    for (const id of frontier) {
      const entry = details.get(id);
      graph.set(id, entry);
      if (!entry || depth + 1 === MAX_DEPTH) continue;
      for (const childId of entry.childIds) {
        if (queued.has(childId) || queued.size >= MAX_GRAPH_NODES) continue;
        queued.add(childId);
        next.push(childId);
      }
    }
    frontier = next;
  }
  return graph;
}

async function resolveBatchDependencies(modIds, { signal } = {}) {
  if (!Array.isArray(modIds)) return [];
  const roots = [...new Set(modIds.map(String))].slice(0, MAX_GRAPH_NODES);
  const graph = await collectDependencies(roots, signal);
  let remaining = MAX_TREE_NODES - roots.length;

  function buildTree(id, depth, ancestors, expanded) {
    const entry = graph.get(id);
    if (ancestors.has(id)) return makeNode(id, entry?.title, [], { circular: true });
    if (depth >= MAX_DEPTH || !graph.has(id)) return makeNode(id, entry?.title, [], { truncated: true });
    if (!entry) return makeNode(id, null, [], { error: "Failed to fetch from Steam API" });
    if (expanded.has(id)) return makeNode(id, entry.title, [], { shared: true });

    const tree = makeNode(id, entry.title);
    ancestors.add(id);
    expanded.add(id);
    for (const childId of entry.childIds) {
      if (remaining === 0) {
        tree.truncated = true;
        break;
      }
      remaining--;
      tree.children.push(buildTree(childId, depth + 1, ancestors, expanded));
    }
    if (entry.truncated) tree.truncated = true;
    ancestors.delete(id);
    return tree;
  }

  return roots.map(id => buildTree(id, 0, new Set(), new Set()));
}

async function resolveDependencies(modId) {
  const [tree] = await resolveBatchDependencies([modId]);
  return tree;
}

function getFlatList(tree) {
  const list = [];
  const seen = new Set();
  function traverse(node) {
    if (!node || !node.id) return;
    if (!seen.has(node.id)) {
      seen.add(node.id);
      list.push({ id: node.id, name: node.name });
    }
    for (const child of node.children || []) {
      traverse(child);
    }
  }
  traverse(tree);
  return list;
}

module.exports = {
  resolveDependencies,
  resolveBatchDependencies,
  getFlatList,
  fetchPublishedFileDetailsBatch,
  getModDownloadSizes,
  _clearCache: () => {
    dependencyCache.clear();
    inFlightRequests.clear();
  },
};
