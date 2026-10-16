/** @jest-environment jsdom */

jest.mock("../../src/renderer/feedback.js", () => ({ showToast: jest.fn() }));
jest.mock("../../src/renderer/modManager.js", () => ({ triggerSteamworksSync: jest.fn() }));

const { state } = require("../../src/renderer/state.js");
const { buildDetailRow } = require("../../src/renderer/serverRow.js");
const { showToast } = require("../../src/renderer/feedback.js");

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
