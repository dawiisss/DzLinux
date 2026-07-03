import { state } from "./state.js";
import { showToast, copyToClipboard } from "./feedback.js";
// utils not needed in this module

export function startWatchlistPoll() {
  if (state.watchlist.pollInterval) clearInterval(state.watchlist.pollInterval);
  state.watchlist.pollInterval = null;

  if (state.settings.watchlistRefreshEnabled === false) return;

  const pollSeconds = parseInt(state.settings.watchlistRefreshTime) || 10;

  const poll = async () => {
    try {
      const watchlist = await window.api.watchlist.load();
      const activeItems = watchlist.filter((item) => item.active);
      if (activeItems.length === 0) return;

      const dirtyItems = [];

      const results = await Promise.allSettled(
        activeItems.map((item) => {
          const allServersMatch = state.allServers.find(
            (s) => s.ip === item.ip && String(s.port) === String(item.port),
          );
          const masterQueryPort = allServersMatch?.queryPort;
          if (masterQueryPort && masterQueryPort !== item.queryPort) {
            item.queryPort = masterQueryPort;
            dirtyItems.push(item);
          }
          const queryPort = item.queryPort || masterQueryPort || null;
          return window.api.servers
            .ping(item.ip, item.port, queryPort)
            .then((result) => {
              if (result === null) return null;
              if (allServersMatch) {
                allServersMatch.realPing = result.ping;
                if (result.status) allServersMatch.status = result.status;
                if (result.players !== null)
                  allServersMatch.players = result.players;
                if (result.maxPlayers !== null)
                  allServersMatch.maxPlayers = result.maxPlayers;
                if (result.name && allServersMatch.name === "Unknown Server")
                  allServersMatch.name = result.name;
                allServersMatch.failedPing = false;
              }
              return {
                ip: item.ip,
                port: item.port,
                name: item.name,
                status: result.status,
                players: result.players !== null ? result.players : 0,
                maxPlayers: result.maxPlayers || 60,
              };
            });
        }),
      );

      if (dirtyItems.length > 0) {
        await window.api.watchlist
          .save(watchlist)
          .catch((err) =>
            console.error("[Watchlist] Failed to sync queryPort:", err),
          );
      }

      const serverStates = results
        .filter((r) => r.status === "fulfilled" && r.value !== null)
        .map((r) => r.value);

      if (serverStates.length > 0) {
        window.api.watchlist
          .checkThresholds(serverStates)
          .catch((err) =>
            console.error("[Watchlist] Threshold check error:", err),
          );
      }

      renderWatchlist();
    } catch (err) {
      console.error("[Watchlist] Poll failed:", err);
    }
  };

  state.watchlist.pollInterval = setInterval(poll, pollSeconds * 1000);
}

export async function renderWatchlist() {
  const tbody = document.getElementById("watchlistListBody");
  if (!tbody) return;

  tbody.replaceChildren();
  const loadingTr = document.createElement("tr");
  const loadingTd = document.createElement("td");
  loadingTd.colSpan = 7;
  loadingTd.className = "empty-state-msg";
  loadingTd.textContent = "LOADING WATCHLIST...";
  loadingTr.appendChild(loadingTd);
  tbody.appendChild(loadingTr);

  try {
    const watchlist = await window.api.watchlist.load();
    tbody.replaceChildren();

    if (watchlist.length === 0) {
      const emptyTr = document.createElement("tr");
      const emptyTd = document.createElement("td");
      emptyTd.colSpan = 7;
      emptyTd.className = "empty-state-msg";
      emptyTd.textContent =
        "YOUR WATCHLIST IS EMPTY. RIGHT-CLICK A SERVER TO START WATCHING.";
      emptyTr.appendChild(emptyTd);
      tbody.appendChild(emptyTr);
      return;
    }

    watchlist.forEach((item, index) => {
      const server = state.allServers.find(
        (s) => s.ip === item.ip && s.port === item.port,
      );
      const tr = document.createElement("tr");
      tr.className = "server-row";

      // Active toggle
      const tdActive = document.createElement("td");
      tdActive.style.textAlign = "center";
      const label = document.createElement("label");
      label.className = "switch";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = item.active;
      input.setAttribute(
        "aria-label",
        `Toggle Watchlist Active Status for ${item.name || "Unknown Server"}`,
      );
      input.title = "Toggle Watchlist Status";
      input.addEventListener("change", async () => {
        item.active = input.checked;
        await window.api.watchlist.save(watchlist);
        showToast(
          `WATCHLIST: ${item.name} ${item.active ? "ACTIVATED" : "DEACTIVATED"}`,
          item.active ? "var(--accent-green)" : "var(--text-dim)",
          "👁️",
        );
      });
      const span = document.createElement("span");
      span.className = "slider";
      label.appendChild(input);
      label.appendChild(span);
      tdActive.appendChild(label);

      // Name
      const tdName = document.createElement("td");
      tdName.className = "server-name-cell";
      tdName.textContent =
        item.name || (server ? server.name : "Unknown Server");

      // Players
      const tdPlayers = document.createElement("td");
      const playerBadge = document.createElement("span");
      if (server) {
        const pct = server.maxPlayers ? server.players / server.maxPlayers : 0;
        let bc = "low";
        if (
          (pct >= 0.95 || server.players >= server.maxPlayers) &&
          server.maxPlayers > 0
        )
          bc = "high";
        else if (pct >= 0.7) bc = "medium";
        playerBadge.className = `player-badge ${bc}`;
        playerBadge.textContent = `${server.players}/${server.maxPlayers}`;
      } else {
        playerBadge.className = "player-badge low";
        playerBadge.style.opacity = "0.5";
        playerBadge.textContent = "OFFLINE";
      }
      tdPlayers.appendChild(playerBadge);

      // Threshold slider
      const tdThreshold = document.createElement("td");
      const sliderContainer = document.createElement("div");
      sliderContainer.className = "threshold-slider-container";
      const slider = document.createElement("input");
      slider.type = "range";
      slider.className = "threshold-slider";
      slider.setAttribute(
        "aria-label",
        `Player count threshold for ${item.name || "Unknown Server"}`,
      );
      slider.min = "0";
      slider.max = "127";
      slider.value = item.threshold || 50;
      const readout = document.createElement("div");
      readout.className = "threshold-readout";
      const modeLabel = document.createElement("span");
      modeLabel.setAttribute("role", "button");
      modeLabel.setAttribute("tabindex", "0");
      modeLabel.textContent =
        (item.mode || "below") === "below"
          ? "NOTIFY WHEN SLOTS OPEN (<=)"
          : "NOTIFY WHEN TARGET REACHED (>=)";
      modeLabel.setAttribute(
        "aria-label",
        (item.mode || "below") === "below"
          ? "Current mode: Notify when slots open. Click to toggle."
          : "Current mode: Notify when target reached. Click to toggle.",
      );
      modeLabel.title = "Toggle Watchlist Notification Mode";
      modeLabel.style.cursor = "pointer";

      const toggleMode = async () => {
        item.mode = (item.mode || "below") === "below" ? "above" : "below";
        modeLabel.textContent =
          item.mode === "below"
            ? "NOTIFY WHEN SLOTS OPEN (<=)"
            : "NOTIFY WHEN TARGET REACHED (>=)";
        modeLabel.setAttribute(
          "aria-label",
          item.mode === "below"
            ? "Current mode: Notify when slots open. Click to toggle."
            : "Current mode: Notify when target reached. Click to toggle.",
        );
        await window.api.watchlist.save(watchlist);
      };

      modeLabel.addEventListener("click", toggleMode);
      modeLabel.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleMode();
        }
      });

      const valueReadout = document.createElement("span");
      valueReadout.textContent = slider.value;
      valueReadout.style.color = "var(--accent)";
      valueReadout.style.fontWeight = "bold";

      slider.addEventListener("input", () => {
        valueReadout.textContent = slider.value;
      });

      slider.addEventListener("change", async () => {
        item.threshold = parseInt(slider.value);
        await window.api.watchlist.save(watchlist);
        showToast(
          `THRESHOLD UPDATED TO ${item.threshold} PLAYERS`,
          "var(--accent)",
          "🎯",
        );
      });

      readout.appendChild(modeLabel);
      readout.appendChild(valueReadout);
      sliderContainer.appendChild(slider);
      sliderContainer.appendChild(readout);
      tdThreshold.appendChild(sliderContainer);

      // Last Status
      const tdStatus = document.createElement("td");
      const statusBadge = document.createElement("span");
      statusBadge.className = "hud-badge";
      statusBadge.style.fontSize = "0.7rem";
      if (item.lastStatus === "notified") {
        statusBadge.textContent = "🔔 NOTIFIED";
        statusBadge.className += " badge-approved";
      } else {
        statusBadge.textContent = "🛰️ MONITORING";
        statusBadge.className += " badge-time";
      }
      tdStatus.appendChild(statusBadge);

      // IP
      const tdIp = document.createElement("td");
      const ipSpan = document.createElement("span");
      ipSpan.className = "ip-cell";
      ipSpan.textContent = `${item.ip}:${item.port}`;
      ipSpan.addEventListener("click", () =>
        copyToClipboard(`${item.ip}:${item.port}`),
      );
      tdIp.appendChild(ipSpan);

      // Actions
      const tdAction = document.createElement("td");
      tdAction.style.textAlign = "right";
      tdAction.style.whiteSpace = "nowrap";
      const connectBtn = document.createElement("button");
      connectBtn.className = "btn-connect";
      connectBtn.style.marginRight = "6px";
      connectBtn.textContent = "CONNECT";
      connectBtn.addEventListener("click", () => {
        import("./serverBrowser.js").then(({ connectToServer }) =>
          connectToServer(item.ip, item.port),
        );
      });
      tdAction.appendChild(connectBtn);

      const delBtn = document.createElement("button");
      delBtn.className = "btn-ping";
      delBtn.style.color = "var(--accent-red)";
      delBtn.style.borderColor = "var(--accent-red)";
      delBtn.innerHTML = `<app-icon name="trash" stroke-width="2.2" style="width: 1rem; height: 1rem;"></app-icon>`;
      delBtn.title = "Remove from Watchlist";
      delBtn.setAttribute("aria-label", "Remove from Watchlist");
      delBtn.addEventListener("click", async () => {
        watchlist.splice(index, 1);
        await window.api.watchlist.save(watchlist);
        renderWatchlist();
        showToast("Removed from watchlist", "var(--accent-red)", `<app-icon name="trash" stroke-width="2.2" style="width: 1.1rem; height: 1.1rem; color: var(--accent-red);"></app-icon>`);
      });
      tdAction.appendChild(delBtn);

      tr.appendChild(tdActive);
      tr.appendChild(tdName);
      tr.appendChild(tdPlayers);
      tr.appendChild(tdThreshold);
      tr.appendChild(tdStatus);
      tr.appendChild(tdIp);
      tr.appendChild(tdAction);
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error("Watchlist render fail", e);
    const errorTr = document.createElement("tr");
    const errorTd = document.createElement("td");
    errorTd.colSpan = 7;
    errorTd.className = "empty-state-msg text-red";
    errorTd.textContent = "FAILED TO LOAD WATCHLIST.";
    errorTr.appendChild(errorTd);
    tbody.appendChild(errorTr);
  }
}

export function initWatchlist() {
  document
    .getElementById("refreshWatchlistBtn")
    ?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const originalHTML = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = "⏳ REFRESHING...";
      try {
        await renderWatchlist();
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    });

  window.api.watchlist.onNotify((notifications) => {
    notifications.forEach((n) => {
      showToast(n.title, "var(--accent-green)", "🔔");
    });
  });

  window.api.watchlist.onOpen(() => {
    if (typeof window.switchTab === "function") {
      window.switchTab("watchlist");
    }
  });
}
