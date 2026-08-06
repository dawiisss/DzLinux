import { state } from "./state.js";
import { showToast, copyToClipboard } from "./feedback.js";
import { getPlayerBadgeClass } from "./utils.js";

export function startWatchlistPoll() {
  if (state.watchlist.pollInterval) clearInterval(state.watchlist.pollInterval);
  state.watchlist.pollInterval = null;

  // Respect user setting: skip starting background poll if watchlist or polling is disabled
  if (
    state.settings.watchlistRefreshEnabled === false ||
    state.settings.showWatchlistTab === false ||
    state.settings.enableWatchlist === false
  ) {
    return;
  }

  const pollSeconds = parseInt(state.settings.watchlistRefreshTime, 10) || 10;

  let pollInProgress = false;

  const poll = async () => {
    if (pollInProgress) return;
    pollInProgress = true;
    try {
      const watchlist = await window.api.watchlist.load();
      const activeItems = watchlist.filter((item) => item.active);
      if (activeItems.length === 0) {
        pollInProgress = false;
        return;
      }

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
    } finally {
      pollInProgress = false;
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
  loadingTd.colSpan = 8;
  loadingTd.className = "empty-state-msg";
  loadingTd.textContent = "Loading watchlist...";
  loadingTr.appendChild(loadingTd);
  tbody.appendChild(loadingTr);

  try {
    const watchlist = await window.api.watchlist.load();
    tbody.replaceChildren();

    if (watchlist.length === 0) {
      const emptyTr = document.createElement("tr");
      const emptyTd = document.createElement("td");
      emptyTd.colSpan = 8;
      emptyTd.className = "empty-state-msg";
      emptyTd.textContent =
        "Your watchlist is empty. Right-click a server to start watching.";
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
        item.lastStatus = "idle";
        await window.api.watchlist.save(watchlist);
        await renderWatchlist();
        showToast(
          `Watchlist: ${item.name} ${item.active ? "activated" : "deactivated"}`,
          item.active ? "var(--accent-green)" : "var(--text-dim)",
          "eye",
        );
      });
      const span = document.createElement("span");
      span.className = "slider";
      label.appendChild(input);
      label.appendChild(span);
      tdActive.appendChild(label);

      // Auto-Join toggle
      const tdAutoJoin = document.createElement("td");
      tdAutoJoin.style.textAlign = "center";
      const autoJoinLabel = document.createElement("label");
      autoJoinLabel.className = "switch";
      const autoJoinInput = document.createElement("input");
      autoJoinInput.type = "checkbox";
      autoJoinInput.checked = !!item.autoJoin;
      autoJoinInput.setAttribute(
        "aria-label",
        `Toggle Auto-Join on Notify for ${item.name || "Unknown Server"}`,
      );
      autoJoinInput.title = "Auto-Join on Notify";
      autoJoinInput.addEventListener("change", async () => {
        item.autoJoin = autoJoinInput.checked;
        await window.api.watchlist.save(watchlist);
        showToast(
          `Auto-Join ${item.autoJoin ? "enabled" : "disabled"} for ${item.name || "Server"}`,
          item.autoJoin ? "var(--accent-green)" : "var(--text-dim)",
          "bell",
        );
      });
      const autoJoinSpan = document.createElement("span");
      autoJoinSpan.className = "slider";
      autoJoinLabel.appendChild(autoJoinInput);
      autoJoinLabel.appendChild(autoJoinSpan);
      tdAutoJoin.appendChild(autoJoinLabel);

      // Name
      const tdName = document.createElement("td");
      tdName.className = "server-name-cell";
      tdName.textContent =
        item.name || (server ? server.name : "Unknown Server");

      // Players
      const tdPlayers = document.createElement("td");
      const playerBadge = document.createElement("span");
      if (server && !server.failedPing && server.realPing !== -1) {
        const bc = getPlayerBadgeClass(server.players, server.maxPlayers);
        playerBadge.className = `player-badge ${bc}`;
        playerBadge.textContent = `${server.players}/${server.maxPlayers}`;
      } else {
        playerBadge.className = "player-badge low";
        playerBadge.style.opacity = "0.5";
        playerBadge.textContent = "Offline";
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
          ? "Notify when slots open (<=)"
          : "Notify when target reached (>=)";
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
            ? "Notify when slots open (<=)"
            : "Notify when target reached (>=)";
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
          `Threshold updated to ${item.threshold} players`,
          "var(--accent)",
          "target",
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
      statusBadge.style.cursor = "pointer";
      statusBadge.title = "Click to reset status to Monitoring";
      statusBadge.setAttribute("role", "button");
      statusBadge.setAttribute("tabindex", "0");
      statusBadge.setAttribute(
        "aria-label",
        `Current status: ${item.lastStatus === "notified" ? "Notified" : "Monitoring"}. Click to reset to Monitoring.`,
      );

      if (item.lastStatus === "notified") {
        statusBadge.textContent = "🔔 Notified";
        statusBadge.className += " badge-approved";
      } else {
        statusBadge.textContent = "🛰️ Monitoring";
        statusBadge.className += " badge-time";
      }

      const resetStatus = async () => {
        if (item.lastStatus === "notified") {
          item.lastStatus = "idle";
          await window.api.watchlist.save(watchlist);
          await renderWatchlist();
          showToast(
            `Status reset to Monitoring for ${item.name || "Server"}`,
            "var(--accent)",
            "rotate-ccw",
          );
        }
      };

      statusBadge.addEventListener("click", resetStatus);
      statusBadge.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          resetStatus();
        }
      });

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
      connectBtn.textContent = "Connect";
      connectBtn.addEventListener("click", () => {
        const target = server || { ip: item.ip, port: item.port };
        document.dispatchEvent(new CustomEvent("dzlinux:connect-server", { detail: { server: target } }));
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
      tr.appendChild(tdAutoJoin);
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
    errorTd.colSpan = 8;
    errorTd.className = "empty-state-msg text-red";
    errorTd.textContent = "Failed to load watchlist.";
    errorTr.appendChild(errorTd);
    tbody.appendChild(errorTr);
  }
}

let autoJoinTimer = null;

export function showAutoJoinModal(server, options = {}) {
  if (!server || !server.ip || !server.port) return;
  const modal = document.getElementById("autoJoinModal");
  if (!modal) return;

  const serverNameEl = document.getElementById("autoJoinServerName");
  const serverIpEl = document.getElementById("autoJoinServerIp");
  const circleEl = document.getElementById("autoJoinCountdownCircle");
  const subtitleEl = document.getElementById("autoJoinSubtitle");

  if (serverNameEl) serverNameEl.textContent = server.name || "Unknown Server";
  if (serverIpEl) serverIpEl.textContent = `${server.ip}:${server.port}`;

  if (autoJoinTimer) {
    clearInterval(autoJoinTimer);
    autoJoinTimer = null;
  }

  const useTimer = options.timer !== false;

  const closeModal = () => {
    if (autoJoinTimer) {
      clearInterval(autoJoinTimer);
      autoJoinTimer = null;
    }
    modal.style.display = "none";
  };

  const executeJoin = () => {
    closeModal();
    document.dispatchEvent(
      new CustomEvent("dzlinux:connect-server", { detail: { server } }),
    );
  };

  const handleCancel = () => {
    closeModal();
    showToast("Connection cancelled", "var(--text-dim)", "x-circle");
  };

  const cancelBtn = document.getElementById("btnAutoJoinCancel");
  const nowBtn = document.getElementById("btnAutoJoinNow");

  cancelBtn?.replaceWith(cancelBtn.cloneNode(true));
  nowBtn?.replaceWith(nowBtn.cloneNode(true));

  const freshCancelBtn = document.getElementById("btnAutoJoinCancel");
  const freshNowBtn = document.getElementById("btnAutoJoinNow");

  freshCancelBtn?.addEventListener("click", handleCancel);
  freshNowBtn?.addEventListener("click", executeJoin);

  if (useTimer) {
    let countdown = 5;
    if (circleEl) {
      circleEl.style.display = "block";
      circleEl.textContent = String(countdown);
    }
    if (subtitleEl) {
      subtitleEl.textContent = "Auto-connecting in seconds...";
    }
    if (freshCancelBtn) {
      freshCancelBtn.textContent = "Cancel Auto-Join";
    }
    autoJoinTimer = setInterval(() => {
      countdown -= 1;
      if (circleEl) circleEl.textContent = String(countdown);
      if (countdown <= 0) {
        executeJoin();
      }
    }, 1000);
  } else {
    if (circleEl) {
      circleEl.style.display = "none";
    }
    if (subtitleEl) {
      subtitleEl.textContent = "Would you like to connect to this server now?";
    }
    if (freshCancelBtn) {
      freshCancelBtn.textContent = "Cancel";
    }
  }

  modal.style.display = "flex";
}

export function initWatchlist() {
  document
    .getElementById("refreshWatchlistBtn")
    ?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const originalHTML = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = "⏳ Refreshing...";
      try {
        await renderWatchlist();
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    });

  window.api.watchlist.onNotify((notifications) => {
    notifications.forEach((n) => {
      const useTimer = !!n.autoJoin;
      showToast(n.title, "var(--accent)", "bell", () => {
        if (n.server) showAutoJoinModal(n.server, { timer: useTimer });
      });
      if (useTimer && n.server) {
        showAutoJoinModal(n.server, { timer: true });
      }
    });
  });

  window.api.watchlist.onOpen(() => {
    document.dispatchEvent(new CustomEvent("dzlinux:switch-tab", { detail: { tab: "watchlist" } }));
  });

  window.api.watchlist.onAutoJoin?.((server) => {
    if (server && server.ip && server.port) {
      const useTimer = !!server.autoJoin;
      showAutoJoinModal(server, { timer: useTimer });
    }
  });
}
