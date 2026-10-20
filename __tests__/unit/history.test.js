const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
let mockTestDir;
jest.mock("electron", () => ({ app: { getPath: () => mockTestDir } }), { virtual: true });
jest.mock("../../src/main/settings", () => ({
  loadSettingsAsync: jest.fn().mockResolvedValue({ enableHistory: true, showHistoryTab: true }),
}));
let historyManager;
let now;
const server = { ip: "127.0.0.1", port: 2302, name: "Test Server", map: "enoch", ping: 42, players: 20, maxPlayers: 60 };
const file = () => path.join(mockTestDir, "history.json");

beforeEach(async () => {
  jest.resetModules();
  now = 1792324800000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  mockTestDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dzlinux-history-test-"));
  historyManager = require("../../src/main/history");
});
afterEach(async () => {
  jest.restoreAllMocks();
  await fs.promises.rm(mockTestDir, { recursive: true, force: true });
});

test("creates a snapshot with a main-generated ID and returns independent DTOs", async () => {
  const record = await historyManager.recordConnection(server);
  expect(record.playCount).toBe(1);
  expect(record.lastActivityId).toMatch(/^[0-9a-f-]{36}$/);
  expect(record.snapshots[0]).toMatchObject({ map: "enoch", ping: 42, source: "connect-attempt" });
  record.snapshots[0].ping = 999;
  expect((await historyManager.getAnalytics(record.id)).snapshots[0].ping).toBe(42);
  expect((await historyManager.getHistorySummaries())[0]).not.toHaveProperty("snapshots");
});

test("keeps the existing rapid-repeat deduplication and counts later attempts", async () => {
  const first = await historyManager.recordConnection(server);
  now += 1000;
  const rapid = await historyManager.recordConnection({ ...server, ping: 20 });
  expect(rapid.playCount).toBe(1);
  expect(rapid.lastActivityId).toBe(first.lastActivityId);
  now += 16000;
  const later = await historyManager.recordConnection(server);
  expect(later.playCount).toBe(2);
  expect(later.snapshots).toHaveLength(2);
  expect(later.lastActivityId).not.toBe(first.lastActivityId);
});

test.each(["clear", "delete"])("a delayed enrichment cannot resurrect history after %s", async (action) => {
  const first = await historyManager.recordConnection(server);
  if (action === "clear") await historyManager.clearAllHistory();
  else await historyManager.deleteHistoryRecord(first.id);
  const updated = await historyManager.recordConnection({ ...server, updateOnly: true, activityId: first.lastActivityId });
  expect(updated).toBeNull();
  expect(await historyManager.getHistoryRecords()).toEqual([]);
});

test("old activity enrichment cannot overwrite the latest attempt", async () => {
  const first = await historyManager.recordConnection(server);
  now += 16000;
  const second = await historyManager.recordConnection({ ...server, ping: 30, map: "namalsk" });
  const updated = await historyManager.recordConnection({
    ...server, ping: 99, updateOnly: true, activityId: first.lastActivityId,
  });
  expect(updated.lastPing).toBe(30);
  expect(updated.map).toBe("namalsk");
  expect(updated.lastActivityId).toBe(second.lastActivityId);
  expect(updated.snapshots[0].ping).toBe(99);
});

test("enrichment requires an activity ID and never counts a new attempt", async () => {
  const first = await historyManager.recordConnection(server);
  expect(await historyManager.recordConnection({ ...server, updateOnly: true })).toBeNull();
  const updated = await historyManager.recordConnection({
    ...server, ping: 18, updateOnly: true, activityId: first.lastActivityId,
  });
  expect(updated.playCount).toBe(1);
  expect(updated.snapshots).toHaveLength(1);
  expect(updated.lastPing).toBe(18);
});

test("migrates existing snapshots without losing counts or stored note text", async () => {
  await fs.promises.writeFile(file(), JSON.stringify({ records: [{
    ...server, id: "127.0.0.1:2302", lastJoined: now, playCount: 10, customNote: "Old note",
    snapshots: [{ timestamp: now, ping: 30, players: 10, maxPlayers: 60 }],
  }] }));
  const record = (await historyManager.getHistoryRecords())[0];
  expect(record.playCount).toBe(10);
  expect(record.snapshots).toHaveLength(1);
  expect(record.snapshots[0].map).toBe("");
  expect(record).not.toHaveProperty("customNote");
  expect(await historyManager.getAnalytics(record.id)).not.toHaveProperty("customNote");
  expect(historyManager.saveServerNote).toBeUndefined();
  const stored = JSON.parse(await fs.promises.readFile(file(), "utf8"));
  expect(stored.schemaVersion).toBe(2);
  expect(stored.records[0].customNote).toBe("Old note");
  jest.resetModules();
  historyManager = require("../../src/main/history");
  expect((await historyManager.getAnalytics(record.id)).snapshots[0].id).toBe(record.snapshots[0].id);
});

test("imports old server bookmarks without inventing timestamps or attempts", async () => {
  await fs.promises.writeFile(path.join(mockTestDir, "settings.json"), JSON.stringify({
    history: [{ ip: server.ip, port: server.port, name: server.name }],
  }));
  const record = (await historyManager.getHistoryRecords())[0];
  expect(record.lastJoined).toBeNull();
  expect(record.playCount).toBe(0);
  expect(record.snapshots).toEqual([]);
  expect(record.importedAt).toBe(now);
});

test("preserves malformed history and allows a later retry after repair", async () => {
  await fs.promises.writeFile(file(), "{broken");
  await expect(historyManager.loadHistory()).rejects.toThrow();
  expect(await fs.promises.readFile(file(), "utf8")).toBe("{broken");
  await fs.promises.writeFile(file(), JSON.stringify({ records: [] }));
  expect(await historyManager.getHistoryRecords()).toEqual([]);
});

test("serializes cold-start records and clear in invocation order", async () => {
  const pending = [historyManager.recordConnection(server), historyManager.recordConnection({ ...server, ip: "127.0.0.2" })];
  pending.push(historyManager.clearAllHistory());
  await Promise.all(pending);
  expect(await historyManager.getHistoryRecords()).toEqual([]);
});

test("a failed write does not commit in memory and the next mutation succeeds", async () => {
  await historyManager.loadHistory();
  const rename = jest.spyOn(fs.promises, "rename").mockRejectedValueOnce(new Error("Disk full"));
  await expect(historyManager.recordConnection(server)).rejects.toThrow("Disk full");
  expect(await historyManager.getHistoryRecords()).toEqual([]);
  rename.mockRestore();
  expect((await historyManager.recordConnection(server)).playCount).toBe(1);
});

test("prunes expired history on reads in a long-running app", async () => {
  await historyManager.recordConnection(server);
  now += 31 * 24 * 60 * 60 * 1000;
  expect(await historyManager.getHistorySummaries()).toEqual([]);
});

test("enforces record and snapshot caps while retaining aggregate counts", async () => {
  const records = Array.from({ length: 501 }, (_, i) => ({
    ip: "server" + i + ".example.com", port: 2302, lastJoined: now - i,
    playCount: 900,
    snapshots: i === 0 ? Array.from({ length: 205 }, (_, n) => ({
      timestamp: now - n * 1000, ping: 40,
    })) : [],
  }));
  await fs.promises.writeFile(file(), JSON.stringify({ records }));
  const all = await historyManager.getHistoryRecords();
  expect(all).toHaveLength(500);
  expect(all[0].snapshots).toHaveLength(200);
  expect(all[0].playCount).toBe(900);
});

test("keeps unknown measurements unknown and honors tracking settings", async () => {
  const record = await historyManager.recordConnection({ ip: server.ip, port: server.port });
  expect(record.map).toBe("");
  expect(record.snapshots[0]).toMatchObject({ ping: null, players: null, maxPlayers: null });
  require("../../src/main/settings").loadSettingsAsync.mockResolvedValue({ enableHistory: false });
  now += 16000;
  expect(await historyManager.recordConnection(server)).toBeNull();
  expect((await historyManager.getHistoryRecords())[0].playCount).toBe(1);
});
