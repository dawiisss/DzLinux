import { showToast } from "./feedback.js";
import { escapeHtml } from "./utils.js";

let currentChartInstance = null;
let currentAnalyticsData = null;
let currentServerId = null;
let currentTimeframe = "24h";

export async function openAnalyticsModal(serverId) {
  if (!serverId || !window.api || !window.api.history) return;

  currentServerId = serverId;
  const modal = document.getElementById("historyAnalyticsModal");
  if (!modal) return;

  try {
    const data = await window.api.history.getAnalytics(serverId);
    if (!data) {
      showToast("No analytics records found for this server", "#ff5a5f", "alert");
      return;
    }

    currentAnalyticsData = data;

    // Populate header info
    const titleEl = document.getElementById("analyticsModalTitle");
    const subtitleEl = document.getElementById("analyticsModalSubtitle");
    const noteInput = document.getElementById("analyticsCustomNoteInput");

    if (titleEl) {
      titleEl.innerHTML = `<app-icon name="chart-line"></app-icon> ${escapeHtml(data.name || data.id)}`;
    }
    if (subtitleEl) {
      subtitleEl.textContent = `${data.ip}:${data.port} • ${data.map || "Chernarus"}`;
    }
    if (noteInput) {
      noteInput.value = data.customNote || "";
    }

    // Render chart with default 24h view
    currentTimeframe = "24h";
    updateTimeframeButtonsUI();
    renderAnalyticsChart();

    modal.style.display = "flex";
  } catch (err) {
    console.error("Failed to load analytics data:", err);
    showToast("Failed to load server analytics", "#ff5a5f", "alert");
  }
}

export function closeAnalyticsModal() {
  const modal = document.getElementById("historyAnalyticsModal");
  if (modal) {
    modal.style.display = "none";
  }
  if (currentChartInstance) {
    currentChartInstance.destroy();
    currentChartInstance = null;
  }
  currentAnalyticsData = null;
  currentServerId = null;
}

function updateTimeframeButtonsUI() {
  const container = document.getElementById("analyticsTimeframeBtns");
  if (!container) return;

  const buttons = container.querySelectorAll("button[data-timeframe]");
  buttons.forEach((btn) => {
    const tf = btn.getAttribute("data-timeframe");
    if (tf === currentTimeframe) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

function renderAnalyticsChart() {
  if (!currentAnalyticsData) return;

  const canvas = document.getElementById("historyChartCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (currentChartInstance) {
    currentChartInstance.destroy();
    currentChartInstance = null;
  }

  const snapshots = currentAnalyticsData.snapshots || [];
  const now = Date.now();

  let timeframeMs = 24 * 60 * 60 * 1000;
  if (currentTimeframe === "7d") timeframeMs = 7 * 24 * 60 * 60 * 1000;
  if (currentTimeframe === "30d") timeframeMs = 30 * 24 * 60 * 60 * 1000;

  const filteredSnapshots = snapshots.filter((s) => s.timestamp >= now - timeframeMs);

  // Compute stats
  const totalSessionsEl = document.getElementById("analyticsTotalSessions");
  const avgPingEl = document.getElementById("analyticsAvgPing");
  const peakPlayersEl = document.getElementById("analyticsPeakPlayers");

  if (totalSessionsEl) {
    totalSessionsEl.textContent = currentAnalyticsData.playCount || filteredSnapshots.length || "0";
  }

  if (filteredSnapshots.length > 0) {
    const pings = filteredSnapshots.map((s) => s.ping).filter((p) => p > 0);
    const players = filteredSnapshots.map((s) => s.players);
    const avgPing = pings.length > 0 ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : (currentAnalyticsData.lastPing || 0);
    const peakPlayers = players.length > 0 ? Math.max(...players) : (currentAnalyticsData.lastPlayers || 0);

    if (avgPingEl) avgPingEl.textContent = `${avgPing} ms`;
    if (peakPlayersEl) peakPlayersEl.textContent = `${peakPlayers} / ${currentAnalyticsData.maxPlayers || 60}`;
  } else {
    if (avgPingEl) avgPingEl.textContent = `${currentAnalyticsData.lastPing || 0} ms`;
    if (peakPlayersEl) peakPlayersEl.textContent = `${currentAnalyticsData.lastPlayers || 0} / ${currentAnalyticsData.maxPlayers || 60}`;
  }

  // Format labels & datasets
  const labels = filteredSnapshots.map((s) => {
    const d = new Date(s.timestamp);
    if (currentTimeframe === "24h") {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`;
  });

  const playerPoints = filteredSnapshots.map((s) => s.players);
  const pingPoints = filteredSnapshots.map((s) => s.ping);

  // If no snapshots, create a dummy baseline point with last known state
  if (labels.length === 0) {
    labels.push("Latest");
    playerPoints.push(currentAnalyticsData.lastPlayers || 0);
    pingPoints.push(currentAnalyticsData.lastPing || 0);
  }

  const ChartLib = window.Chart || (typeof globalThis !== "undefined" ? globalThis.Chart : null);
  if (!ChartLib) {
    showToast("Chart library failed to load", "#ff5a5f", "alert");
    return;
  }

  currentChartInstance = new ChartLib(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Player Count",
          data: playerPoints,
          borderColor: "#ff9f1c",
          backgroundColor: "rgba(255, 159, 28, 0.15)",
          fill: true,
          tension: 0.3,
          yAxisID: "yPlayers",
          pointRadius: labels.length < 30 ? 4 : 2,
        },
        {
          label: "Ping (ms)",
          data: pingPoints,
          borderColor: "#2ec4b6",
          backgroundColor: "rgba(46, 196, 182, 0.1)",
          fill: false,
          borderDash: [4, 4],
          tension: 0.2,
          yAxisID: "yPing",
          pointRadius: labels.length < 30 ? 3 : 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          labels: {
            color: "#e2e8f0",
            font: { family: "Inter, sans-serif", size: 12 },
          },
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.9)",
          titleColor: "#f8fafc",
          bodyColor: "#cbd5e1",
          borderColor: "rgba(255, 255, 255, 0.1)",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#94a3b8", font: { size: 10 } },
        },
        yPlayers: {
          type: "linear",
          display: true,
          position: "left",
          title: { display: true, text: "Players", color: "#ff9f1c" },
          grid: { color: "rgba(255, 255, 255, 0.08)" },
          ticks: { color: "#94a3b8" },
          beginAtZero: true,
        },
        yPing: {
          type: "linear",
          display: true,
          position: "right",
          title: { display: true, text: "Ping (ms)", color: "#2ec4b6" },
          grid: { drawOnChartArea: false },
          ticks: { color: "#94a3b8" },
          beginAtZero: true,
        },
      },
    },
  });
}


export function initHistoryChartModal() {
  const closeBtn = document.getElementById("analyticsModalCloseBtn");
  const modal = document.getElementById("historyAnalyticsModal");
  const saveNoteBtn = document.getElementById("analyticsSaveNoteBtn");
  const timeframeBtns = document.getElementById("analyticsTimeframeBtns");

  if (closeBtn) {
    closeBtn.addEventListener("click", closeAnalyticsModal);
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeAnalyticsModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.style.display === "flex") {
        closeAnalyticsModal();
      }
    });
  }

  if (timeframeBtns) {
    timeframeBtns.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-timeframe]");
      if (!btn) return;
      currentTimeframe = btn.getAttribute("data-timeframe");
      updateTimeframeButtonsUI();
      renderAnalyticsChart();
    });
  }

  if (saveNoteBtn) {
    saveNoteBtn.addEventListener("click", async () => {
      if (!currentServerId || !window.api || !window.api.history) return;
      const noteInput = document.getElementById("analyticsCustomNoteInput");
      const noteText = noteInput ? noteInput.value.trim() : "";

      try {
        await window.api.history.saveNote(currentServerId, noteText);
        if (currentAnalyticsData) {
          currentAnalyticsData.customNote = noteText;
        }
        showToast("Custom note saved", "#2ec4b6", "save");
        // Dispatch custom event to notify history view table to refresh notes
        window.dispatchEvent(new CustomEvent("history-note-updated", { detail: { serverId: currentServerId, note: noteText } }));
      } catch (err) {
        console.error("Failed to save note:", err);
        showToast("Failed to save note", "#ff5a5f", "alert");
      }
    });
  }
}
