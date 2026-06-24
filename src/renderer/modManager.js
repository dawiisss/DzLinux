import { state } from "./state.js";
import { escapeHtml } from "./utils.js";
import { showToast, copyToClipboard } from "./feedback.js";

export async function refreshLocalModsCache() {
  try {
    state.localMods = await window.api.mods.getInstalled();
    state.localModsSet = new Set(state.localMods.map((m) => m.id));
  } catch (e) {
    console.error("Failed to update local mods cache", e);
    state.localMods = [];
    state.localModsSet = new Set();
  }
}

export async function loadInstalledMods() {
  const tbody = document.getElementById("installedModsListBody");
  tbody.innerHTML =
    '<tr><td colspan="6" class="empty-state-msg" style="padding: 30px;">SCANNING WORKSHOP STORAGE PIPELINE...</td></tr>';

  await refreshLocalModsCache();

  document.getElementById("totalModsCount").textContent =
    state.localMods.length;

  let totalSizeMB = 0;
  state.localMods.forEach((m) => (totalSizeMB += m.sizeMB));
  const totalSizeGB = Math.round((totalSizeMB / 1024) * 10) / 10;
  document.getElementById("totalModsSize").textContent = `${totalSizeGB} GB`;

  if (state.settings.modDirectory) {
    window.api.ui.getDiskSpace(state.settings.modDirectory).then((space) => {
      if (space) {
        const totalGB =
          Math.round((space.total / (1024 * 1024 * 1024)) * 10) / 10;
        const freeGB =
          Math.round((space.free / (1024 * 1024 * 1024)) * 10) / 10;
        document.getElementById("diskSpaceReadout").textContent =
          `${freeGB} GB FREE OF ${totalGB} GB`;

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
          `UNKNOWN DISK CAPACITY`;
      }
    });
  }

  if (state.localMods.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="empty-state-msg" style="padding: 30px;">NO INSTALLED WORKSHOP MODS DETECTED. DEFINE TARGET WORKSHOP FOLDER IN SETTINGS.</td></tr>';
    return;
  }

  tbody.innerHTML = "";
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
    if (mod.isCorrupted) {
      nameHTML += `<div style="font-weight: 700; color: #ff5a5f; margin-top: 4px; font-size: 0.8rem;">⚠️ CORRUPTED / MISSING FILES</div>`;
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
    idSpan.className = "ip-cell";
    idSpan.title = "Click to copy ID";
    idSpan.textContent = mod.id;
    idSpan.addEventListener("click", () => copyToClipboard(mod.id));
    tdId.appendChild(idSpan);

    const tdSize = document.createElement("td");
    tdSize.style.fontFamily = "'Share Tech Mono', monospace";
    tdSize.textContent =
      mod.sizeMB >= 1024
        ? `${(mod.sizeMB / 1024).toFixed(1)} GB`
        : `${mod.sizeMB.toFixed(0)} MB`;

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
    openFolderBtn.textContent = "OPEN FOLDER";
    openFolderBtn.addEventListener("click", () => {
      window.api.mods.openFolder(mod.id);
    });
    tdActions.appendChild(openFolderBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.style.padding = "6px 12px";
    deleteBtn.style.fontSize = "0.75rem";
    deleteBtn.textContent = "UNSUBSCRIBE";
    deleteBtn.addEventListener("click", async () => {
      deleteBtn.textContent = "REMOVING...";
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
        showToast(`${mod.name} UNSUBSCRIBED`, "#2ec4b6", "🗑️");
      } else {
        showToast("FAILED TO UNSUBSCRIBE", "#ff5a5f", "⚠️");
        deleteBtn.textContent = "UNSUBSCRIBE";
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
            <span style="font-size:1.3rem;">⚠️</span>
            <div>
              <div style="font-weight:700;color:#ffb703;font-size:0.9rem;">${count} MOD${count > 1 ? "S" : ""} OUTDATED — WORKSHOP MISMATCH DETECTED</div>
              <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">${names}${more}</div>
            </div>
          </div>
          <button id="updateAllMismatchBtn" class="btn" style="padding:6px 14px;font-size:0.8rem;white-space:nowrap;">⬇️ UPDATE ALL</button>
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
              btn.textContent = "UPDATING...";
              btn.disabled = true;
              for (const mod of result.outdatedMods) {
                showToast(`UPDATING ${mod.name}...`, "#ff9f1c", "⬇️");
                await window.api.steamworks.subscribe(mod.id);
                await new Promise((r) => setTimeout(r, 500));
              }
              btn.textContent = "⬇️ UPDATE ALL";
              btn.disabled = false;
              showToast("ALL OUTDATED MODS QUEUED FOR UPDATE", "#2ec4b6", "✓");
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
              warning.innerHTML = `⚠️ WORKSHOP MISMATCH (OUTDATED ${days > 0 ? days + " DAYS" : "RECENTLY"})`;
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
      statusLabel.textContent = existing.lastStatusText || "SYNCING...";
      statusLabel.style.color = "var(--accent)";
    }
    return;
  }

  try {
    const success = await window.api.steamworks.subscribe(modId);
    if (!success) {
      window.api.mods.subscribe(modId);
      showToast(`OPENING STEAM FOR ${modName}`, "#2ec4b6", "⬇️");
      if (statusLabel) {
        statusLabel.textContent = "SUBSCRIBING...";
        statusLabel.style.color = "var(--accent)";
      }
      return;
    }

    showToast(`SYNCING ${modName} VIA STEAM PROTOCOL`, "#2ec4b6", "⬇️");

    const entry = {
      modName,
      statusLabel,
      lastStatusText: "0% SYNCING...",
      pollRetries: 0,
      pollInterval: null,
    };
    state.activeDownloads.set(modId, entry);

    if (statusLabel) {
      statusLabel.textContent = "0% SYNCING...";
      statusLabel.style.color = "var(--accent)";
    }

    const MAX_POLL_RETRIES = 300;
    entry.pollInterval = setInterval(async () => {
      try {
        const currentEntry = state.activeDownloads.get(modId);
        if (!currentEntry) return; // already cleaned up

        let pct = 0;
        const info = await window.api.steamworks.downloadInfo(modId);
        if (info && info.total > 0) {
          pct = Math.floor(info.progress * 100);
        }

        const { missingMods } = await window.api.game.checkRequired([
          { id: modId },
        ]);
        const isPhysicallyReady = missingMods.length === 0;

        if (!isPhysicallyReady) {
          currentEntry.pollRetries++;
          if (currentEntry.pollRetries >= MAX_POLL_RETRIES) {
            clearInterval(currentEntry.pollInterval);
            state.activeDownloads.delete(modId);
            if (
              currentEntry.statusLabel &&
              currentEntry.statusLabel.isConnected
            ) {
              currentEntry.statusLabel.textContent = "SYNC TIMEOUT";
              currentEntry.statusLabel.style.color = "#ff5a5f";
            }
            return;
          }
          if (pct > 0) {
            currentEntry.lastStatusText = `${pct}% SYNCING...`;
          } else {
            currentEntry.lastStatusText = "SYNCING...";
          }
          if (
            currentEntry.statusLabel &&
            currentEntry.statusLabel.isConnected
          ) {
            currentEntry.statusLabel.textContent = currentEntry.lastStatusText;
            currentEntry.statusLabel.style.color = "var(--accent)";
          }
        } else {
          clearInterval(currentEntry.pollInterval);
          state.activeDownloads.delete(modId);
          if (
            currentEntry.statusLabel &&
            currentEntry.statusLabel.isConnected
          ) {
            currentEntry.statusLabel.textContent = "✓ READY (REFRESH REQ)";
            currentEntry.statusLabel.style.color = "var(--accent-green)";
          }
          showToast(`${modName} DOWNLOAD COMPLETE`, "#2ec4b6", "✓");
          await refreshLocalModsCache();
        }
      } catch (err) {
        const currentEntry = state.activeDownloads.get(modId);
        if (!currentEntry) return;
        currentEntry.pollRetries++;
        if (currentEntry.pollRetries >= MAX_POLL_RETRIES) {
          clearInterval(currentEntry.pollInterval);
          state.activeDownloads.delete(modId);
          console.error("Steam sync polling error:", err);
        }
      }
    }, 1000);
  } catch (err) {
    console.error(err);
    state.activeDownloads.delete(modId);
  }
}

export function getFlatListFromTree(tree) {
  const list = [];
  function traverse(node) {
    if (!node || !node.id) return;
    if (!list.some((l) => l.id === node.id)) {
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
    let statusIcon = childInstalled ? "✓" : "✗";
    let statusColor = childInstalled ? "var(--accent-green)" : "#ff5a5f";
    let extraInfo = "";

    if (child.error) {
      statusIcon = "⚠";
      statusColor = "#ff5a5f";
      extraInfo = `<span style="color:#ff5a5f;font-size:0.7rem;"> [ERROR: ${escapeHtml(child.error)}]</span>`;
    } else if (child.truncated) {
      statusIcon = "…";
      statusColor = "#ffb703";
      extraInfo = `<span style="color:#ffb703;font-size:0.7rem;"> [MAX DEPTH REACHED]</span>`;
    } else if (child.circular) {
      statusIcon = "↻";
      statusColor = "#ffb703";
      extraInfo = `<span style="color:#ffb703;font-size:0.7rem;"> [CIRCULAR REFERENCE]</span>`;
    }

    const line = document.createElement("div");
    line.style.fontFamily = "'Share Tech Mono', monospace";
    line.style.fontSize = "0.8rem";
    line.style.padding = "2px 0";
    line.style.color = statusColor;
    line.innerHTML = `${childPrefix}${statusIcon} ${escapeHtml(child.name || `Mod ${child.id}`)} <span style="color:var(--text-muted);font-size:0.7rem;">(${escapeHtml(String(child.id))})</span>${extraInfo}`;
    container.appendChild(line);

    if (child.children && child.children.length > 0 && !child.error) {
      buildDependencyTree(container, child, nextPrefix, installedSet);
    }
  });
}

export async function initModManager() {
  document
    .getElementById("refreshModsBtn")
    .addEventListener("click", loadInstalledMods);

  document
    .getElementById("checkDepsBtn")
    .addEventListener("click", async () => {
      const depsContainer = document.getElementById("dependencyTreeContainer");
      depsContainer.style.display = "block";
      depsContainer.innerHTML =
        "<div style=\"color:var(--accent);font-family:'Share Tech Mono',monospace;padding:15px;\">RESOLVING DEPENDENCY TREES...</div>";

      await refreshLocalModsCache();
      if (state.localMods.length === 0) {
        depsContainer.innerHTML =
          '<div style="color:var(--text-dim);padding:15px;">NO MODS TO ANALYZE.</div>';
        return;
      }

      try {
        const trees = await window.api.deps.resolveBatch(
          state.localMods.map((m) => m.id),
        );
        depsContainer.innerHTML = "";

        let totalMissingDeps = 0;
        let hasErrors = false;
        const installedSet = new Set(state.localMods.map((m) => m.id));

        trees.forEach((tree) => {
          if (!tree || !tree.id) return;
          if (tree.error || tree.truncated || tree.circular) hasErrors = true;
          const card = document.createElement("div");
          card.style.background = "rgba(0,0,0,0.3)";
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
          let depsText = `${tree.children.length} DEP${tree.children.length !== 1 ? "S" : ""}`;
          if (tree.error) {
            statusColor = "#ff5a5f";
            statusIndicator = `⚠️ API ERROR`;
            depsText = "FAILED";
          } else if (tree.truncated) {
            statusColor = "#ffb703";
            statusIndicator = `… TRUNCATED (MAX DEPTH)`;
          } else if (tree.circular) {
            statusColor = "#ffb703";
            statusIndicator = `↻ CIRCULAR REF`;
          } else if (missingChildren.length > 0) {
            statusColor = "#ff5a5f";
            statusIndicator = `${missingChildren.length} MISSING`;
          } else {
            statusColor = "var(--accent-green)";
            statusIndicator = "✓ OK";
          }

          const header = document.createElement("div");
          header.style.display = "flex";
          header.style.justifyContent = "space-between";
          header.style.alignItems = "center";
          header.style.cursor =
            tree.children.length > 0 || tree.error ? "pointer" : "default";
          header.innerHTML = `
          <div style="font-weight:600;color:#fff;font-size:0.9rem;">
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

          missingChildren.forEach(() => {
            if (!totalMissingDeps) totalMissingDeps = 0;
            totalMissingDeps++;
          });
        });

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
          warningBanner.innerHTML = `⚠️ ${totalMissingDeps} MISSING TRANSITIVE DEPENDENCIES DETECTED — SUBSCRIBE VIA WORKSHOP TO RESOLVE`;
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
          okBanner.innerHTML = "✓ ALL DEPENDENCIES SATISFIED";
          depsContainer.insertBefore(okBanner, depsContainer.firstChild);

          setTimeout(() => {
            depsContainer.style.display = "none";
          }, 3000);
        }
      } catch (e) {
        depsContainer.innerHTML = `<div style="color:#ff5a5f;padding:15px;">FAILED TO RESOLVE DEPENDENCIES: ${escapeHtml(e.message)}</div>`;
        console.error("Dependency resolver error:", e);
      }
    });
}
