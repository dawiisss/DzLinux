const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const mockTestDir = path.join(os.tmpdir(), `test-dzlinux-history-${process.pid}`);
const historyFile = path.join(mockTestDir, "history.json");

jest.mock(
  "electron",
  () => {
    const mApp = {
      getPath: jest.fn().mockReturnValue(mockTestDir),
    };
    return { app: mApp };
  },
  { virtual: true },
);

const historyManager = require("../../src/main/history");

describe("History Manager (Unit Tests)", () => {
  beforeEach(async () => {
    await fs.promises.mkdir(mockTestDir, { recursive: true }).catch(() => {});
    await fs.promises.rm(historyFile, { force: true }).catch(() => {});
    await historyManager.clearAllHistory();
  });

  afterEach(async () => {
    await fs.promises.rm(historyFile, { force: true }).catch(() => {});
  });

  test("recordConnection creates new history record and snapshot", async () => {
    const server = {
      ip: "127.0.0.1",
      port: 2302,
      name: "Test Server",
      map: "Chernarus",
      ping: 42,
      players: 20,
      maxPlayers: 60,
    };

    const rec = await historyManager.recordConnection(server);

    expect(rec).toBeDefined();
    expect(rec.id).toBe("127.0.0.1:2302");
    expect(rec.playCount).toBe(1);
    expect(rec.lastPing).toBe(42);
    expect(rec.lastPlayers).toBe(20);
    expect(rec.snapshots).toHaveLength(1);
    expect(rec.snapshots[0].ping).toBe(42);
  });

  test("recordConnection increments playCount and updates latest stats on re-join", async () => {
    const server = { ip: "127.0.0.1", port: 2302, name: "Test Server 1" };
    await historyManager.recordConnection(server);

    const reJoinServer = {
      ip: "127.0.0.1",
      port: 2302,
      name: "Test Server Updated",
      ping: 25,
      players: 45,
    };
    const updated = await historyManager.recordConnection(reJoinServer);

    expect(updated.playCount).toBe(2);
    expect(updated.name).toBe("Test Server Updated");
    expect(updated.lastPing).toBe(25);
    expect(updated.lastPlayers).toBe(45);
    expect(updated.snapshots).toHaveLength(2);
  });

  test("saveServerNote updates custom note", async () => {
    const server = { ip: "10.0.0.1", port: 2302, name: "Note Test Server" };
    await historyManager.recordConnection(server);

    const updated = await historyManager.saveServerNote(
      "10.0.0.1:2302",
      "Favorite PVP zone",
    );

    expect(updated).toBeDefined();
    expect(updated.customNote).toBe("Favorite PVP zone");

    const analytics = await historyManager.getAnalytics("10.0.0.1:2302");
    expect(analytics.customNote).toBe("Favorite PVP zone");
  });

  test("deleteHistoryRecord removes specific entry", async () => {
    await historyManager.recordConnection({ ip: "1.1.1.1", port: 2302 });
    await historyManager.recordConnection({ ip: "2.2.2.2", port: 2302 });

    let records = await historyManager.getHistoryRecords();
    expect(records).toHaveLength(2);

    await historyManager.deleteHistoryRecord("1.1.1.1:2302");
    records = await historyManager.getHistoryRecords();

    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("2.2.2.2:2302");
  });

  test("clearAllHistory wipes all history records", async () => {
    await historyManager.recordConnection({ ip: "1.1.1.1", port: 2302 });
    await historyManager.recordConnection({ ip: "2.2.2.2", port: 2302 });

    await historyManager.clearAllHistory();
    const records = await historyManager.getHistoryRecords();
    expect(records).toHaveLength(0);
  });
});
