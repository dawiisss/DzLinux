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
            showToast("Log snippet copied to clipboard", "#2ec4b6", "clipboard");
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

  loadSystemCompatibilityCheck();
}

export async function loadSystemCompatibilityCheck() {
  const container = document.getElementById("systemCheckContainer");
  if (!container) return;

  container.replaceChildren();
  const loadingDiv = document.createElement("div");
  loadingDiv.style.cssText = "color: var(--text-dim); padding: 12px; grid-column: 1 / -1; display: flex; align-items: center; gap: 8px;";
  const loaderIcon = document.createElement("app-icon");
  loaderIcon.setAttribute("name", "rotate-ccw");
  loadingDiv.appendChild(loaderIcon);
  loadingDiv.appendChild(document.createTextNode("Scanning system compatibility and Linux prerequisites..."));
  container.appendChild(loadingDiv);

  try {
    const results = await window.api.diagnostics.runSystemCheck();
    container.replaceChildren();

    if (!results || results.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.style.cssText = "color: var(--text-dim); padding: 12px; grid-column: 1 / -1;";
      emptyDiv.textContent = "No system compatibility check results available.";
      container.appendChild(emptyDiv);
      return;
    }

    results.forEach((item) => {
      const itemCard = document.createElement("div");
      itemCard.style.cssText =
        "background: var(--bg-hover); border: 1px solid var(--border); border-radius: 4px; padding: 12px; display: flex; flex-direction: column; gap: 6px; min-width: 0; overflow: hidden; word-break: break-word; overflow-wrap: anywhere;";

      const headerDiv = document.createElement("div");
      headerDiv.style.cssText = "display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; min-width: 0;";

      const titleSpan = document.createElement("span");
      titleSpan.style.cssText = "font-weight: 600; color: var(--text-bright); font-size: 0.95rem; min-width: 0; overflow-wrap: anywhere; word-break: break-word;";
      titleSpan.textContent = item.label;

      const badgeSpan = document.createElement("span");
      badgeSpan.style.cssText = "font-size: 0.8rem; font-weight: 600; padding: 2px 8px; border-radius: 12px; flex-shrink: 0; white-space: nowrap;";

      if (item.status === "pass") {
        badgeSpan.style.background = "rgba(46, 196, 182, 0.15)";
        badgeSpan.style.color = "#2ec4b6";
        badgeSpan.style.border = "1px solid rgba(46, 196, 182, 0.3)";
        badgeSpan.textContent = "🟢 Pass";
      } else if (item.status === "warn") {
        badgeSpan.style.background = "rgba(255, 159, 28, 0.15)";
        badgeSpan.style.color = "#ff9f1c";
        badgeSpan.style.border = "1px solid rgba(255, 159, 28, 0.3)";
        badgeSpan.textContent = "🟡 Warning";
      } else {
        badgeSpan.style.background = "rgba(231, 29, 54, 0.15)";
        badgeSpan.style.color = "#e71d36";
        badgeSpan.style.border = "1px solid rgba(231, 29, 54, 0.3)";
        badgeSpan.textContent = "🔴 Error";
      }

      headerDiv.appendChild(titleSpan);
      headerDiv.appendChild(badgeSpan);

      const categorySpan = document.createElement("span");
      categorySpan.style.cssText = "font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px;";
      categorySpan.textContent = item.category;

      const detailsDiv = document.createElement("div");
      detailsDiv.style.cssText = "font-size: 0.85rem; color: var(--text-main); line-height: 1.4; overflow-wrap: anywhere; word-break: break-word; min-width: 0;";
      detailsDiv.textContent = item.details;

      itemCard.appendChild(categorySpan);
      itemCard.appendChild(headerDiv);
      itemCard.appendChild(detailsDiv);

      if (item.fixSuggestion) {
        const fixDiv = document.createElement("div");
        fixDiv.style.cssText =
          "margin-top: 4px; padding: 8px; background: var(--bg-dark); border-left: 3px solid var(--primary); border-radius: 2px; font-size: 0.8rem; color: var(--text-dim); line-height: 1.3; overflow-wrap: anywhere; word-break: break-word; min-width: 0;";

        const fixTitle = document.createElement("strong");
        fixTitle.style.cssText = "color: var(--text-bright); display: block; margin-bottom: 2px;";
        fixTitle.textContent = "Suggested Action:";

        fixDiv.appendChild(fixTitle);
        fixDiv.appendChild(document.createTextNode(item.fixSuggestion));
        itemCard.appendChild(fixDiv);
      }

      container.appendChild(itemCard);
    });
  } catch (e) {
    console.error("System check error", e);
    container.replaceChildren();
    const errDiv = document.createElement("div");
    errDiv.style.cssText = "color: var(--color-danger, #e71d36); padding: 12px; grid-column: 1 / -1;";
    errDiv.textContent = "Failed to execute system compatibility check.";
    container.appendChild(errDiv);
  }
}

// Bind button listener
document.addEventListener("DOMContentLoaded", () => {
  const btnRun = document.getElementById("btnRunSystemCheck");
  if (btnRun) {
    btnRun.addEventListener("click", () => {
      loadSystemCompatibilityCheck();
      showToast("System compatibility check completed", "#2ec4b6", "check");
    });
  }
});

