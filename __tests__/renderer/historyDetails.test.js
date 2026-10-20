/** @jest-environment jsdom */
jest.mock("../../src/renderer/history/historyChart", () => ({ createHistoryChart: jest.fn() }));
const { createHistoryDetails } = require("../../src/renderer/history/historyDetails");
const { createHistoryChart } = require("../../src/renderer/history/historyChart");
let view;
let mockDestroy;
let now;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

beforeEach(() => {
  now = new Date(2026, 9, 18, 12).getTime();
  jest.spyOn(Date, "now").mockReturnValue(now);
  mockDestroy = jest.fn();
  createHistoryChart.mockReset().mockReturnValue({ destroy: mockDestroy });
  window.api = { history: { getAnalytics: jest.fn() } };
  document.body.replaceChildren();
});
afterEach(() => { view?.destroy(); view = null; jest.restoreAllMocks(); });
function mount() { view = createHistoryDetails("1.2.3.4:2302"); document.body.appendChild(view.element); return view; }

test("empty periods never manufacture a chart or use lifetime totals", async () => {
  window.api.history.getAnalytics.mockResolvedValue({ playCount: 90, snapshots: [{ timestamp: now - 31 * 86400000, ping: 42 }] });
  await mount().load();
  expect(view.element.textContent).toContain("No recorded activity in this period");
  expect(view.element.querySelector("dd").textContent).toBe("0");
  expect(createHistoryChart).not.toHaveBeenCalled();
});

test("uses selected-period observations for stats and paginates retained activity", async () => {
  window.api.history.getAnalytics.mockResolvedValue({
    playCount: 100,
    snapshots: Array.from({ length: 21 }, (_, i) => ({ timestamp: now - i * 1000, ping: 20, players: 10, maxPlayers: 60 })),
  });
  await mount().load();
  expect(view.element.querySelectorAll("li")).toHaveLength(10);
  expect(view.element.querySelector("dd").textContent).toBe("21");
  view.element.querySelector("[data-show-more]").click();
  expect(view.element.querySelectorAll("li")).toHaveLength(20);
  view.element.querySelector("[data-show-more]").click();
  expect(view.element.querySelectorAll("li")).toHaveLength(21);
  expect(view.element.querySelector("[data-show-more]")).toBeNull();
  expect(mockDestroy).toHaveBeenCalledTimes(2);
});

test("range changes use real samples and preserve unknown measurements", async () => {
  window.api.history.getAnalytics.mockResolvedValue({
    playCount: 12, snapshots: [
      { timestamp: now - 2 * 86400000, ping: 50, players: 20 },
      { timestamp: now - 1000, ping: null, players: null },
    ],
  });
  await mount().load();
  view.element.querySelector('[data-range="24h"]').click();
  expect([...view.element.querySelectorAll("dd")].map(n => n.textContent)).toEqual(["1", "—", "—"]);
  expect(view.element.querySelectorAll("li")).toHaveLength(1);
  expect(view.element.textContent).toContain("Ping unavailable");
});

test("destroy invalidates an outstanding details response", async () => {
  let resolve;
  window.api.history.getAnalytics.mockReturnValue(new Promise(r => { resolve = r; }));
  mount();
  const pending = view.load();
  view.destroy();
  resolve({ playCount: 1, snapshots: [{ timestamp: now, ping: 30 }] });
  await pending;
  expect(view.element.children).toHaveLength(0);
  expect(createHistoryChart).not.toHaveBeenCalled();
});

test("retry recovers a detail read error without retaining old chart data", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  window.api.history.getAnalytics.mockRejectedValueOnce(new Error("No disk"))
    .mockResolvedValueOnce({ playCount: 0, snapshots: [] });
  await mount().load();
  expect(view.element.textContent).toContain("Could not load");
  view.element.querySelector("button").click();
  await flush();
  expect(view.element.textContent).toContain("No recorded activity");
});

test("a newer refresh wins over an older response", async () => {
  let resolve;
  window.api.history.getAnalytics.mockReturnValueOnce(new Promise(r => { resolve = r; }))
    .mockResolvedValueOnce({ playCount: 0, snapshots: [] });
  mount();
  const old = view.load();
  await view.load();
  resolve({ playCount: 1, snapshots: [{ timestamp: now, ping: 99 }] });
  await old;
  expect(view.element.textContent).toContain("No recorded activity");
  expect(createHistoryChart).not.toHaveBeenCalled();
});

test("a background refresh keeps the selected range and keyboard focus", async () => {
  window.api.history.getAnalytics.mockResolvedValue({ playCount: 1, snapshots: [{ timestamp: now, ping: 20 }] });
  await mount().load();
  const rangeButton = view.element.querySelector('[data-range="24h"]');
  rangeButton.click();
  await view.load({ silent: true });
  expect(document.activeElement.dataset.range).toBe("24h");
  expect(document.activeElement.getAttribute("aria-pressed")).toBe("true");
});
