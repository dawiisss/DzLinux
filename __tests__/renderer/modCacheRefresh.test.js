/** @jest-environment jsdom */

jest.mock("../../src/renderer/feedback.js", () => ({ showToast: jest.fn() }));
jest.mock("../../src/renderer/modManager.js", () => ({ triggerSteamworksSync: jest.fn() }));

const { state } = require("../../src/renderer/state.js");
const { buildDetailRow } = require("../../src/renderer/serverRow.js");
const { showToast } = require("../../src/renderer/feedback.js");

test.each([
  ["unreadable", "ENOENT"],
  ["unreadable", "EACCES"],
  ["partial", "EIO"],
  ["stale", "EACCES"],
])("%s local mods (%s) remain visible without claiming installation or blocking subscription", async (scanStatus, errorCode) => {
  const { refreshLocalModsCache } = jest.requireActual("../../src/renderer/modManager.js");
  const { triggerSteamworksSync } = require("../../src/renderer/modManager.js");
  triggerSteamworksSync.mockClear();
  state.settings = { modDirectory: "/mods" };
  state.modScanSnapshot = null;
  state.activeDownloads = new Map();
  const mods = [{ id: "123", name: "Uncertain mod", scanStatus: scanStatus === "stale" ? "complete" : scanStatus, errorCode },
    { id: "456", name: "Healthy mod", scanStatus: "complete" }];
  const snapshot = { root: "/mods", status: "partial", mods, sizeComplete: false };
  window.api = { mods: { scan: jest.fn().mockResolvedValue(snapshot) } };
  await refreshLocalModsCache();
  if (scanStatus === "stale") {
    window.api.mods.scan.mockResolvedValue({ ...snapshot, status: "unavailable", reason: "permission-denied", mods: [] });
    await refreshLocalModsCache();
  }
  expect(state.localMods).toHaveLength(2);
  expect(state.localModsSet.has("123")).toBe(false);
  expect(state.localModsSet.has("456")).toBe(scanStatus !== "stale");
  const row = buildDetailRow({ id: "test", mods });
  const pill = row.querySelector(".mod-pill");
  expect(pill.classList.contains("installed")).toBe(false);
  expect(pill.textContent).toContain("Unverified");
  expect(pill.querySelector('app-icon[name="check"]')).toBeNull();
  pill.querySelector('button[aria-label="Subscribe and Download"]').click();
  expect(triggerSteamworksSync).toHaveBeenCalledWith("123", "Uncertain mod", expect.any(HTMLElement));
  expect(row.querySelector('button[title="Subscribe to all missing mods"]')).not.toBeNull();
});

test("dependency states use accessible registered status icons", () => {
  const { buildDependencyTree } = jest.requireActual("../../src/renderer/modManager.js");
  const container = document.createElement("div");
  buildDependencyTree(container, { id: "root", children: [
    { id: "installed" }, { id: "missing" }, { id: "error", error: "API unavailable" },
    { id: "truncated", truncated: true }, { id: "circular", circular: true },
  ] }, "", new Set(["installed"]));
  expect(Array.from(container.querySelectorAll("app-icon")).map((icon) => icon.getAttribute("name")))
    .toEqual(["check", "x", "alert", "alert", "refresh"]);
  expect(Array.from(container.querySelectorAll("app-icon")).every((icon) => icon.getAttribute("aria-label"))).toBe(true);
  expect(container.textContent).not.toMatch(/[✓✗⚠↻]/u);
});

test("a failed explicit refresh preserves visible mods and reports failure", async () => {
  state.settings = {};
  state.localModsSet = new Set(["123"]);
  state.activeDownloads = new Map();
  const server = { id: "test", ip: "1.2.3.4", port: 2302, mods: [{ id: "123", name: "Existing mod" }] };
  window.api = { servers: { refreshModCache: jest.fn().mockResolvedValue(null) } };
  const row = buildDetailRow(server);
  const button = row.querySelector(".btn-refresh-mods");
  button.click();
  await Promise.resolve();
  expect(server.mods).toEqual([{ id: "123", name: "Existing mod" }]);
  expect(row.textContent).toContain("Existing mod");
  expect(button.disabled).toBe(false);
  expect(showToast).toHaveBeenCalledWith("Failed to refresh mods", "#ff5a5f", "alert");
});

test("a successful empty refresh displays a vanilla result instead of a query failure", async () => {
  state.settings = {};
  state.expandedServerId = "test";
  const server = { id: "test", ip: "1.2.3.4", port: 2302, modded: true, mods: [{ id: "123", name: "Old mod" }] };
  window.api = { servers: { refreshModCache: jest.fn().mockResolvedValue([]) } };
  document.body.innerHTML = '<table><tbody id="details"></tbody></table>';
  const row = buildDetailRow(server);
  document.getElementById("details").appendChild(row);
  row.querySelector(".btn-refresh-mods").click();
  await Promise.resolve();
  expect(server.mods).toEqual([]);
  expect(document.getElementById("details").textContent).toContain("No workshop mods detected");
  expect(document.getElementById("details").textContent).not.toContain("Unable to fetch");
});

test("renderer local mod cache ignores late old-root scans and retains stale same-root mods on transient root error (R05, R06)", async () => {
  const realModManager = jest.requireActual("../../src/renderer/modManager.js");
  state.settings = { modDirectory: "/root-a" };
  state.localMods = [];
  state.localModsSet = new Set();
  state.modScanSnapshot = null;

  let resolveOldScan;
  window.api = {
    mods: {
      scan: jest
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveOldScan = resolve;
            }),
        )
        .mockResolvedValueOnce({
          scanId: 2,
          root: "/root-b",
          status: "complete",
          reason: null,
          mods: [{ id: "222", name: "Beta", sizeMB: 100, sizeBytes: 100 * 1024 * 1024, scanStatus: "complete", isCorrupted: false }],
          totalSizeBytes: 100 * 1024 * 1024,
          sizeComplete: true,
        })
        .mockResolvedValueOnce({
          scanId: 3,
          root: "/root-b",
          status: "unavailable",
          reason: "permission-denied",
          mods: [],
          totalSizeBytes: 0,
          sizeComplete: false,
        }),
    },
  };

  const scanA = realModManager.refreshLocalModsCache();
  state.settings.modDirectory = "/root-b";
  await realModManager.refreshLocalModsCache();

  resolveOldScan({
    scanId: 1,
    root: "/root-a",
    status: "complete",
    reason: null,
    mods: [{ id: "111", name: "Alpha", sizeMB: 50, scanStatus: "complete", isCorrupted: false }],
    totalSizeBytes: 50 * 1024 * 1024,
    sizeComplete: true,
  });
  await scanA;

  expect(state.localMods.map((m) => m.id)).toEqual(["222"]);
  expect(state.localModsSet.has("111")).toBe(false);

  // Transient permission failure on same root retains useful mods and marks snapshot stale
  const afterFailure = await realModManager.refreshLocalModsCache();
  expect(afterFailure.stale).toBe(true);
  expect(state.localMods.map((m) => m.id)).toEqual(["222"]);
});

test.each(["complete", "rejected"])("a %s scan from a cleared root cannot update the installed-mod cache", async (outcome) => {
  const { refreshLocalModsCache } = jest.requireActual("../../src/renderer/modManager.js");
  state.settings = { modDirectory: "/old-root" };
  state.localMods = [];
  state.localModsSet = new Set();
  state.modScanSnapshot = null;
  let resolveScan;
  let rejectScan;
  window.api = { mods: { scan: jest.fn(() => new Promise((resolve, reject) => {
    resolveScan = resolve;
    rejectScan = reject;
  })) } };
  const pending = refreshLocalModsCache();
  state.settings.modDirectory = "";
  if (outcome === "rejected") rejectScan(new Error("old scan failed"));
  else resolveScan({ root: "/old-root", status: "complete", mods: [{ id: "123" }], sizeComplete: true, totalSizeBytes: 100 });
  await pending;
  expect(state.modScanSnapshot).toBeNull();
  expect(state.localMods).toEqual([]);
  expect(state.localModsSet.size).toBe(0);
});

test.each(["complete", "rejected", "cancelled"])("a superseded same-root %s scan cannot change state while its replacement is pending", async (outcome) => {
  const { refreshLocalModsCache } = jest.requireActual("../../src/renderer/modManager.js");
  state.settings = { modDirectory: "/mods" };
  state.localMods = [{ id: "retained" }];
  state.localModsSet = new Set(["retained"]);
  const snapshot = { root: "/mods", status: "complete", mods: state.localMods, sizeComplete: true };
  state.modScanSnapshot = snapshot;
  let finishOld;
  let failOld;
  let finishNew;
  window.api = { mods: { scan: jest.fn()
    .mockImplementationOnce(() => new Promise((resolve, reject) => { finishOld = resolve; failOld = reject; }))
    .mockImplementationOnce(() => new Promise((resolve) => { finishNew = resolve; })) } };
  const oldRun = refreshLocalModsCache();
  const newRun = refreshLocalModsCache({ force: true });
  if (outcome === "rejected") failOld(new Error("old failure"));
  else finishOld({ ...snapshot, status: outcome, mods: [{ id: "obsolete" }] });
  await oldRun;
  expect(state.modScanSnapshot).toBe(snapshot);
  expect([...state.localModsSet]).toEqual(["retained"]);

  finishNew({ ...snapshot, mods: [{ id: "current" }] });
  await newRun;
  expect([...state.localModsSet]).toEqual(["current"]);
});
