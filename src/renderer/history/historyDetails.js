import { formatExactTime, getPeriodData, mapName } from "./historyModel.js";
import { createHistoryChart } from "./historyChart.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createHistoryDetails(serverId) {
  const element = el("section", "history-details");
  element.setAttribute("aria-label", "Recorded server activity");
  let generation = 0;
  let disposed = false;
  let range = "30d";
  let shown = 10;
  let data = null;
  let chart = null;

  function destroyChart() {
    chart?.destroy();
    chart = null;
  }

  function render() {
    if (disposed || !data) return;
    const focused = element.contains(document.activeElement) ? document.activeElement : null;
    const focusedRange = focused?.dataset.range;
    const focusedMore = focused?.dataset.showMore;
    const restoreFocus = () => {
      const target = focusedRange ? element.querySelector('[data-range="' + focusedRange + '"]')
        : focusedMore ? element.querySelector("[data-show-more]") || element.querySelector("h4") : null;
      target?.focus({ preventScroll: true });
    };
    destroyChart();
    element.replaceChildren();
    element.setAttribute("aria-busy", "false");
    const top = el("div", "history-details-heading");
    top.appendChild(el("h3", "", "Recorded statistics"));
    const ranges = el("div", "history-ranges");
    ranges.setAttribute("role", "group");
    ranges.setAttribute("aria-label", "Statistics period");
    for (const [value, label] of [["24h", "24 hours"], ["7d", "7 days"], ["30d", "30 days"]]) {
      const button = el("button", "btn btn-outline btn-sm", label);
      button.type = "button";
      button.dataset.range = value;
      button.setAttribute("aria-pressed", String(range === value));
      button.addEventListener("click", () => {
        range = value;
        shown = 10;
        render();
        element.querySelector('[data-range="' + value + '"]')?.focus({ preventScroll: true });
      });
      ranges.appendChild(button);
    }
    top.appendChild(ranges);
    element.appendChild(top);
    const period = getPeriodData(data.snapshots, range);
    const stats = el("dl", "history-stats");
    for (const [label, value] of [
      ["Attempts in this period", String(period.attempts)],
      ["Average recorded ping", period.avgPing === null ? "—" : period.avgPing + " ms"],
      ["Peak recorded players", period.peakPlayers === null ? "—" :
        period.peakPlayers + (period.peakCapacity ? " / " + period.peakCapacity : "")],
    ]) {
      const item = el("div");
      item.append(el("dt", "", label), el("dd", "", value));
      stats.appendChild(item);
    }
    element.appendChild(stats);
    element.appendChild(el("p", "history-help", "Measurements were recorded when Connect was used, rather than continuously during gameplay."));
    if (!period.entries.length) {
      element.appendChild(el("p", "history-empty-period", "No recorded activity in this period."));
      restoreFocus();
      return;
    }
    const columns = el("div", "history-details-columns");
    const activity = el("div", "history-activity");
    activity.appendChild(el("h4", "", "Connection attempts"));
    const list = el("ol", "history-activity-list");
    for (const entry of period.entries.slice(0, shown)) {
      const item = el("li");
      const time = el("time", "", formatExactTime(entry.timestamp));
      time.dateTime = new Date(entry.timestamp).toISOString();
      const measurements = [];
      measurements.push(entry.ping > 0 ? entry.ping + " ms" : "Ping unavailable");
      measurements.push(Number.isInteger(entry.players) ? entry.players +
        (entry.maxPlayers > 0 ? " / " + entry.maxPlayers : "") + " players" : "Population unavailable");
      if (entry.map) measurements.push(mapName(entry.map));
      item.append(time, el("span", "history-activity-values", measurements.join(" · ")));
      list.appendChild(item);
    }
    activity.appendChild(list);
    const visible = Math.min(shown, period.entries.length);
    activity.appendChild(el("p", "history-help", "Showing " + visible + " of " + period.entries.length +
      " retained entries in this period. " + data.playCount + " recorded attempts in total."));
    if (shown < period.entries.length) {
      const more = el("button", "btn btn-outline btn-sm", "Show more");
      more.type = "button";
      more.dataset.showMore = "true";
      more.addEventListener("click", () => {
        shown += 10;
        render();
        const next = element.querySelector("[data-show-more]");
        if (next) next.focus({ preventScroll: true });
        else element.querySelector("h4")?.focus({ preventScroll: true });
      });
      activity.appendChild(more);
    }
    activity.querySelector("h4").tabIndex = -1;
    const graph = el("div", "history-chart-area");
    const canvas = el("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Recorded ping and population. The connection attempts list contains the same measurements.");
    graph.appendChild(canvas);
    columns.append(activity, graph);
    element.appendChild(columns);
    try {
      chart = createHistoryChart(canvas, period.entries);
      if (!chart) graph.replaceChildren(el("p", "history-help", "No chart available. Recorded measurements are listed alongside."));
    } catch (error) {
      console.error("History chart could not be rendered:", error);
      graph.replaceChildren(el("p", "history-help", "Chart unavailable. Recorded measurements are listed alongside."));
    }
    restoreFocus();
  }

  async function load({ silent = false } = {}) {
    const request = ++generation;
    if (!silent || !data) {
      destroyChart();
      element.replaceChildren(el("p", "history-help", "Loading recorded activity…"));
    }
    element.setAttribute("aria-busy", "true");
    try {
      const response = await window.api.history.getAnalytics(serverId);
      if (disposed || request !== generation) return;
      element.setAttribute("aria-busy", "false");
      if (!response) {
        element.replaceChildren(el("p", "history-help", "This history entry is no longer available."));
        return;
      }
      data = response;
      render();
    } catch (error) {
      if (disposed || request !== generation) return;
      element.setAttribute("aria-busy", "false");
      const retry = el("button", "btn btn-outline btn-sm", "Retry");
      retry.type = "button";
      retry.addEventListener("click", load);
      element.replaceChildren(el("p", "history-help", "Could not load recorded activity."), retry);
      console.error("History details failed:", error);
    }
  }

  return {
    element, load,
    destroy() {
      disposed = true;
      generation++;
      destroyChart();
      element.replaceChildren();
    },
  };
}
