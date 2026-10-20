const { filterAndSortHistory, mapName, formatRelativeTime, formatExactTime, getPeriodData } = require("../../src/renderer/history/historyModel");
const now = new Date(2026, 9, 18, 12).getTime();
const a = { id: "a", ip: "one.example.com", port: 2302, name: "Alpha", map: "enoch", lastJoined: now, playCount: 1 };
const b = { id: "b", ip: "two.example.com", port: 2302, name: "Beta", map: "chernarusplus", lastJoined: now - 2 * 86400000, playCount: 3 };

test("searches readable map names and addresses, but never old notes", () => {
  expect(mapName("enoch")).toBe("Livonia");
  expect(mapName("my_custom_map")).toBe("my_custom_map");
  expect(mapName(null)).toBe("Unknown map");
  expect(filterAndSortHistory([a, b], { search: "LIVONIA" }, now)).toEqual([a]);
  expect(filterAndSortHistory([a, b], { search: "ONE.EXAMPLE" }, now)).toEqual([a]);
  expect(filterAndSortHistory([{ ...a, customNote: "hidden secret" }], { search: "secret" }, now)).toEqual([]);
});

test("sorts without mutating records and resolves ties predictably", () => {
  const original = [b, a];
  expect(filterAndSortHistory(original, { sort: "recent" }, now)).toEqual([a, b]);
  expect(filterAndSortHistory(original, { sort: "used" }, now)).toEqual([b, a]);
  expect(original).toEqual([b, a]);
  expect(filterAndSortHistory([{ ...a, id: "z" }, { ...a, id: "c" }], {}, now).map(r => r.id)).toEqual(["c", "z"]);
});

test("last-use filters handle local midnight, rolling weeks, and unknown dates", () => {
  const midnight = new Date(2026, 9, 18).getTime();
  const entries = [a, b, { ...a, id: "old", lastJoined: now - 8 * 86400000 }, { ...a, id: "unknown", lastJoined: null }];
  expect(filterAndSortHistory(entries, { date: "today" }, now)).toEqual([a]);
  expect(filterAndSortHistory(entries, { date: "week" }, now)).toEqual([a, b]);
  expect(filterAndSortHistory([{ ...a, lastJoined: midnight - 1 }], { date: "today" }, now)).toEqual([]);
  expect(filterAndSortHistory(entries, {}, now)).toHaveLength(4);
});

test("relative dates have exact accessible equivalents and tolerate unknown dates", () => {
  expect(formatRelativeTime(now - 1000, now)).toBe("Just now");
  expect(formatRelativeTime(now - 2 * 3600000, now)).toMatch(/2 hours/);
  expect(formatRelativeTime(now - 86400000, now)).toMatch(/yesterday/i);
  expect(formatRelativeTime(null, now)).toBe("Date unavailable");
  expect(formatExactTime(now)).not.toBe("Date unavailable");
});

test("period statistics exclude old/future data and keep unknown measurements unknown", () => {
  const data = [
    { timestamp: now - 1000, ping: 20, players: 0, maxPlayers: 60 },
    { timestamp: now - 2000, ping: 40, players: 10, maxPlayers: 80 },
    { timestamp: now - 3000, ping: null, players: null },
    { timestamp: now - 2 * 86400000, ping: 999, players: 999 },
    { timestamp: now + 1, ping: 999, players: 999 },
  ];
  expect(getPeriodData(data, "24h", now)).toMatchObject({ attempts: 3, avgPing: 30, peakPlayers: 10, peakCapacity: 80 });
  expect(getPeriodData([{ timestamp: now, ping: null, players: null }], "24h", now))
    .toMatchObject({ attempts: 1, avgPing: null, peakPlayers: null });
  expect(getPeriodData(data.slice(3), "24h", now)).toMatchObject({ attempts: 0, avgPing: null, peakPlayers: null });
});
