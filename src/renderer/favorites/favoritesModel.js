import { MAP_NAMES } from "../utils.js";
import { favoriteKey } from "../favoriteIdentity.js";

export const mapName = (raw) => raw ? MAP_NAMES[String(raw).toLowerCase()] || raw : "Unknown map";
export const fresh = (observation, now = Date.now()) => observation?.status === "online" && observation.completedAt && now - observation.completedAt <= 60000;
export function selectFavorites(entries, { search = "", group = "all", sort = "saved", history = [], observations = {}, now = Date.now() } = {}) {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const times = new Map(history.map((entry) => [favoriteKey(entry.ip, entry.port), entry.lastJoined]));
  const matching = entries.filter((entry) => {
    if (group === "ungrouped" && entry.groupId !== null) return false;
    if (!["all", "ungrouped"].includes(group) && entry.groupId !== group) return false;
    const text = [entry.label, entry.name, entry.ip, entry.port, entry.map, mapName(entry.map)].join(" ").toLowerCase();
    return terms.every((term) => text.includes(term));
  });
  const value = (entry) => {
    const observation = observations[entry.id];
    if (sort === "ping") return fresh(observation, now) && Number.isFinite(observation.ping) ? observation.ping : null;
    if (sort === "players") return fresh(observation, now) && Number.isInteger(observation.players) ? observation.players : null;
    if (sort === "lastUsed") return times.get(favoriteKey(entry.ip, entry.port)) || null;
    return null;
  };
  return matching.sort((a, b) => {
    if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
    let result = 0;
    if (sort === "name") result = (a.label || a.name || a.ip).localeCompare(b.label || b.name || b.ip, undefined, { sensitivity: "base", numeric: true });
    else if (["ping", "players", "lastUsed"].includes(sort)) {
      const av = value(a); const bv = value(b);
      if (av === null && bv !== null) return 1;
      if (bv === null && av !== null) return -1;
      if (av !== null && bv !== null) result = sort === "ping" ? av - bv : bv - av;
    }
    return result || a.addedOrder - b.addedOrder || a.id.localeCompare(b.id);
  });
}
export function availability(observation, now = Date.now()) {
  if (observation?.checking) return "Checking";
  if (!observation?.completedAt) return "Not checked";
  if (observation.status === "unreachable") return "Unreachable";
  return fresh(observation, now) ? "Online" : "Stale";
}
export function checkedText(observation, now = Date.now()) {
  if (!observation?.completedAt) return "Refresh to check";
  const seconds = Math.max(0, Math.floor((now - observation.completedAt) / 1000));
  return seconds < 60 ? `Checked ${seconds}s ago` : `Checked ${Math.floor(seconds / 60)}m ago`;
}
