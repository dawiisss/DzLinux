const axios = require("axios");

const dependencyCache = new Map();
const inFlightRequests = new Map();
const MAX_DEPTH = 5;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 1000;

async function asyncPool(concurrency, iterable, iteratorFn) {
  const ret = [];
  const executing = new Set();
  for (const item of iterable) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(ret);
}

function makeNode(modId, name, children, flags = {}) {
  return {
    id: modId,
    name: name || `Mod ${modId}`,
    children: children || [],
    ...flags,
  };
}

async function fetchPublishedFileDetailsBatch(modIds) {
  if (!modIds || !Array.isArray(modIds) || modIds.length === 0) return;

  const now = Date.now();
  const toFetch = [];
  const toWait = [];

  for (const rawId of modIds) {
    if (!rawId) continue;
    const modId = String(rawId);
    const cached = dependencyCache.get(modId);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      continue;
    }
    if (inFlightRequests.has(modId)) {
      toWait.push(inFlightRequests.get(modId));
    } else {
      toFetch.push(modId);
    }
  }

  const uniqueToFetch = Array.from(new Set(toFetch));

  if (uniqueToFetch.length > 0) {
    let resolveBatch;
    const batchPromise = new Promise((resolve) => {
      resolveBatch = resolve;
    });

    uniqueToFetch.forEach((id) => inFlightRequests.set(id, batchPromise));

    const fetchWork = async () => {
      try {
        const chunkSize = 50;
        for (let i = 0; i < uniqueToFetch.length; i += chunkSize) {
          const chunk = uniqueToFetch.slice(i, i + chunkSize);
          const formData = new URLSearchParams();
          formData.append("itemcount", chunk.length.toString());
          chunk.forEach((id, index) => {
            formData.append(`publishedfileids[${index}]`, id);
          });

          try {
            const response = await axios.post(
              "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
              formData.toString(),
              {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                timeout: 5000,
              },
            );

            const detailsList = response.data?.response?.publishedfiledetails;
            if (Array.isArray(detailsList)) {
              for (let idx = 0; idx < detailsList.length; idx++) {
                const details = detailsList[idx];
                if (!details) continue;

                const matchedChunkId = chunk.find(
                  (id) => String(id) === String(details.publishedfileid),
                );
                const primaryId =
                  matchedChunkId ||
                  (details.publishedfileid
                    ? String(details.publishedfileid)
                    : chunk[idx]);

                if (details.result === 1) {
                  const childIds = Array.isArray(details.children)
                    ? details.children
                        .filter((c) => c && c.publishedfileid)
                        .map((c) => String(c.publishedfileid))
                    : [];
                  const entry = {
                    title: details.title || `Mod ${primaryId}`,
                    childIds,
                    timestamp: Date.now(),
                  };
                  if (primaryId) dependencyCache.set(primaryId, entry);
                  if (details.publishedfileid) {
                    dependencyCache.set(String(details.publishedfileid), entry);
                  }
                }
              }
            }
          } catch {
            // Ignore network errors
          }
        }
      } finally {
        uniqueToFetch.forEach((id) => inFlightRequests.delete(id));
        resolveBatch();
      }
    };

    toWait.push(fetchWork());
  }

  await Promise.all(toWait);

  if (dependencyCache.size > MAX_CACHE_ENTRIES) {
    const target = Math.floor(MAX_CACHE_ENTRIES * 0.9);
    const iter = dependencyCache.keys();
    while (dependencyCache.size > target) {
      dependencyCache.delete(iter.next().value);
    }
  }
}

async function resolveDependencies(modId, depth = 0, visited = new Set()) {
  const idStr = String(modId);

  if (depth >= MAX_DEPTH) {
    return makeNode(idStr, `Mod ${idStr} (max depth)`, [], { truncated: true });
  }

  if (visited.has(idStr)) {
    return makeNode(idStr, `Mod ${idStr} (circular)`, [], { circular: true });
  }
  visited.add(idStr);

  let cached = dependencyCache.get(idStr);
  if (!cached || Date.now() - cached.timestamp >= CACHE_TTL_MS) {
    await fetchPublishedFileDetailsBatch([idStr]);
    cached = dependencyCache.get(idStr);
  }

  if (!cached) {
    return makeNode(idStr, `Mod ${idStr}`, [], {
      error: "Failed to fetch from Steam API",
    });
  }

  const result = makeNode(idStr, cached.title);

  if (cached.childIds && cached.childIds.length > 0) {
    await fetchPublishedFileDetailsBatch(cached.childIds);

    const childResults = await asyncPool(4, cached.childIds, (childId) =>
      resolveDependencies(childId, depth + 1, new Set(visited)),
    );
    result.children = childResults.filter((c) => c && c.id);
  }

  return result;
}

async function resolveBatchDependencies(modIds) {
  if (!modIds || !Array.isArray(modIds)) return [];
  await fetchPublishedFileDetailsBatch(modIds);
  return await asyncPool(4, modIds, (id) => resolveDependencies(id));
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
  _clearCache: () => {
    dependencyCache.clear();
    inFlightRequests.clear();
  },
};
