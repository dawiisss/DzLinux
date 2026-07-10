import { showToast } from "./feedback.js";

export async function loadDiagnostics() {
  const listBody = document.getElementById("diagnosticsListBody");
  if (!listBody) return;

  const emptyDiv = document.createElement("div");
  emptyDiv.className = "empty-state";
  emptyDiv.textContent = "Scanning telemetry...";
  listBody.replaceChildren(emptyDiv);

  try {
    const summary = await window.api.diagnostics.getSessionSummary();
    if (summary) {
      document.getElementById("teleTotalSessions").textContent =
        summary.totalSessions || "0";
      document.getElementById("teleTotalPlaytime").textContent =
        summary.totalPlaytime || "0m";
      document.getElementById("teleAvgSession").textContent =
        summary.averageSessionLength || "0m";
      document.getElementById("teleTotalCrashes").textContent =
        summary.totalCrashes || "0";
      document.getElementById("teleTotalWarnings").textContent =
        summary.totalWarnings || "0";
      document.getElementById("teleTotalDrops").textContent =
        summary.totalDrops || "0";
    }

    const logs = await window.api.diagnostics.getRecentLogs();
    listBody.replaceChildren();

    if (!logs || logs.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "empty-state";
      emptyDiv.textContent = "No telemetry data found. DayZ has not run yet.";
      listBody.replaceChildren(emptyDiv);
      return;
    }

    logs.forEach((log) => {
      const isCrash = log.status === "CRASH";
      const isWarn = log.status === "WARNING";

      const card = document.createElement("div");
      card.className = "diagnostic-card flex flex-col gap-4";

      const headerRow = document.createElement("div");
      headerRow.className = "diagnostic-header flex justify-between items-center mb-2";

      const titleDate = document.createElement("div");
      const titleStrong = document.createElement("strong");
      titleStrong.className = "diagnostic-title";
      titleStrong.textContent = `[${log.name}]`;

      const dateSpan = document.createElement("span");
      dateSpan.className = "diagnostic-date";
      dateSpan.textContent = new Date(log.date).toLocaleString();

      titleDate.appendChild(titleStrong);
      titleDate.appendChild(dateSpan);

      const statusDiv = document.createElement("div");
      statusDiv.className = "diagnostic-status " + (isCrash ? "diagnostic-status-crash" : isWarn ? "diagnostic-status-warn" : "diagnostic-status-normal");
      statusDiv.textContent = isCrash ? "⚠️ System crash" : isWarn ? "⚠️ Warning" : "✓ Normal";

      headerRow.appendChild(titleDate);
      headerRow.appendChild(statusDiv);

      const statsRow = document.createElement("div");
      statsRow.className = "diagnostic-stats-row flex gap-5 mb-2";
      
      const playtimeDiv = document.createElement("div");
      playtimeDiv.className = "diagnostic-stat";
      const playtimeLabel = document.createElement("span");
      playtimeLabel.className = "diagnostic-stat-label";
      playtimeLabel.textContent = "Playtime:";
      const playtimeValue = document.createElement("span");
      playtimeValue.className = "diagnostic-stat-value";
      playtimeValue.textContent = String(log.playtime || "N/A");
      playtimeDiv.appendChild(playtimeLabel);
      playtimeDiv.appendChild(playtimeValue);

      const dropsDiv = document.createElement("div");
      dropsDiv.className = "diagnostic-stat";
      const dropsLabel = document.createElement("span");
      dropsLabel.className = "diagnostic-stat-label";
      dropsLabel.textContent = "Connection drops:";
      const dropsValue = document.createElement("span");
      dropsValue.className = "diagnostic-stat-value";
      dropsValue.textContent = String(log.connectionDrops || 0);
      dropsDiv.appendChild(dropsLabel);
      dropsDiv.appendChild(dropsValue);

      statsRow.appendChild(playtimeDiv);
      statsRow.appendChild(dropsDiv);

      const snippetDiv = document.createElement("div");
      snippetDiv.className = "diagnostic-snippet " + (isCrash ? "diagnostic-snippet-crash" : isWarn ? "diagnostic-snippet-warn" : "diagnostic-snippet-normal");
      snippetDiv.textContent = log.snippet || "> System log normal. No anomalies detected.";

      card.appendChild(headerRow);
      card.appendChild(statsRow);
      card.appendChild(snippetDiv);

      if (log.description) {
        const descDiv = document.createElement("div");
        descDiv.className = "diagnostic-analysis";
        const descSpan = document.createElement("span");
        descSpan.className = "diagnostic-analysis-label";
        descSpan.textContent = "Diagnostic analysis:";
        descDiv.appendChild(descSpan);
        descDiv.appendChild(document.createElement("br"));
        descDiv.appendChild(document.createTextNode(log.description));
        card.appendChild(descDiv);
      }

      if (log.suggestedFix) {
        const fixDiv = document.createElement("div");
        fixDiv.className = "diagnostic-fix";
        const fixSpan = document.createElement("span");
        fixSpan.className = "diagnostic-fix-label";
        fixSpan.textContent = "🛠️ Suggested fix:";
        fixDiv.appendChild(fixSpan);
        fixDiv.appendChild(document.createElement("br"));
        fixDiv.appendChild(document.createTextNode(log.suggestedFix));
        card.appendChild(fixDiv);
      }

      const actionsRow = document.createElement("div");
      actionsRow.className = "diagnostic-actions";
      const copyBtn = document.createElement("button");
      copyBtn.className = "btn btn-outline diagnostic-btn";
      copyBtn.textContent = "📋 Copy log snippet";
      copyBtn.setAttribute("aria-label", "Copy Log Snippet");
      copyBtn.addEventListener("click", () => {
        const text = `[${log.name}] ${log.status}\nSnippet: ${log.snippet || "N/A"}\nDescription: ${log.description || "N/A"}\nSuggested Fix: ${log.suggestedFix || "N/A"}`;
        navigator.clipboard
          .writeText(text)
          .then(() => {
            showToast("Log snippet copied to clipboard", "#2ec4b6", "📋");
          })
          .catch(() => {});
      });
      actionsRow.appendChild(copyBtn);
      card.appendChild(actionsRow);

      listBody.appendChild(card);
    });
  } catch (e) {
    console.error("Diagnostics fail", e);
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "empty-state text-red";
    emptyDiv.textContent = "Failed to fetch telemetry.";
    listBody.replaceChildren(emptyDiv);
  }
}
