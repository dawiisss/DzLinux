import { showToast } from "./feedback.js";

export async function loadDiagnostics() {
  const listBody = document.getElementById("diagnosticsListBody");
  if (!listBody) return;

  const emptyDiv = document.createElement("div");
  emptyDiv.className = "empty-state";
  emptyDiv.textContent = "SCANNING TELEMETRY...";
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
      emptyDiv.textContent = "NO TELEMETRY DATA FOUND. DAYZ HAS NOT RUN YET.";
      listBody.replaceChildren(emptyDiv);
      return;
    }

    logs.forEach((log) => {
      const isCrash = log.status === "CRASH";
      const isWarn = log.status === "WARNING";
      const borderColor = isCrash
        ? "var(--accent-red)"
        : isWarn
          ? "#ffb703"
          : "var(--accent-green)";

      const card = document.createElement("div");
      card.style.border = "1px solid var(--border)";
      card.style.borderLeft = `3px solid ${borderColor}`;
      card.style.background = "rgba(0,0,0,0.4)";
      card.style.padding = "20px";
      card.classList.add("flex", "flex-col", "gap-4");
      card.style.boxShadow = "0 10px 30px rgba(0,0,0,0.3)";
      card.style.borderRadius = "8px";
      card.style.position = "relative";

      const headerRow = document.createElement("div");
      headerRow.classList.add(
        "flex",
        "justify-between",
        "items-center",
        "mb-2",
      );
      headerRow.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
      headerRow.style.paddingBottom = "10px";

      const titleDate = document.createElement("div");
      const titleStrong = document.createElement("strong");
      titleStrong.style.color = "#fff";
      titleStrong.style.fontFamily = "'Share Tech Mono', monospace";
      titleStrong.style.fontSize = "1.1rem";
      titleStrong.style.letterSpacing = "1px";
      titleStrong.textContent = `[${log.name}]`;

      const dateSpan = document.createElement("span");
      dateSpan.style.color = "var(--text-muted)";
      dateSpan.style.fontSize = "0.85rem";
      dateSpan.style.marginLeft = "12px";
      dateSpan.textContent = new Date(log.date).toLocaleString();

      titleDate.appendChild(titleStrong);
      titleDate.appendChild(dateSpan);

      const statusDiv = document.createElement("div");
      statusDiv.style.fontFamily = "'Share Tech Mono', monospace";
      statusDiv.style.fontWeight = "700";
      statusDiv.style.letterSpacing = "1px";
      statusDiv.style.padding = "4px 10px";
      statusDiv.style.background = `rgba(${isCrash ? "255,90,95" : isWarn ? "255,183,3" : "46,196,182"}, 0.1)`;
      statusDiv.style.border = `1px solid ${borderColor}`;
      statusDiv.style.color = borderColor;
      statusDiv.textContent = isCrash
        ? "⚠️ SYSTEM CRASH"
        : isWarn
          ? "⚠️ WARNING"
          : "✓ NORMAL";

      headerRow.appendChild(titleDate);
      headerRow.appendChild(statusDiv);

      const statsRow = document.createElement("div");
      statsRow.classList.add("flex", "gap-5", "mb-2");
      statsRow.style.fontFamily = "'Share Tech Mono', monospace";
      const playtimeDiv = document.createElement("div");
      playtimeDiv.style.display = "flex";
      playtimeDiv.style.gap = "8px";
      playtimeDiv.style.alignItems = "center";
      const playtimeLabel = document.createElement("span");
      playtimeLabel.style.color = "var(--text-muted)";
      playtimeLabel.textContent = "PLAYTIME:";
      const playtimeValue = document.createElement("span");
      playtimeValue.style.color = "#fff";
      playtimeValue.style.fontWeight = "bold";
      playtimeValue.style.fontSize = "1rem";
      playtimeValue.textContent = String(log.playtime || "N/A");
      playtimeDiv.appendChild(playtimeLabel);
      playtimeDiv.appendChild(playtimeValue);

      const dropsDiv = document.createElement("div");
      dropsDiv.style.display = "flex";
      dropsDiv.style.gap = "8px";
      dropsDiv.style.alignItems = "center";
      const dropsLabel = document.createElement("span");
      dropsLabel.style.color = "var(--text-muted)";
      dropsLabel.textContent = "CONNECTION DROPS:";
      const dropsValue = document.createElement("span");
      dropsValue.style.color = "#fff";
      dropsValue.style.fontWeight = "bold";
      dropsValue.style.fontSize = "1rem";
      dropsValue.textContent = String(log.connectionDrops || 0);
      dropsDiv.appendChild(dropsLabel);
      dropsDiv.appendChild(dropsValue);

      statsRow.appendChild(playtimeDiv);
      statsRow.appendChild(dropsDiv);

      const snippetDiv = document.createElement("div");
      snippetDiv.style.fontFamily = "'Share Tech Mono', monospace";
      snippetDiv.style.fontSize = "0.85rem";
      snippetDiv.style.color = isCrash
        ? "#ff5a5f"
        : isWarn
          ? "#ffb703"
          : "var(--accent)";
      snippetDiv.textContent =
        log.snippet || "> SYSTEM LOG NORMAL. NO ANOMALIES DETECTED.";
      snippetDiv.style.background = "#000";
      snippetDiv.style.padding = "15px";
      snippetDiv.style.border = "1px solid rgba(255,255,255,0.08)";
      snippetDiv.style.boxShadow = "inset 0 0 10px rgba(0,0,0,0.8)";
      snippetDiv.style.whiteSpace = "pre-wrap";

      card.appendChild(headerRow);
      card.appendChild(statsRow);
      card.appendChild(snippetDiv);

      if (log.description) {
        const descDiv = document.createElement("div");
        descDiv.style.fontSize = "0.85rem";
        descDiv.style.color = "var(--text-muted)";
        descDiv.style.lineHeight = "1.5";
        descDiv.style.background = "rgba(255,255,255,0.02)";
        descDiv.style.padding = "10px";
        descDiv.style.borderLeft = "2px solid var(--text-dim)";
        const descSpan = document.createElement("span");
        descSpan.style.color = "#fff";
        descSpan.style.fontWeight = "600";
        descSpan.textContent = "DIAGNOSTIC ANALYSIS:";
        descDiv.appendChild(descSpan);
        descDiv.appendChild(document.createElement("br"));
        descDiv.appendChild(document.createTextNode(log.description));
        card.appendChild(descDiv);
      }

      if (log.suggestedFix) {
        const fixDiv = document.createElement("div");
        fixDiv.style.fontSize = "0.85rem";
        fixDiv.style.color = "#2ec4b6";
        fixDiv.style.lineHeight = "1.5";
        fixDiv.style.background = "rgba(46,196,182,0.05)";
        fixDiv.style.padding = "10px";
        fixDiv.style.marginTop = "8px";
        fixDiv.style.borderLeft = "2px solid #2ec4b6";
        const fixSpan = document.createElement("span");
        fixSpan.style.color = "#fff";
        fixSpan.style.fontWeight = "600";
        fixSpan.textContent = "🛠️ SUGGESTED FIX:";
        fixDiv.appendChild(fixSpan);
        fixDiv.appendChild(document.createElement("br"));
        fixDiv.appendChild(document.createTextNode(log.suggestedFix));
        card.appendChild(fixDiv);
      }

      const actionsRow = document.createElement("div");
      actionsRow.style.display = "flex";
      actionsRow.style.justifyContent = "flex-end";
      actionsRow.style.marginTop = "10px";
      const copyBtn = document.createElement("button");
      copyBtn.className = "btn btn-outline";
      copyBtn.style.padding = "6px 12px";
      copyBtn.style.fontSize = "0.75rem";
      copyBtn.textContent = "📋 COPY LOG SNIPPET";
      copyBtn.setAttribute("aria-label", "Copy Log Snippet");
      copyBtn.addEventListener("click", () => {
        const text = `[${log.name}] ${log.status}\nSnippet: ${log.snippet || "N/A"}\nDescription: ${log.description || "N/A"}\nSuggested Fix: ${log.suggestedFix || "N/A"}`;
        navigator.clipboard
          .writeText(text)
          .then(() => {
            showToast("LOG SNIPPET COPIED TO CLIPBOARD", "#2ec4b6", "📋");
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
    emptyDiv.textContent = "FAILED TO FETCH TELEMETRY.";
    listBody.replaceChildren(emptyDiv);
  }
}
