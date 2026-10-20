import { MAP_NAMES } from "../utils.js";

export const recordId = (record) => record.id || record.ip + ":" + record.port;
export const mapName = (value) => {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw ? MAP_NAMES[raw.toLowerCase()] || raw : "Unknown map";
};
const knownTime = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;

export function formatExactTime(value) {
  return knownTime(value)
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value)
    : "Date unavailable";
}

export function formatRelativeTime(value, now = Date.now()) {
  if (!knownTime(value)) return "Date unavailable";
  const elapsed = now - value;
  if (elapsed < 0) return formatExactTime(value);
  if (elapsed < 60000) return "Just now";
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (elapsed < 3600000) return relative.format(-Math.floor(elapsed / 60000), "minute");
  if (elapsed < 86400000) {
    const previous = new Date(value);
    const today = new Date(now);
    if (previous.getDate() !== today.getDate() && elapsed >= 3600000) return "Yesterday";
    return relative.format(-Math.floor(elapsed / 3600000), "hour");
  }
  const date = new Date(value);
  const current = new Date(now);
  const calendarDays = Math.round((Date.UTC(current.getFullYear(), current.getMonth(), current.getDate()) -
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000);
  return relative.format(-calendarDays, "day");
}

export function filterAndSortHistory(records, { search = "", sort = "recent", date = "all" } = {}, now = Date.now()) {
  const query = search.trim().toLowerCase();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const cutoff = date === "today" ? midnight.getTime() : date === "week" ? now - 7 * 86400000 : null;
  return records.filter((record) => {
    if (cutoff !== null && (!knownTime(record.lastJoined) || record.lastJoined < cutoff || record.lastJoined > now)) return false;
    const terms = [record.name, record.ip + ":" + record.port, record.map, mapName(record.map)];
    return !query || terms.some((term) => String(term || "").toLowerCase().includes(query));
  }).sort((a, b) => {
    if (sort === "used" && (b.playCount || 0) !== (a.playCount || 0)) return (b.playCount || 0) - (a.playCount || 0);
    return (b.lastJoined || 0) - (a.lastJoined || 0) || recordId(a).localeCompare(recordId(b));
  });
}

export function getPeriodData(snapshots, range = "30d", now = Date.now()) {
  const length = range === "24h" ? 86400000 : range === "7d" ? 7 * 86400000 : 30 * 86400000;
  const entries = (Array.isArray(snapshots) ? snapshots : [])
    .filter((entry) => knownTime(entry.timestamp) && entry.timestamp >= now - length && entry.timestamp <= now)
    .sort((a, b) => b.timestamp - a.timestamp);
  const pings = entries.map((entry) => entry.ping).filter((value) =>
    typeof value === "number" && Number.isFinite(value) && value > 0);
  const populated = entries.filter((entry) => Number.isInteger(entry.players) && entry.players >= 0);
  const peak = populated.reduce((best, entry) => !best || entry.players > best.players ? entry : best, null);
  return {
    entries,
    attempts: entries.length,
    avgPing: pings.length ? Math.round(pings.reduce((sum, value) => sum + value, 0) / pings.length) : null,
    peakPlayers: peak?.players ?? null,
    peakCapacity: peak?.maxPlayers > 0 ? peak.maxPlayers : null,
  };
}
