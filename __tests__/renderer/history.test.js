/** @jest-environment jsdom */
const fs = require("node:fs/promises");
const path = require("node:path");
jest.mock("../../src/renderer/feedback", () => ({
  showToast: jest.fn(), showConfirmModal: jest.fn(), copyToClipboard: jest.fn(),
}));
jest.mock("../../src/renderer/serverBrowser/serverBrowserTable", () => ({
  connectToServer: jest.fn().mockResolvedValue(), cancelPendingConnection: jest.fn(),
}));
jest.mock("../../src/renderer/history/historyDetails", () => ({
  createHistoryDetails: jest.fn(() => ({
    element: globalThis.document.createElement("section"), load: jest.fn().mockResolvedValue(), destroy: jest.fn(),
  })),
}));
const { initHistoryManager, loadAndRenderHistory } = require("../../src/renderer/history");
const { state } = require("../../src/renderer/state");
const { connectToServer, cancelPendingConnection } = require("../../src/renderer/serverBrowser/serverBrowserTable");
const { createHistoryDetails } = require("../../src/renderer/history/historyDetails");
const { showConfirmModal } = require("../../src/renderer/feedback");
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
let markup;
let dispose;
let now;
let fixture;
beforeAll(async () => {
  const html = await fs.readFile(path.join(__dirname, "../../src/index.html"), "utf8");
  markup = html.slice(html.indexOf("      <!-- HISTORY TAB -->"), html.indexOf("      <!-- DIAGNOSTICS TAB -->"));
});
beforeEach(async () => {
  jest.clearAllMocks();
  now = new Date(2026, 9, 18, 12).getTime();
  jest.spyOn(Date, "now").mockReturnValue(now);
  fixture = [
    { id: "1.2.3.4:2302", ip: "1.2.3.4", port: 2302, queryPort: 27016, name: "Alpha", map: "enoch", lastJoined: now, playCount: 1 },
    { id: "2.3.4.5:2302", ip: "2.3.4.5", port: 2302, name: "Beta", map: "namalsk", lastJoined: now - 2 * 86400000, playCount: 9 },
  ];
  document.body.innerHTML = markup;
  document.getElementById("history").classList.add("active");
  state.favorites = [];
  state.favoritesSet = new Set();
  state.flags.historyOnly = false;
  window.api = {
    history: { get: jest.fn().mockResolvedValue(fixture), delete: jest.fn().mockResolvedValue([fixture[1]]), clear: jest.fn().mockResolvedValue([]) },
    servers: { ping: jest.fn() },
    settings: { saveFavorites: jest.fn().mockResolvedValue(true) },
  };
  showConfirmModal.mockResolvedValue(true);
  connectToServer.mockResolvedValue();
  dispose = initHistoryManager();
  document.getElementById("historyResetFilters").click();
  await loadAndRenderHistory();
});
afterEach(() => { dispose?.(); jest.restoreAllMocks(); });
function action(name) { return document.querySelector('[data-history-action="' + name + '"]'); }
function search(value) {
  const input = document.getElementById("historySearchInput");
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

test("renders readable servers and labels without live pings or notes", () => {
  expect(document.querySelector(".history-server-meta").textContent).toContain("Livonia");
  expect(action("join").textContent).toContain("Join again");
  expect(document.body.textContent).not.toContain("Custom Note");
  expect(window.api.servers.ping).not.toHaveBeenCalled();
  expect(state.historySet.has(fixture[0].id)).toBe(true);
});

test("filters and sorts with independent last-use semantics", () => {
  const select = document.getElementById("historySortSelect");
  select.value = "used";
  select.dispatchEvent(new Event("change"));
  expect(document.querySelector(".history-server-name").textContent).toBe("Beta");
  search("livonia");
  expect(document.querySelectorAll(".history-row")).toHaveLength(1);
  expect(document.activeElement).not.toBe(action("join"));
  search("nothing");
  expect(document.body.textContent).toContain("No matching servers");
  action("reset").click();
  expect(document.querySelectorAll(".history-row")).toHaveLength(2);
  const date = document.getElementById("historyDateSelect");
  date.value = "today";
  date.dispatchEvent(new Event("change"));
  expect(document.querySelectorAll(".history-row")).toHaveLength(1);
});

test("expansion and joining are explicit and do not trigger each other", async () => {
  action("expand").click();
  expect(createHistoryDetails).toHaveBeenCalledWith(fixture[0].id);
  expect(action("expand").getAttribute("aria-expanded")).toBe("true");
  expect(connectToServer).not.toHaveBeenCalled();
  action("join").click();
  await flush();
  expect(connectToServer).toHaveBeenCalledWith("1.2.3.4", 2302, { serverContext: fixture[0], forceModQuery: true });
  expect(createHistoryDetails).toHaveBeenCalledTimes(1);
});

test("prevents duplicate reconnects and offers cancellation while checking", async () => {
  let resolve;
  connectToServer.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  action("join").click();
  expect(action("join").disabled).toBe(true);
  action("join").click();
  expect(connectToServer).toHaveBeenCalledTimes(1);
  action("cancel-join").click();
  expect(cancelPendingConnection).toHaveBeenCalled();
  resolve();
  await flush();
  expect(action("join").disabled).toBe(false);
});

test("action popovers support Escape and restore focus", () => {
  const trigger = action("more");
  trigger.click();
  expect(document.getElementById("history-action-popover")).not.toBeNull();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(document.getElementById("history-action-popover")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(connectToServer).not.toHaveBeenCalled();
});

test("cancelled removal retains the expansion; confirmed removal syncs shared history", async () => {
  action("expand").click();
  const view = createHistoryDetails.mock.results.at(-1).value;
  showConfirmModal.mockResolvedValueOnce(false);
  action("more").click();
  [...document.querySelectorAll(".history-action-popover button")].find(n => n.textContent === "Remove from history").click();
  await flush();
  expect(window.api.history.delete).not.toHaveBeenCalled();
  expect(view.destroy).not.toHaveBeenCalled();
  action("more").click();
  [...document.querySelectorAll(".history-action-popover button")].find(n => n.textContent === "Remove from history").click();
  await flush();
  expect(view.destroy).toHaveBeenCalled();
  expect(state.historySet.has(fixture[0].id)).toBe(false);
});

test("clear is secondary and confirmed, and updates Recently Played state", async () => {
  document.getElementById("historyOptionsBtn").click();
  document.querySelector(".history-menu-danger").click();
  await flush();
  expect(showConfirmModal).toHaveBeenCalledWith(expect.stringContaining("2 servers"));
  expect(window.api.history.clear).toHaveBeenCalledTimes(1);
  expect(state.historySet.size).toBe(0);
  expect(document.body.textContent).toContain("Your next connection starts here");
});

test("failed reads have Retry and never masquerade as an empty history", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  window.api.history.get.mockRejectedValueOnce(new Error("Unreadable"));
  await loadAndRenderHistory();
  expect(document.body.textContent).toContain("Could not load history");
  expect(document.body.textContent).not.toContain("Your next connection starts here");
  action("retry").click();
  await flush();
  expect(document.querySelectorAll(".history-row")).toHaveLength(2);
});

test("stale list loads cannot replace a newer response", async () => {
  let resolve;
  window.api.history.get.mockReturnValueOnce(new Promise(r => { resolve = r; })).mockResolvedValueOnce([fixture[1]]);
  const old = loadAndRenderHistory();
  await loadAndRenderHistory();
  resolve([fixture[0]]);
  await old;
  expect(document.querySelector(".history-server-name").textContent).toBe("Beta");
});

test("leaving History destroys details and invalidates outstanding list reads", async () => {
  action("expand").click();
  const view = createHistoryDetails.mock.results.at(-1).value;
  let resolve;
  window.api.history.get.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  const pending = loadAndRenderHistory();
  document.dispatchEvent(new CustomEvent("dzlinux:tab-changed", { detail: { tab: "browser" } }));
  resolve([]);
  await pending;
  expect(view.destroy).toHaveBeenCalledTimes(1);
  expect(state.historySet.size).toBe(2);
});

test("background history changes refresh Recently Played even after leaving the tab", async () => {
  document.dispatchEvent(new CustomEvent("dzlinux:tab-changed", { detail: { tab: "browser" } }));
  window.api.history.get.mockResolvedValue([]);
  window.dispatchEvent(new CustomEvent("history-changed", { detail: { serverId: fixture[0].id } }));
  await flush();
  expect(state.historySet.size).toBe(0);
});

test("a full retained list remains searchable without querying servers", async () => {
  const many = Array.from({ length: 500 }, (_, i) => ({
    ...fixture[0], id: "server-" + i, ip: "server" + i + ".example.com", name: "Community " + i,
  }));
  window.api.history.get.mockResolvedValue(many);
  await loadAndRenderHistory();
  expect(document.querySelectorAll(".history-row")).toHaveLength(500);
  search("Community 499");
  expect(document.querySelectorAll(".history-row")).toHaveLength(1);
  expect(window.api.servers.ping).not.toHaveBeenCalled();
});

test("refreshing the list preserves keyboard focus inside expanded details", async () => {
  action("expand").click();
  const view = createHistoryDetails.mock.results.at(-1).value;
  const child = document.createElement("button");
  child.textContent = "Detail control";
  view.element.appendChild(child);
  child.focus();
  await loadAndRenderHistory({ silent: true });
  expect(document.activeElement).toBe(child);
});
