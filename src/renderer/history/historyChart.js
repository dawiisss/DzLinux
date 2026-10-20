import { formatExactTime } from "./historyModel.js";

export function createHistoryChart(canvas, entries) {
  const ChartLib = window.Chart;
  if (!ChartLib) return null;
  const styles = getComputedStyle(document.body);
  const color = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  const text = color("--text-main", "#b8c1cc");
  const muted = color("--text-muted", "#80909e");
  const border = color("--border", "#25333b");
  const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  const populations = sorted.filter((entry) => Number.isInteger(entry.players) && entry.players >= 0)
    .map((entry) => ({ x: entry.timestamp, y: entry.players }));
  const pings = sorted.filter((entry) => typeof entry.ping === "number" && entry.ping > 0)
    .map((entry) => ({ x: entry.timestamp, y: entry.ping }));
  if (!populations.length && !pings.length) return null;
  return new ChartLib(canvas.getContext("2d"), {
    type: "scatter",
    data: { datasets: [
      { label: "Recorded players", data: populations, borderColor: color("--accent", "#00c8df"),
        backgroundColor: color("--accent", "#00c8df"), yAxisID: "players", pointRadius: 4 },
      { label: "Recorded ping (ms)", data: pings, borderColor: color("--accent-green", "#2ec4b6"),
        backgroundColor: color("--accent-green", "#2ec4b6"), yAxisID: "ping", pointStyle: "triangle", pointRadius: 5 },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { labels: { color: text, usePointStyle: true } },
        tooltip: { callbacks: {
          title: (items) => items.length ? formatExactTime(items[0].parsed.x) : "",
        } },
      },
      scales: {
        x: { type: "linear", grid: { color: border }, ticks: {
          color: muted, maxTicksLimit: 5,
          callback: (value) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(value),
        } },
        players: { position: "left", beginAtZero: true, grid: { color: border },
          title: { display: true, text: "Players", color: text }, ticks: { color: muted, precision: 0 } },
        ping: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false },
          title: { display: true, text: "Ping (ms)", color: text }, ticks: { color: muted } },
      },
    },
  });
}
