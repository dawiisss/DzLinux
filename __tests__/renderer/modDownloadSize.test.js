/** @jest-environment jsdom */

jest.mock("../../src/renderer/feedback.js", () => ({ showToast: jest.fn() }));
jest.mock("../../src/renderer/modManager.js", () => ({ triggerSteamworksSync: jest.fn() }));
const { buildDetailRow } = require("../../src/renderer/serverRow.js");
const { createModSizeLabel } = require("../../src/renderer/modDownloadSize.js");
const { state } = require("../../src/renderer/state.js");

let server;
beforeEach(() => {
  document.body.innerHTML = "<table><tbody></tbody></table>";
  state.settings = {};
  state.localModsSet = new Set(["1"]);
  state.activeDownloads = new Map();
  state.expandedServerId = "server";
  server = { id: "server", modded: true, hasQueriedMods: true,
    mods: [{ id: "1", name: "Installed" }, { id: "2", name: "Missing" }, { id: "1", name: "Duplicate" }] };
  window.api = {
    mods: { getDownloadSizes: jest.fn().mockResolvedValue([
      { id: "1", sizeBytes: 500_000_000 }, { id: "2", sizeBytes: 2_000_000_000 },
    ]) },
    servers: { refreshModCache: jest.fn().mockResolvedValue([{ id: "3", name: "New mod" }]) },
  };
});
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function mount(favorites = false) {
  const row = buildDetailRow(server, favorites);
  document.querySelector("tbody").appendChild(row);
  return row;
}

test.each([false, true])("total sits immediately left of Refresh and updates without replacing the card (favorites=%s)", async favorites => {
  const row = mount(favorites);
  const label = row.querySelector(".mod-download-size");
  expect(label.nextElementSibling.textContent).toContain("Refresh");
  expect(label.textContent).toContain("Loading");
  await settle();
  expect(label.textContent).toBe("Total mod size: 2.50 GB");
  expect(label.title).toContain("including installed mods");
  expect(window.api.mods.getDownloadSizes).toHaveBeenCalledWith(["1", "2"]);
  expect(document.getElementById(row.id)).toBe(row);
});

test("partial Steam metadata is marked rather than displayed as a complete total", async () => {
  window.api.mods.getDownloadSizes.mockResolvedValue([{ id: "1", sizeBytes: 500_000_000 }]);
  const row = mount();
  await settle();
  expect(row.querySelector(".mod-download-size").textContent).toBe("Total mod size: ≥ 500.00 MB (partial)");
  expect(row.querySelector(".mod-download-size").title).toContain("1 of 2 mods");
});

test.each(["empty", "error"])("%s Steam results show unavailable instead of zero", async outcome => {
  if (outcome === "error") window.api.mods.getDownloadSizes.mockRejectedValue(new Error("Offline"));
  else window.api.mods.getDownloadSizes.mockResolvedValue([]);
  const row = mount();
  await settle();
  expect(row.querySelector(".mod-download-size").textContent).toBe("Total mod size: Unavailable");
  expect(row.textContent).toContain("Missing");
});

test("confirmed vanilla needs no lookup while unknown mod lists do not show zero", async () => {
  server.mods = [];
  expect(mount().querySelector(".mod-download-size").textContent).toBe("Total mod size: 0 B");
  server.hasQueriedMods = false;
  expect(createModSizeLabel(server).textContent).toBe("Total mod size: —");
  server.hasQueriedMods = true;
  server.modQueryFailed = true;
  expect(createModSizeLabel(server).textContent).toBe("Total mod size: —");
  await settle();
  expect(window.api.mods.getDownloadSizes).not.toHaveBeenCalled();
});

test("an old size response cannot overwrite the card after a manual mod refresh", async () => {
  let finishOld;
  window.api.mods.getDownloadSizes.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
    .mockResolvedValueOnce([{ id: "3", sizeBytes: 1_000_000 }]);
  const oldRow = mount();
  await settle();
  oldRow.querySelector(".btn-refresh-mods").click();
  await settle();
  finishOld([{ id: "1", sizeBytes: 999_000_000 }, { id: "2", sizeBytes: 999_000_000 }]);
  await settle();
  const row = document.getElementById("detail-server");
  expect(row).not.toBe(oldRow);
  expect(row.querySelector(".mod-download-size").textContent).toBe("Total mod size: 1.00 MB");
});
