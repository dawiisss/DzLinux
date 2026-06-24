const axios = require("axios");

const dependencyCache = new Map();
const MAX_DEPTH = 5;

function makeNode(modId, name, children, flags = {}) {
  return {
    id: modId,
    name: name || `Mod ${modId}`,
    children: children || [],
    ...flags,
  };
}

/**
 * Resolves the Steam Workshop dependency tree for a given mod ID.
 *
 * @remarks
 * This function recursively queries the Steam Web API to build a tree of dependencies.
 * It includes safeguards against infinite recursion caused by circular dependencies
 * (e.g., Mod A requires Mod B, which requires Mod A) by tracking visited nodes,
 * and imposes a maximum depth limit to prevent stack overflows and excessive API calls.
 * Results are heavily cached to improve performance across batch resolutions.
 *
 * @param {string} modId - The Steam Workshop published file ID of the root mod.
 * @param {number} [depth=0] - Current recursion depth (used internally, should not be passed by caller).
 * @param {Set<string>} [visited=new Set()] - Set of previously visited mod IDs to detect circular references (internal use).
 * @returns {Promise<Object>} A tree structure containing the mod and its resolved children.
 *
 * @example
 * const tree = await resolveDependencies('1559212036');
 * // Returns: { id: '1559212036', name: 'CF', children: [...] }
 */
async function resolveDependencies(modId, depth = 0, visited = new Set()) {
  if (depth >= MAX_DEPTH) {
    return makeNode(modId, `Mod ${modId} (max depth)`, [], { truncated: true });
  }

  if (visited.has(modId)) {
    return makeNode(modId, `Mod ${modId} (circular)`, [], { circular: true });
  }
  visited.add(modId);

  const cacheKey = `${modId}:${depth}`;
  const cached = dependencyCache.get(cacheKey);
  if (cached && !cached.error && !cached.truncated) return cached;

  const result = makeNode(modId);

  try {
    const formData = new URLSearchParams();
    formData.append("itemcount", "1");
    formData.append("publishedfileids[0]", modId);

    const response = await axios.post(
      "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
      formData.toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 5000,
      },
    );

    const details = response.data?.response?.publishedfiledetails?.[0];
    if (!details || details.result !== 1) {
      result.error = "Failed to fetch from Steam API";
      result.name = `Mod ${modId}`;
      // Don't cache error results permanently
      return result;
    }

    result.name = details.title || `Mod ${modId}`;

    if (details.children && Array.isArray(details.children)) {
      const childIds = details.children
        .filter((c) => c.publishedfileid)
        .map((c) => c.publishedfileid.toString());

      const childPromises = childIds.map((childId) =>
        resolveDependencies(childId, depth + 1, new Set(visited)),
      );

      const childResults = await Promise.all(childPromises);
      result.children = childResults.filter((c) => c && c.id);
    }
  } catch (e) {
    result.name = `Mod ${modId}`;
    result.error = e.message;
    // Don't cache transient errors
    return result;
  }

  // Cache successful results with depth to handle different truncation levels
  dependencyCache.set(cacheKey, result);
  // Also cache at depth 0 for top-level lookups
  if (depth === 0) {
    dependencyCache.set(`${modId}:0`, result);
  }
  return result;
}

async function resolveBatchDependencies(modIds) {
  const promises = modIds.map((id) => resolveDependencies(id));
  return await Promise.all(promises);
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
};
