import { state } from "./state.js";
import { escapeHtml } from "./utils.js";
import { showToast, copyToClipboard } from "./feedback.js";

let modScanRequestGeneration = 0;

export async function refreshLocalModsCache(options = {}) {
  const reqGen = ++modScanRequestGeneration;
  const requestedRoot =
    typeof state.settings?.modDirectory === "string"
      ? state.settings.modDirectory.trim()
      : "";

  if (state.modScanSnapshot && state.modScanSnapshot.root !== requestedRoot) {
    state.localMods = [];
    state.localModsSet = new Set();
    state.modScanSnapshot = null;
    state.lastCompleteModSizeBytes = null;
    state.lastCompleteModRoot = null;
  }

  try {
    let snapshot;
    if (window.api?.mods?.scan) {
      snapshot = await window.api.mods.scan(options);
    } else if (window.api?.mods?.getInstalled) {
      const mods = await window.api.mods.getInstalled();
      const safeMods = Array.isArray(mods) ? mods : [];
      const totalSizeBytes = safeMods.reduce(
        (sum, m) =>
          sum +
          (typeof m.sizeBytes === "number"
            ? m.sizeBytes
            : Math.round((m.sizeMB || 0) * 1024 * 1024)),
        0,
      );
      snapshot = {
        scanId: reqGen,
        root: requestedRoot,
        status: "complete",
        reason: null,
        mods: safeMods,
        totalSizeBytes,
        sizeComplete: true,
      };
    } else {
      snapshot = {
        scanId: reqGen,
        root: requestedRoot,
        status: "unavailable",
        reason: "not-configured",
        mods: [],
        totalSizeBytes: 0,
        sizeComplete: false,
      };
    }

    const currentRoot =
      typeof state.settings?.modDirectory === "string"
        ? state.settings.modDirectory.trim()
        : "";

    if (
      reqGen !== modScanRequestGeneration ||
      requestedRoot !== currentRoot ||
      !snapshot ||
      snapshot.root !== currentRoot
    ) {
      return state.modScanSnapshot;
    }

    if (snapshot.status === "cancelled") {
      if (state.modScanSnapshot && state.modScanSnapshot.root === currentRoot) {
        state.modScanSnapshot = { ...state.modScanSnapshot, stale: true };
        state.localModsSet = new Set();
      }
      return state.modScanSnapshot;
    }

    if (snapshot.status === "unavailable") {
      if (
        snapshot.reason === "not-configured" ||
        snapshot.reason === "not-found"
      ) {
        state.localMods = [];
        state.localModsSet = new Set();
        state.lastCompleteModSizeBytes = null;
        state.lastCompleteModRoot = null;
        state.modScanSnapshot = { ...snapshot, stale: false };
      } else if (
        state.modScanSnapshot &&
        state.modScanSnapshot.root === snapshot.root &&
        state.localMods.length > 0
      ) {
        state.modScanSnapshot = {
          ...snapshot,
          mods: state.localMods,
          stale: true,
          retainedMods: true,
        };
        state.localModsSet = new Set();
      } else {
        state.localMods = [];
        state.localModsSet = new Set();
        state.modScanSnapshot = { ...snapshot, stale: false };
      }
      return state.modScanSnapshot;
    }

    state.localMods = Array.isArray(snapshot.mods) ? snapshot.mods : [];
    state.localModsSet = new Set(state.localMods
      .filter((m) => (!m.scanStatus || m.scanStatus === "complete") && !m.isCorrupted)
      .map((m) => m.id));
    if (snapshot.sizeComplete && typeof snapshot.totalSizeBytes === "number") {
      state.lastCompleteModSizeBytes = snapshot.totalSizeBytes;
      state.lastCompleteModRoot = snapshot.root;
    }
    state.modScanSnapshot = { ...snapshot, stale: false };
    return state.modScanSnapshot;
  } catch (e) {
    const currentRoot =
      typeof state.settings?.modDirectory === "string"
        ? state.settings.modDirectory.trim()
        : "";
    if (reqGen !== modScanRequestGeneration || requestedRoot !== currentRoot) {
      return state.modScanSnapshot;
    }
    console.error("Failed to update local mods cache", e);
    if (
      state.modScanSnapshot &&
      state.modScanSnapshot.root === currentRoot &&
      state.localMods.length > 0
    ) {
      state.modScanSnapshot = {
        ...state.modScanSnapshot,
        status: "unavailable",
        reason: "io-error",
        stale: true,
        retainedMods: true,
      };
      state.localModsSet = new Set();
    } else {
      state.localMods = [];
      state.localModsSet = new Set();
      state.modScanSnapshot = {
        scanId: reqGen,
        root: currentRoot,
        status: "unavailable",
        reason: "io-error",
        mods: [],
        totalSizeBytes: 0,
        sizeComplete: false,
        stale: false,
      };
    }
    return state.modScanSnapshot;
  }
}

export async function loadInstalledMods(options = {}) {
  const tbody = document.getElementById("installedModsListBody");
  tbody.innerHTML =
    '<tr><td colspan="6" class="empty-state-msg" style="padding: 30px;">Scanning Workshop storage pipeline...</td></tr>';

  const force = Boolean(options && options.force === true);
  const snapshot = (await refreshLocalModsCache({ force })) || {
    status: "unavailable",
    reason: "not-configured",
    mods: [],
    totalSizeBytes: 0,
    sizeComplete: false,
    stale: false,
  };

  const isHardRootFailure =
    snapshot.status === "unavailable" &&
    !snapshot.retainedMods &&
    (snapshot.reason === "permission-denied" || snapshot.reason === "io-error");

  document.getElementById("totalModsCount").textContent = isHardRootFailure
    ? "—"
    : state.localMods.length;

  let totalSizeMB = 0;
  state.localMods.forEach((m) => (totalSizeMB += m.sizeMB || 0));
  const totalSizeGB = Math.round((totalSizeMB / 1024) * 10) / 10;

  const sizeEl = document.getElementById("totalModsSize");
  if (isHardRootFailure) {
    sizeEl.textContent = "Unavailable";
  } else if (
    snapshot.stale &&
    state.lastCompleteModRoot === snapshot.root &&
    state.lastCompleteModSizeBytes !== null
  ) {
    const staleGB =
      Math.round((state.lastCompleteModSizeBytes / (1024 * 1024 * 1024)) * 10) /
      10;
    sizeEl.textContent = `${staleGB} GB (Stale)`;
  } else if (snapshot.status === "partial" || !snapshot.sizeComplete) {
    sizeEl.textContent = `At least ${totalSizeGB} GB (Partial)`;
  } else if (snapshot.stale) {
    sizeEl.textContent = `${totalSizeGB} GB (Stale)`;
  } else {
    sizeEl.textContent = `${totalSizeGB} GB`;
  }

  if (state.settings?.modDirectory) {
    window.api.ui
      .getDiskSpace(state.settings.modDirectory)
      .then((space) => {
        if (space) {
          const totalGB =
            Math.round((space.total / (1024 * 1024 * 1024)) * 10) / 10;
          const freeGB =
            Math.round((space.free / (1024 * 1024 * 1024)) * 10) / 10;
          document.getElementById("diskSpaceReadout").textContent =
            `${freeGB} GB free of ${totalGB} GB`;

          const usedPct = space.total
            ? Math.max(
                0,
                ((space.used - totalSizeMB * 1024 * 1024) / space.total) * 100,
              )
            : 0;
          const modsPct = space.total
            ? Math.max(0, ((totalSizeMB * 1024 * 1024) / space.total) * 100)
            : 0;

          document.getElementById("storageMapUsed").style.width =
            `${Math.max(0, usedPct)}%`;
          document.getElementById("storageMapMods").style.width = `${modsPct}%`;
        } else {
          document.getElementById("diskSpaceReadout").textContent =
            `Unknown disk capacity`;
        }
      })
      .catch((err) => {
        console.error("Disk space query failed:", err);
        document.getElementById("diskSpaceReadout").textContent =
          "Unknown disk capacity";
      });
  }

  if (state.localMods.length === 0) {
    tbody.replaceChildren();
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.className = "empty-state-msg";
    td.style.padding = "30px";

    if (snapshot.status === "unavailable") {
      if (snapshot.reason === "permission-denied") {
        td.textContent =
          "Workshop folder could not be read (permission denied). Check folder permissions and retry. ";
        const retryBtn = document.createElement("button");
        retryBtn.className = "btn btn-outline btn-sm";
        retryBtn.textContent = "Retry";
        retryBtn.addEventListener("click", () => loadInstalledMods({ force: true }));
        td.appendChild(retryBtn);
      } else if (snapshot.reason === "io-error") {
        td.textContent =
          "Workshop folder could not be scanned due to a filesystem error. ";
        const retryBtn = document.createElement("button");
        retryBtn.className = "btn btn-outline btn-sm";
        retryBtn.textContent = "Retry";
        retryBtn.addEventListener("click", () => loadInstalledMods({ force: true }));
        td.appendChild(retryBtn);
      } else if (snapshot.reason === "not-found") {
        td.textContent =
          "Configured Workshop folder was not found. Verify target Workshop folder in Settings.";
      } else {
        td.textContent =
          "No installed Workshop mods detected. Define target Workshop folder in Settings.";
      }
    } else {
      td.textContent =
        "No installed Workshop mods detected. Define target Workshop folder in Settings.";
    }
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  tbody.replaceChildren();
  if (snapshot.stale || snapshot.status === "partial") {
    const noticeTr = document.createElement("tr");
    const noticeTd = document.createElement("td");
    noticeTd.colSpan = 6;
    noticeTd.style.padding = "10px 16px";
    noticeTd.style.color = "#ffb703";
    noticeTd.style.fontSize = "0.82rem";
    noticeTd.textContent = snapshot.stale
      ? "Showing last known Workshop snapshot (latest scan could not complete). "
      : "Partial Workshop scan: some mod files or metadata could not be read. ";
    const retryBtn = document.createElement("button");
    retryBtn.className = "btn btn-outline btn-sm";
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", () => loadInstalledMods({ force: true }));
    noticeTd.appendChild(retryBtn);
    noticeTr.appendChild(noticeTd);
    tbody.appendChild(noticeTr);
  }
  state.localMods.forEach((mod) => {
    const tr = document.createElement("tr");

    const tdCheck = document.createElement("td");
    tdCheck.style.textAlign = "center";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "mod-select-checkbox";
    checkbox.dataset.modId = mod.id;
    checkbox.setAttribute("aria-label", `Select ${mod.name} for actions`);
    checkbox.title = `Select ${mod.name} for actions`;
    tdCheck.appendChild(checkbox);

    const tdName = document.createElement("td");
    tdName.id = `mod-name-cell-${mod.id}`;
    let nameHTML = `<div style="font-weight: 600;">${escapeHtml(mod.name)}</div>`;
    if (mod.scanStatus === "unreadable" || mod.scanStatus === "partial") {
      nameHTML += `
        <div style="font-weight: 700; color: #ffb703; margin-top: 4px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 4px;">
          <app-icon name="alert" style="width: 0.95rem; height: 0.95rem; color: #ffb703; vertical-align: middle;"></app-icon>
          Incomplete Scan / Files Unreadable
        </div>
      `;
    } else if (mod.isCorrupted) {
      nameHTML += `
        <div style="font-weight: 700; color: #ff5a5f; margin-top: 4px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 4px;">
          <app-icon name="alert" style="width: 0.95rem; height: 0.95rem; color: #ff5a5f; vertical-align: middle;"></app-icon>
          Suspected Incomplete Installation / Missing Files
        </div>
      `;
    }

    let metaText = "";
    if (mod.author && mod.author !== "Unknown")
      metaText += `By ${escapeHtml(mod.author)}`;
    if (mod.version && mod.version !== "Unknown")
      metaText += (metaText ? ` &bull; ` : "") + `v${escapeHtml(mod.version)}`;

    if (metaText) {
      nameHTML += `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">${metaText}</div>`;
    }
    tdName.innerHTML = nameHTML;

    const tdId = document.createElement("td");
    const idSpan = document.createElement("span");
    idSpan.textContent = mod.id;
    if (/^\d+$/.test(mod.id)) {
      idSpan.className = "workshop-id-cell";
      idSpan.title = "Click to open Steam Workshop";
      idSpan.addEventListener("click", () => {
        showToast(
          `Opening Workshop for ${mod.name || mod.id}`,
          "#2ec4b6",
          "download",
        );
        window.api.mods.openWorkshop(mod.id).catch((err) => {
          showToast(`Failed to open Workshop: ${err.message}`, "#ff5a5f", "alert");
        });
      });
      const wsIcon = document.createElement("app-icon");
      wsIcon.setAttribute("name", "external-link");
      idSpan.appendChild(wsIcon);
    } else {
      idSpan.className = "ip-cell";
      idSpan.title = "Click to copy ID";
      idSpan.addEventListener("click", () => {
        copyToClipboard(mod.id);
        showToast("Mod ID copied to clipboard", "#2ec4b6", "clipboard");
      });
      const copyIcon = document.createElement("app-icon");
      copyIcon.setAttribute("name", "copy");
      idSpan.appendChild(copyIcon);
    }
    tdId.appendChild(idSpan);

    const tdSize = document.createElement("td");
    tdSize.style.fontFamily = "'Share Tech Mono', monospace";
    const formattedModSize =
      (mod.sizeMB || 0) >= 1024
        ? `${((mod.sizeMB || 0) / 1024).toFixed(1)} GB`
        : `${(mod.sizeMB || 0).toFixed(0)} MB`;
    if (mod.scanStatus === "unreadable" && !(mod.sizeMB > 0)) {
      tdSize.textContent = "Unavailable";
    } else if (mod.scanStatus === "partial") {
      tdSize.textContent = `At least ${formattedModSize}`;
    } else {
      tdSize.textContent = formattedModSize;
    }

    const tdModified = document.createElement("td");
    tdModified.style.color = "var(--text-muted)";
    tdModified.style.fontSize = "0.82rem";
    const date = new Date(mod.lastModified);
    tdModified.textContent =
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const tdActions = document.createElement("td");
    tdActions.style.textAlign = "right";

    const openFolderBtn = document.createElement("button");
    openFolderBtn.className = "btn btn-outline";
    openFolderBtn.style.padding = "6px 12px";
    openFolderBtn.style.fontSize = "0.75rem";
    openFolderBtn.style.marginRight = "8px";
    openFolderBtn.textContent = "Open Folder";
    openFolderBtn.addEventListener("click", () => {
      window.api.mods.openFolder(mod.id).catch((err) => {
        showToast(`Failed to open folder: ${err.message}`, "#ff5a5f", "alert");
      });
    });
    tdActions.appendChild(openFolderBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.style.padding = "6px 12px";
    deleteBtn.style.fontSize = "0.75rem";
    deleteBtn.textContent = "Unsubscribe";
    deleteBtn.addEventListener("click", async () => {
      deleteBtn.textContent = "Removing...";
      deleteBtn.disabled = true;
      const success = await window.api.steamworks.unsubscribe(mod.id);
      if (success) {
        await window.api.mods.delete(mod.id);
        tr.remove();
        state.localMods = state.localMods.filter((m) => m.id !== mod.id);
        state.localModsSet.delete(mod.id);
        document.getElementById("totalModsCount").textContent =
          state.localMods.length;
        let totalSizeMB = 0;
        state.localMods.forEach((m) => (totalSizeMB += m.sizeMB));
        const totalSizeGB = Math.round((totalSizeMB / 1024) * 10) / 10;
        document.getElementById("totalModsSize").textContent =
          `${totalSizeGB} GB`;
        showToast(`${mod.name} unsubscribed`, "#2ec4b6", "trash");
      } else {
        showToast("Failed to unsubscribe", "#ff5a5f", "alert");
        deleteBtn.textContent = "Unsubscribe";
        deleteBtn.disabled = false;
      }
    });
    tdActions.appendChild(deleteBtn);

    tr.appendChild(tdCheck);
    tr.appendChild(tdName);
    tr.appendChild(tdId);
    tr.appendChild(tdSize);
    tr.appendChild(tdModified);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });

  // Enhanced Password-Free Mismatch Checker
  if (state.localMods.length > 0) {
    window.api.mods
      .checkUpdatesDetailed(state.localMods)
      .then((result) => {
        const misMatchBanner = document.getElementById("mismatchBanner");
        if (!misMatchBanner) return;

        if (result.outdatedMods && result.outdatedMods.length > 0) {
          const count = result.outdatedMods.length;
          const names = result.outdatedMods
            .slice(0, 3)
            .map((m) => escapeHtml(m.name))
            .join(", ");
          const more = count > 3 ? ` +${count - 3} more` : "";
          misMatchBanner.style.display = "flex";
          misMatchBanner.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px;flex:1;">
            <app-icon name="alert" style="width: 1.3rem; height: 1.3rem; color: #ffb703; flex-shrink: 0;"></app-icon>
            <div>
              <div style="font-weight:700;color:#ffb703;font-size:0.9rem;">${escapeHtml(String(count))} Mod${count > 1 ? "s" : ""} outdated — Workshop Mismatch Detected</div>
              <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">${names}${escapeHtml(more)}</div>
            </div>
          </div>
          <button id="updateAllMismatchBtn" class="btn" style="padding:6px 14px;font-size:0.8rem;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;">
            <app-icon name="download" style="width: 0.95rem; height: 0.95rem;"></app-icon>
            Update all
          </button>
          <button aria-label="Dismiss Mismatch Banner" title="Dismiss" id="dismissMismatchBtn" class="btn btn-outline" style="padding:6px 10px;font-size:0.75rem;">✕</button>
        `;

          document
            .getElementById("dismissMismatchBtn")
            .addEventListener("click", () => {
              misMatchBanner.style.display = "none";
            });

          document
            .getElementById("updateAllMismatchBtn")
            .addEventListener("click", async () => {
              const btn = document.getElementById("updateAllMismatchBtn");
              btn.innerHTML = `
                <app-icon name="loader" style="width: 0.95rem; height: 0.95rem;"></app-icon>
                Updating...
              `;
              btn.disabled = true;
              const generation = (misMatchBanner.dataset.generation = (
                parseInt(misMatchBanner.dataset.generation || "0", 10) + 1
              ).toString());
              for (const mod of result.outdatedMods) {
                if (misMatchBanner.dataset.generation !== generation) break;
                showToast(`Updating ${mod.name}...`, "#ff9f1c", "download");
                await window.api.steamworks.subscribe(mod.id);
                await new Promise((r) => setTimeout(r, 500));
              }
              btn.innerHTML = `
                <app-icon name="download" style="width: 0.95rem; height: 0.95rem;"></app-icon>
                Update All
              `;
              btn.disabled = false;
              showToast("All outdated mods queued for update", "#2ec4b6", "check");
            });

          result.outdatedMods.forEach((mod) => {
            const nameCell = document.getElementById(`mod-name-cell-${mod.id}`);
            if (nameCell) {
              const warning = document.createElement("div");
              warning.style.fontWeight = "700";
              warning.style.color = "#ffb703";
              warning.style.marginTop = "4px";
              warning.style.fontSize = "0.8rem";
              const days = mod.daysOutdated || 0;
              const daysStr = days > 0 ? `${days} days` : "Recently";
              warning.innerHTML = `
                <app-icon name="alert" style="width: 0.95rem; height: 0.95rem; color: #ffb703; margin-right: 4px; vertical-align: middle;"></app-icon>
                Workshop Mismatch (Outdated ${escapeHtml(String(daysStr))})
              `;
              nameCell.appendChild(warning);
            }
          });
        } else {
          misMatchBanner.style.display = "none";
        }
      })
      .catch((err) => console.error("Detailed mismatch checker error:", err));
  }
}

export async function triggerSteamworksSync(modId, modName, statusLabel) {
  // If this mod is already syncing, just re-attach the new label and return
  const existing = state.activeDownloads.get(modId);
  if (existing) {
    existing.statusLabel = statusLabel;
    if (statusLabel) {
      statusLabel.textContent = existing.lastStatusText || "Syncing...";
      statusLabel.style.color = "var(--accent)";
    }
    return;
  }

  // Reserve ownership before subscribing so rapid requests share one poller.
  const entry = { modName, statusLabel, lastStatusText: "Subscribing...",
    pollRetries: 0, pollInterval: null, pollInProgress: false };
  state.activeDownloads.set(modId, entry);
  const isCurrent = () => state.activeDownloads.get(modId) === entry;
  const stop = () => {
    clearInterval(entry.pollInterval);
    if (isCurrent()) state.activeDownloads.delete(modId);
  };
  try {
    const success = await window.api.steamworks.subscribe(modId);
    if (!isCurrent()) { stop(); return; }
    if (!success) {
      stop();
      window.api.mods.subscribe(modId).catch((err) => {
        showToast(`Failed to subscribe: ${err.message}`, "#ff5a5f", "alert");
      });
      showToast(`Opening Steam for ${modName}`, "#2ec4b6", "download");
      if (entry.statusLabel) {
        entry.statusLabel.textContent = "Subscribing...";
        entry.statusLabel.style.color = "var(--accent)";
      }
      return;
    }

    showToast(`Syncing ${modName} via Steam protocol`, "#2ec4b6", "download");

    entry.lastStatusText = "0% Syncing...";

    if (entry.statusLabel) {
      entry.statusLabel.textContent = "0% Syncing...";
      entry.statusLabel.style.color = "var(--accent)";
    }

    const MAX_POLL_RETRIES = 300;
    entry.pollInProgress = false;
    entry.pollInterval = setInterval(() => {
      if (!isCurrent()) { stop(); return; }
      if (entry.pollInProgress) return;
      entry.pollInProgress = true;
      void (async () => {
      try {
        const currentEntry = state.activeDownloads.get(modId);
        if (currentEntry !== entry) { stop(); return; }

        let pct = 0;
        const info = await window.api.steamworks.downloadInfo(modId);
        if (!isCurrent()) { stop(); return; }
        if (info && info.total > 0) {
          pct = Math.floor(info.progress * 100);
        }

        const { missingMods } = await window.api.game.checkRequired([
          { id: modId },
        ]);
        if (!isCurrent()) { stop(); return; }
        const isPhysicallyReady = missingMods.length === 0;

        if (!isPhysicallyReady) {
          currentEntry.pollRetries++;
          if (currentEntry.pollRetries >= MAX_POLL_RETRIES) {
            stop();
            if (
              currentEntry.statusLabel &&
              currentEntry.statusLabel.isConnected
            ) {
              currentEntry.statusLabel.textContent = "Sync Timeout";
              currentEntry.statusLabel.style.color = "#ff5a5f";
            }
            return;
          }
          if (pct > 0) {
            currentEntry.lastStatusText = `${pct}% Syncing...`;
          } else {
            currentEntry.lastStatusText = "Syncing...";
          }
          if (
            currentEntry.statusLabel &&
            currentEntry.statusLabel.isConnected
          ) {
            currentEntry.statusLabel.textContent = currentEntry.lastStatusText;
            currentEntry.statusLabel.style.color = "var(--accent)";
          }
        } else {
          stop();
          if (
            currentEntry.statusLabel &&
            currentEntry.statusLabel.isConnected
          ) {
            currentEntry.statusLabel.innerHTML = '<app-icon name="check" role="img" aria-label="Installed"></app-icon>';
            currentEntry.statusLabel.className = "mod-pill-status installed";
            currentEntry.statusLabel.style.color = ""; // Let CSS handle color

            const pillActions = currentEntry.statusLabel.parentElement;
            if (pillActions) {
              const btn = pillActions.querySelector("button");
              if (btn) btn.remove();

              const pillContainer = pillActions.parentElement;
              if (
                pillContainer &&
                pillContainer.classList.contains("mod-pill")
              ) {
                pillContainer.classList.remove("missing");
                pillContainer.classList.add("installed");
              }
            }
          }
          showToast(`${modName} download complete`, "#2ec4b6", "check");
          await refreshLocalModsCache();
        }
      } catch (err) {
        const currentEntry = state.activeDownloads.get(modId);
        if (currentEntry !== entry) { stop(); return; }
        currentEntry.pollRetries++;
        if (currentEntry.pollRetries >= MAX_POLL_RETRIES) {
          stop();
          console.error("Steam sync polling error:", err);
        }
      } finally {
        entry.pollInProgress = false;
      }
      })();
    }, 1000);
  } catch (err) {
    console.error(err);
    const owned = isCurrent();
    stop();
    if (owned && entry.statusLabel?.isConnected) {
      entry.statusLabel.textContent = "Sync failed";
      entry.statusLabel.style.color = "#ff5a5f";
    }
  }
}

export function getFlatListFromTree(tree) {
  const list = [];
  const seen = new Set();
  function traverse(node) {
    if (!node || !node.id) return;
    if (!seen.has(node.id)) {
      seen.add(node.id);
      list.push({ id: node.id, name: node.name });
    }
    for (const child of node.children || []) traverse(child);
  }
  traverse(tree);
  return list;
}

export function buildDependencyTree(container, node, prefix, installedSet) {
  if (!node || !node.id) return;
  (node.children || []).forEach((child, idx) => {
    if (!child || !child.id) return;
    const isLast = idx === node.children.length - 1;
    const childPrefix = prefix + (isLast ? "  └─ " : "  ├─ ");
    const nextPrefix = prefix + (isLast ? "     " : "  │  ");

    const childInstalled = installedSet.has(child.id);
    let statusIcon = childInstalled ? "check" : "x";
    let statusLabel = childInstalled ? "Installed" : "Not confirmed installed";
    let statusColor = childInstalled ? "var(--accent-green)" : "#ff5a5f";
    let extraInfo = "";

    if (child.error) {
      statusIcon = "alert";
      statusLabel = "Error";
      statusColor = "#ff5a5f";
      extraInfo = `<span style="color:#ff5a5f;font-size:0.7rem;"> [Error: ${escapeHtml(child.error)}]</span>`;
    } else if (child.truncated) {
      statusIcon = "alert";
      statusLabel = "Max depth reached";
      statusColor = "#ffb703";
      extraInfo = `<span style="color:#ffb703;font-size:0.7rem;"> [Max depth reached]</span>`;
    } else if (child.circular) {
      statusIcon = "refresh";
      statusLabel = "Circular reference";
      statusColor = "#ffb703";
      extraInfo = `<span style="color:#ffb703;font-size:0.7rem;"> [Circular reference]</span>`;
    }

    const line = document.createElement("div");
    line.style.fontFamily = "'Share Tech Mono', monospace";
    line.style.fontSize = "0.8rem";
    line.style.padding = "2px 0";
    line.style.color = statusColor;
    line.innerHTML = `${childPrefix}<app-icon name="${statusIcon}" role="img" aria-label="${statusLabel}"></app-icon> ${escapeHtml(child.name || `Mod ${child.id}`)} <span style="color:var(--text-muted);font-size:0.7rem;">(${escapeHtml(String(child.id))})</span>${extraInfo}`;
    container.appendChild(line);

    if (child.children && child.children.length > 0 && !child.error) {
      buildDependencyTree(container, child, nextPrefix, installedSet);
    }
  });
}

export async function initModManager() {
  document
    .getElementById("refreshModsBtn")
    .addEventListener("click", () => loadInstalledMods({ force: true }));

  document
    .getElementById("checkDepsBtn")
    .addEventListener("click", async () => {
      const depsContainer = document.getElementById("dependencyTreeContainer");
      depsContainer.style.display = "block";
      depsContainer.innerHTML =
        "<div style=\"color:var(--accent);font-family:'Share Tech Mono',monospace;padding:15px;\">Resolving Dependency Trees...</div>";

      await refreshLocalModsCache();
      if (state.localMods.length === 0) {
        depsContainer.innerHTML =
          '<div style="color:var(--text-dim);padding:15px;">No Mods To Analyze.</div>';
        return;
      }

      try {
        const trees = await window.api.deps.resolveBatch(
          state.localMods.map((m) => m.id),
        );
        depsContainer.replaceChildren();

        const missingDepsSet = new Set();
        let hasErrors = false;
        const installedSet = state.localModsSet;

        trees.forEach((tree) => {
          if (!tree || !tree.id) return;
          if (tree.error || tree.truncated || tree.circular) hasErrors = true;
          const card = document.createElement("div");
          card.style.background = "var(--bg-card)";
          card.style.border = "1px solid var(--border)";
          card.style.borderRadius = "6px";
          card.style.padding = "12px 16px";
          card.style.marginBottom = "8px";

          const flatList = getFlatListFromTree(tree);
          const missingChildren = flatList.filter(
            (c) => c.id !== tree.id && !installedSet.has(c.id),
          );

          let statusIndicator = "";
          let statusColor = "";
          let depsText = `${tree.children.length} Dep${tree.children.length !== 1 ? "s" : ""}`;
          if (tree.error) {
            statusColor = "#ff5a5f";
            statusIndicator = `<app-icon name="alert" aria-hidden="true"></app-icon> API error`;
            depsText = "Failed";
          } else if (tree.truncated) {
            statusColor = "#ffb703";
            statusIndicator = `<app-icon name="alert" aria-hidden="true"></app-icon> Truncated (max depth)`;
          } else if (tree.circular) {
            statusColor = "#ffb703";
            statusIndicator = `<app-icon name="refresh" aria-hidden="true"></app-icon> Circular ref`;
          } else if (missingChildren.length > 0) {
            statusColor = "#ff5a5f";
            statusIndicator = `${missingChildren.length} Missing`;
          } else {
            statusColor = "var(--accent-green)";
            statusIndicator = `<app-icon name="check" aria-hidden="true"></app-icon> OK`;
          }

          const header = document.createElement("div");
          header.style.display = "flex";
          header.style.justifyContent = "space-between";
          header.style.alignItems = "center";
          header.style.cursor =
            tree.children.length > 0 || tree.error ? "pointer" : "default";
          header.innerHTML = `
          <div style="font-weight:600;color:var(--text-main);font-size:0.9rem;">
            ${escapeHtml(tree.name || `Mod ${tree.id}`)}
            <span style="color:var(--text-muted);font-weight:400;font-size:0.75rem;margin-left:8px;">(${escapeHtml(String(tree.id))})</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:0.75rem;color:var(--text-muted);font-family:'Share Tech Mono',monospace;">${depsText}</span>
            <span style="font-size:0.75rem;color:${statusColor};font-weight:700;">${statusIndicator}</span>
          </div>
        `;
          card.appendChild(header);

          if (tree.children.length > 0 && !tree.error) {
            const treeDiv = document.createElement("div");
            treeDiv.style.marginTop = "10px";
            treeDiv.style.display = "none";
            buildDependencyTree(treeDiv, tree, "", installedSet);
            card.appendChild(treeDiv);

            header.addEventListener("click", () => {
              const isVisible = treeDiv.style.display !== "none";
              treeDiv.style.display = isVisible ? "none" : "block";
            });
          }

          depsContainer.appendChild(card);

          missingChildren.forEach((c) => {
            missingDepsSet.add(c.id);
          });
        });

        const totalMissingDeps = missingDepsSet.size;

        if (totalMissingDeps > 0) {
          const warningBanner = document.createElement("div");
          warningBanner.style.marginTop = "12px";
          warningBanner.style.padding = "10px 15px";
          warningBanner.style.background = "rgba(255,90,95,0.1)";
          warningBanner.style.border = "1px solid #ff5a5f";
          warningBanner.style.borderRadius = "4px";
          warningBanner.style.color = "#ff5a5f";
          warningBanner.style.fontSize = "0.85rem";
          warningBanner.style.fontWeight = "700";
          warningBanner.innerHTML = `<app-icon name="alert" aria-hidden="true"></app-icon> ${totalMissingDeps} Missing transitive dependencies detected — Subscribe via Workshop to resolve`;
          depsContainer.insertBefore(warningBanner, depsContainer.firstChild);
        }

        if (!hasErrors && totalMissingDeps === 0) {
          const okBanner = document.createElement("div");
          okBanner.style.marginTop = "12px";
          okBanner.style.padding = "10px 15px";
          okBanner.style.background = "rgba(46,196,182,0.1)";
          okBanner.style.border = "1px solid var(--accent-green)";
          okBanner.style.borderRadius = "4px";
          okBanner.style.color = "var(--accent-green)";
          okBanner.style.fontSize = "0.85rem";
          okBanner.style.fontWeight = "700";
          okBanner.style.fontFamily = "'Share Tech Mono', monospace";
          okBanner.innerHTML = `<app-icon name="check" aria-hidden="true"></app-icon> All dependencies satisfied`;
          depsContainer.insertBefore(okBanner, depsContainer.firstChild);

          setTimeout(() => {
            depsContainer.style.display = "none";
          }, 3000);
        }
      } catch (e) {
        depsContainer.innerHTML = `<div style="color:#ff5a5f;padding:15px;">Failed to resolve dependencies: ${escapeHtml(e.message)}</div>`;
        console.error("Dependency resolver error:", e);
      }
    });
}
