const { sanitizeHistoryPayload } = require("../../src/main/validation");
describe("History IPC payloads", () => {
  const address = { ip: "127.0.0.1", port: 2302 };
  test("strips unknown fields and renderer supplied timestamps or note text", () => {
    expect(sanitizeHistoryPayload({ ...address, name: "A", customNote: "Hidden", timestamp: 123, snapshots: [] }))
      .toEqual({ ...address, name: "A" });
  });
  test.each([
    { name: "x".repeat(201) }, { map: {} }, { ping: Infinity }, { players: -1 },
    { queryPort: 99999 }, { port: true }, { queryPort: false }, { updateOnly: true }, { activityId: "bad" }, { updateOnly: "yes" },
  ])("rejects malformed metadata: %j", (extra) => {
    expect(sanitizeHistoryPayload({ ...address, ...extra })).toBeNull();
  });
});
describe("History handler registration", () => {
  test("serves summaries and removes the note write surface", async () => {
    jest.resetModules();
    const handlers = new Map();
    const manager = { getHistorySummaries: jest.fn().mockResolvedValue([]) };
    jest.doMock("electron", () => ({ ipcMain: { handle: (name, fn) => handlers.set(name, fn) } }), { virtual: true });
    jest.doMock("../../src/main/history", () => manager);
    require("../../src/main/ipc/historyHandlers").registerHistoryHandlers();
    expect(handlers.has("history:save-note")).toBe(false);
    await handlers.get("history:get")();
    expect(manager.getHistorySummaries).toHaveBeenCalled();
  });
});
