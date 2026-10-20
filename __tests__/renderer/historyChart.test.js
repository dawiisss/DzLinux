/** @jest-environment jsdom */
const { createHistoryChart } = require("../../src/renderer/history/historyChart");
test("charts actual timestamps and known values without synthesizing measurements", () => {
  const now = Date.now();
  window.Chart = jest.fn().mockImplementation(() => ({ destroy: jest.fn() }));
  const canvas = { getContext: jest.fn().mockReturnValue({}) };
  createHistoryChart(canvas, [
    { timestamp: now, players: null, ping: 30 },
    { timestamp: now - 1000, players: 0, ping: null },
  ]);
  const config = window.Chart.mock.calls[0][1];
  expect(config.type).toBe("scatter");
  expect(config.data.datasets[0].data).toEqual([{ x: now - 1000, y: 0 }]);
  expect(config.data.datasets[1].data).toEqual([{ x: now, y: 30 }]);
  expect(config.options.scales.x.type).toBe("linear");
});
test("does not create a chart for a set of entirely unknown measurements", () => {
  window.Chart = jest.fn();
  expect(createHistoryChart({}, [{ timestamp: Date.now(), ping: null, players: null }])).toBeNull();
  expect(window.Chart).not.toHaveBeenCalled();
});
