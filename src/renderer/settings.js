import { state } from "./state.js";
import { showToast, showConfirmModal } from "./feedback.js";
import { applyServerListMode, applyLayoutMode } from "./theme.js";
import { applyTabVisibility } from "./ui-behavior.js";
import { startCountdown } from "./serverBrowser.js";
import { updateLaunchOptionAvailability } from "./launchOptions.js";

export async function initSettings() {
  const settings = state.settings;
  const setDxvkThreads = (value) => {
    const select = document.getElementById("dxvkThreads");
    const selected = String(value ?? "0");
    if (!Array.from(select.options).some((option) => option.value === selected)) {
      const option = document.createElement("option");
      option.value = selected;
      option.textContent = `${selected} Threads (configured)`;
      select.appendChild(option);
    }
    select.value = selected;
  };

  const queryConcurrencyInput = document.getElementById("queryConcurrency");
  const normalizeQueryConcurrency = () => {
    const parsed = Number.parseInt(queryConcurrencyInput.value, 10);
    if (!Number.isFinite(parsed) || parsed < 10) {
      queryConcurrencyInput.value = "150";
    } else if (parsed > 500) {
      queryConcurrencyInput.value = "500";
    }
  };

  queryConcurrencyInput.addEventListener("input", () => {
    const parsed = Number.parseInt(queryConcurrencyInput.value, 10);
    if (Number.isFinite(parsed) && parsed > 500) {
      queryConcurrencyInput.value = "500";
    }
  });
  queryConcurrencyInput.addEventListener("change", normalizeQueryConcurrency);

  document.getElementById("playerName").value = settings.playerName || "";
  const launchParamsInput = document.getElementById("launchParams");
  launchParamsInput.value = settings.launchParams || "";
  document.getElementById("modDirectory").value = settings.modDirectory || "";
  document.getElementById("autoRefreshEnabled").value =
    settings.autoRefreshEnabled ? "true" : "false";
  document.getElementById("autoRefreshTime").value =
    settings.autoRefreshTime || 180;
  document.getElementById("watchlistRefreshEnabled").value =
    settings.watchlistRefreshEnabled !== false ? "true" : "false";
  document.getElementById("watchlistRefreshTime").value =
    settings.watchlistRefreshTime || 10;
  document.getElementById("serverListPageSize").value =
    settings.serverListPageSize || 50;
  queryConcurrencyInput.value =
    settings.queryConcurrency || 150;
  document.getElementById("serverListMode").value =
    settings.serverListMode || "compact";
  applyServerListMode(settings.serverListMode || "compact");

  document.getElementById("themeSelect").value =
    settings.theme || "tactical-dark";
  document.getElementById("layoutModeSelect").value =
    settings.layoutMode || "modern";
  document.getElementById("listModeSelect").value =
    settings.listMode || "paging";
  document.getElementById("audioFeedback").value =
    settings.audioFeedback !== false ? "true" : "false";
  const watchlistCheckbox = document.getElementById("enableWatchlist");
  if (watchlistCheckbox) {
    watchlistCheckbox.checked =
      settings.enableWatchlist !== false && settings.showWatchlistTab !== false;
  }
  document.getElementById("showDiagnosticsTab").checked =
    settings.showDiagnosticsTab !== false;
  const historyCheckbox = document.getElementById("enableHistory");
  if (historyCheckbox) {
    historyCheckbox.checked =
      settings.enableHistory !== false && settings.showHistoryTab !== false;
  }
  const trustScoreCheckbox = document.getElementById("enableTrustScore");
  if (trustScoreCheckbox) {
    trustScoreCheckbox.checked = settings.enableTrustScore !== false;
  }
  document.getElementById("flagMangoHud").checked =
    settings.mangoHudEnabled === true;

  document.getElementById("dxvkAsyncEnabled").checked =
    settings.dxvkAsyncEnabled !== false;
  setDxvkThreads(settings.dxvkThreads);
  document.getElementById("disableProtonLogs").checked =
    settings.disableProtonLogs !== false;
  const gmCheckbox = document.getElementById("enableGameMode");
  const protonSelect = document.getElementById("protonPath");
  let gameModeAvailable = true;
  const updateLaunchControls = () =>
    updateLaunchOptionAvailability(protonSelect.value, gameModeAvailable);
  protonSelect.addEventListener("change", updateLaunchControls);
  updateLaunchControls();
  gmCheckbox.checked = settings.enableGameMode === true;
  window.api.game
    .checkGameMode()
    .then((hasGameMode) => {
      gameModeAvailable = hasGameMode;
      updateLaunchControls();
    })
    .catch((err) => {
      console.error("GameMode check failed:", err);
    });
  document.getElementById("nativeWayland").checked =
    settings.nativeWayland === true;
  document.getElementById("mallocSystem").checked =
    settings.mallocSystem !== false;
  document.getElementById("maxMem").value =
    settings.maxMem !== undefined && settings.maxMem !== null
      ? String(settings.maxMem)
      : "16000";
  document.getElementById("mallocTrim").checked = settings.mallocTrim !== false;
  document.getElementById("noEsync").checked = settings.noEsync === true;
  document.getElementById("mangoHudConfig").value =
    settings.mangoHudConfig || "";
  document.getElementById("dxvkConfig").value = settings.dxvkConfig || "";

  const flagNoSplash = document.getElementById("flagNoSplash");
  const flagNoPause = document.getElementById("flagNoPause");
  const flagCpuCount = document.getElementById("flagCpuCount");
  const flagExThreads = document.getElementById("flagExThreads");

  const parseLaunchParamsToUI = () => {
    const val = launchParamsInput.value;
    flagNoSplash.checked = val.includes("-nosplash");
    flagNoPause.checked = val.includes("-noPause");

    const cpuMatch = val.match(/-cpuCount=(\d+)/);
    if (cpuMatch) flagCpuCount.value = cpuMatch[1];
    else flagCpuCount.value = "";

    const exMatch = val.match(/-exThreads=(\d+)/);
    if (exMatch) flagExThreads.value = exMatch[1];
    else flagExThreads.value = "";
  };

  const updateLaunchParamsFromUI = () => {
    let params = launchParamsInput.value;

    const toggleParam = (str, shouldAdd) => {
      params = params.replace(new RegExp(`\\s*${str}\\b`, "g"), "");
      if (shouldAdd) params += ` ${str}`;
    };

    toggleParam("-nosplash", flagNoSplash.checked);
    toggleParam("-noPause", flagNoPause.checked);

    params = params.replace(/\s*-cpuCount=[^\s]+/g, "");
    if (flagCpuCount.value) params += ` -cpuCount=${flagCpuCount.value}`;

    params = params.replace(/\s*-exThreads=[^\s]+/g, "");
    if (flagExThreads.value) params += ` -exThreads=${flagExThreads.value}`;

    launchParamsInput.value = params.trim().replace(/\s+/g, " ");
  };

  [flagNoSplash, flagNoPause, flagCpuCount, flagExThreads].forEach((el) => {
    el.addEventListener("input", updateLaunchParamsFromUI);
  });
  launchParamsInput.addEventListener("input", parseLaunchParamsToUI);

  parseLaunchParamsToUI();

  // Refresh the selector without discarding a configured custom path.
  const populateProtonVersions = async (refresh = false) => {
    const selected = refresh ? protonSelect.value : settings.protonPath || "default";
    const versions = await window.api.game.scanProton(refresh);
    const select = protonSelect;
    while (select.options.length > 1) select.remove(1);
    versions.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.path;
      opt.textContent = v.name;
      select.appendChild(opt);
    });
    if (selected !== "default" && !versions.some(v => v.path === selected)) {
      const opt = document.createElement("option");
      opt.value = selected;
      opt.textContent = `Configured Proton: ${selected}`;
      select.appendChild(opt);
    }
    select.value = selected;
    updateLaunchControls();
  };
  try {
    await populateProtonVersions();
  } catch (e) {
    console.error(e);
  }
  document.getElementById("rescanProtonBtn").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await populateProtonVersions(true);
      showToast("Proton versions refreshed", "#2ec4b6", "refresh");
    } catch (err) {
      showToast(`Could not scan Proton versions: ${err.message}`, "#ff5a5f", "alert");
    } finally {
      button.disabled = false;
    }
  });

  const COLLECTION_OWNED_KEYS = new Set([
    "favorites",
    "favoritesSchemaVersion",
    "favoritesRevision",
    "favoriteGroups",
    "favoriteNames",
    "favoritePorts",
    "watchlist",
    "history",
  ]);

  const collectFormPreferencePatch = () => {
    const watchlistEl = document.getElementById("enableWatchlist");
    const watchlistEnabled = watchlistEl ? watchlistEl.checked : true;
    const historyEl = document.getElementById("enableHistory");
    const historyEnabled = historyEl ? historyEl.checked : true;
    const trustEl = document.getElementById("enableTrustScore");
    return {
      playerName: document.getElementById("playerName").value,
      launchParams: document.getElementById("launchParams").value,
      modDirectory: document.getElementById("modDirectory").value,
      autoRefreshEnabled:
        document.getElementById("autoRefreshEnabled").value === "true",
      autoRefreshTime:
        parseInt(document.getElementById("autoRefreshTime").value, 10) || 180,
      theme: document.getElementById("themeSelect").value,
      layoutMode: document.getElementById("layoutModeSelect").value,
      listMode: document.getElementById("listModeSelect").value,
      audioFeedback: document.getElementById("audioFeedback").value === "true",
      showWatchlistTab: watchlistEnabled,
      enableWatchlist: watchlistEnabled,
      showDiagnosticsTab: document.getElementById("showDiagnosticsTab").checked,
      showHistoryTab: historyEnabled,
      enableHistory: historyEnabled,
      enableTrustScore: trustEl ? trustEl.checked : true,
      protonPath: document.getElementById("protonPath").value,
      mangoHudEnabled: document.getElementById("flagMangoHud").checked,
      dxvkAsyncEnabled: document.getElementById("dxvkAsyncEnabled").checked,
      dxvkThreads: document.getElementById("dxvkThreads").value,
      disableProtonLogs: document.getElementById("disableProtonLogs").checked,
      enableGameMode: document.getElementById("enableGameMode").checked,
      nativeWayland: document.getElementById("nativeWayland").checked,
      mallocSystem: document.getElementById("mallocSystem").checked,
      maxMem: document.getElementById("maxMem").value,
      mallocTrim: document.getElementById("mallocTrim").checked,
      noEsync: document.getElementById("noEsync").checked,
      mangoHudConfig: document.getElementById("mangoHudConfig").value,
      dxvkConfig: document.getElementById("dxvkConfig").value,
      serverListPageSize:
        parseInt(document.getElementById("serverListPageSize").value, 10) || 50,
      queryConcurrency: Math.min(
        500,
        Math.max(
          10,
          parseInt(document.getElementById("queryConcurrency").value, 10) || 150,
        ),
      ),
      serverListMode: document.getElementById("serverListMode").value,
      watchlistRefreshEnabled:
        document.getElementById("watchlistRefreshEnabled").value === "true",
      watchlistRefreshTime:
        parseInt(document.getElementById("watchlistRefreshTime").value, 10) || 10,
      modLoadouts: JSON.parse(JSON.stringify(state.modLoadouts || {})),
    };
  };

  const applyFieldValueToDOM = (key, val) => {
    switch (key) {
      case "playerName":
        document.getElementById("playerName").value = val || "";
        break;
      case "launchParams":
        launchParamsInput.value = val || "";
        parseLaunchParamsToUI();
        break;
      case "modDirectory":
        document.getElementById("modDirectory").value = val || "";
        break;
      case "autoRefreshEnabled":
        document.getElementById("autoRefreshEnabled").value = val ? "true" : "false";
        break;
      case "autoRefreshTime":
        document.getElementById("autoRefreshTime").value = String(val || 180);
        break;
      case "watchlistRefreshEnabled":
        document.getElementById("watchlistRefreshEnabled").value =
          val !== false ? "true" : "false";
        break;
      case "watchlistRefreshTime":
        document.getElementById("watchlistRefreshTime").value = String(val || 10);
        break;
      case "serverListPageSize":
        document.getElementById("serverListPageSize").value = String(val || 50);
        break;
      case "queryConcurrency":
        queryConcurrencyInput.value = String(val || 150);
        break;
      case "serverListMode":
        document.getElementById("serverListMode").value = val || "compact";
        break;
      case "theme":
        document.getElementById("themeSelect").value = val || "tactical-dark";
        break;
      case "layoutMode":
        document.getElementById("layoutModeSelect").value = val || "modern";
        break;
      case "listMode":
        document.getElementById("listModeSelect").value = val || "paging";
        break;
      case "audioFeedback":
        document.getElementById("audioFeedback").value =
          val !== false ? "true" : "false";
        break;
      case "enableWatchlist":
      case "showWatchlistTab":
        if (watchlistCheckbox) {
          watchlistCheckbox.checked = val !== false;
        }
        break;
      case "showDiagnosticsTab":
        document.getElementById("showDiagnosticsTab").checked = val !== false;
        break;
      case "enableHistory":
      case "showHistoryTab":
        if (historyCheckbox) {
          historyCheckbox.checked = val !== false;
        }
        break;
      case "enableTrustScore":
        if (trustScoreCheckbox) {
          trustScoreCheckbox.checked = val !== false;
        }
        break;
      case "protonPath":
        protonSelect.value = val || "default";
        updateLaunchControls();
        break;
      case "mangoHudEnabled":
        document.getElementById("flagMangoHud").checked = val === true;
        break;
      case "dxvkAsyncEnabled":
        document.getElementById("dxvkAsyncEnabled").checked = val !== false;
        break;
      case "dxvkThreads":
        setDxvkThreads(val);
        break;
      case "disableProtonLogs":
        document.getElementById("disableProtonLogs").checked = val !== false;
        break;
      case "enableGameMode":
        gmCheckbox.checked = val === true;
        break;
      case "nativeWayland":
        document.getElementById("nativeWayland").checked = val === true;
        break;
      case "mallocSystem":
        document.getElementById("mallocSystem").checked = val !== false;
        break;
      case "maxMem":
        document.getElementById("maxMem").value =
          val !== undefined && val !== null ? String(val) : "";
        break;
      case "mallocTrim":
        document.getElementById("mallocTrim").checked = val !== false;
        break;
      case "noEsync":
        document.getElementById("noEsync").checked = val === true;
        break;
      case "mangoHudConfig":
        document.getElementById("mangoHudConfig").value = val || "";
        break;
      case "dxvkConfig":
        document.getElementById("dxvkConfig").value = val || "";
        break;
      case "modLoadouts":
        state.modLoadouts = JSON.parse(JSON.stringify(val || {}));
        break;
      default:
        break;
    }
  };

  let editRevision = 0;
  let lastKnownPatch = collectFormPreferencePatch();
  const fieldRevisions = {};
  for (const key of Object.keys(lastKnownPatch)) {
    fieldRevisions[key] = 0;
  }

  const valuesEqual = (a, b) =>
    typeof a === "object" || typeof b === "object"
      ? JSON.stringify(a) === JSON.stringify(b)
      : a === b;

  const recordFormEdits = (forceIncrement = false) => {
    const current = collectFormPreferencePatch();
    const changedKeys = Object.keys(current).filter(
      (key) => !valuesEqual(current[key], lastKnownPatch[key]),
    );
    if (changedKeys.length > 0 || forceIncrement) {
      editRevision++;
      for (const key of changedKeys) {
        fieldRevisions[key] = editRevision;
      }
      lastKnownPatch = current;
    }
    return current;
  };

  let pendingSave = null;
  let isProcessingSaves = false;
  let saveWaiters = [];
  let activeSavePromise = Promise.resolve();
  let saveEpoch = 0;
  let resetInProgress = false;
  let lastAppliedSettings = { ...settings };

  const applyCommittedSideEffects = (committed, prevCommitted) => {
    state.pagination.size = committed.serverListPageSize || 50;
    applyServerListMode(committed.serverListMode || "compact");
    applyTabVisibility(committed);
    applyLayoutMode(committed.layoutMode || "modern");

    const refreshKeysChanged =
      committed.autoRefreshEnabled !== prevCommitted.autoRefreshEnabled ||
      committed.autoRefreshTime !== prevCommitted.autoRefreshTime;
    if (refreshKeysChanged) {
      startCountdown();
    }
    document.dispatchEvent(new CustomEvent("dzlinux:render-servers"));
    lastAppliedSettings = { ...committed };
  };

  const processSaveQueue = async () => {
    if (isProcessingSaves) return;
    isProcessingSaves = true;
    let committedInRun = false;
    try {
      while (pendingSave) {
        const job = pendingSave;
        pendingSave = null;
        const prevCommitted = state.settings ? { ...state.settings } : {};

        if (!pendingSave) {
          state.pagination.size = job.patch.serverListPageSize;
          applyServerListMode(job.patch.serverListMode);
        }

        let writeOk = false;
        try {
          writeOk = Boolean(await window.api.settings.save(job.patch));
        } catch {
          writeOk = false;
        }
        if (job.epoch !== saveEpoch) continue;

        if (!writeOk) {
          const settled = saveWaiters.filter((w) => w.targetRevision <= job.revision);
          saveWaiters = saveWaiters.filter((w) => w.targetRevision > job.revision);
          for (const w of settled) {
            if (!w.silent) {
              showToast("Error committing settings", "#ff5a5f", "x");
            }
            w.resolve(false);
          }
          continue;
        }

        let persisted = null;
        let readbackOk = false;
        if (window.api.settings && typeof window.api.settings.load === "function") {
          try {
            persisted = await window.api.settings.load();
            readbackOk = Boolean(persisted && typeof persisted === "object");
          } catch (err) {
            console.error("Failed to reload settings after save:", err);
            readbackOk = false;
          }
        } else {
          persisted = { ...prevCommitted, ...job.patch };
          readbackOk = true;
        }
        if (job.epoch !== saveEpoch) continue;

        // Capture any edits made while save/readback was awaiting
        recordFormEdits();

        const nextSettings = { ...(state.settings || {}) };
        const sourceSnapshot = readbackOk && persisted ? persisted : job.patch;

        for (const [key, val] of Object.entries(sourceSnapshot)) {
          if (COLLECTION_OWNED_KEYS.has(key)) continue;
          // Runtime state follows committed values; newer form edits stay in the DOM.
          nextSettings[key] = val;
          if (Object.hasOwn(job.fieldRevisions, key)) {
            if ((fieldRevisions[key] || 0) <= job.fieldRevisions[key]) {
              lastKnownPatch[key] =
                typeof val === "object" && val !== null
                  ? JSON.parse(JSON.stringify(val))
                  : val;
              if (readbackOk) {
                applyFieldValueToDOM(key, val);
              }
            }
          }
        }
        // Preserve authoritative renderer collection snapshots
        if (Array.isArray(state.favorites)) {
          nextSettings.favorites = state.favorites;
        }
        state.settings = nextSettings;
        committedInRun = true;

        const settled = saveWaiters.filter((w) => w.targetRevision <= job.revision);
        saveWaiters = saveWaiters.filter((w) => w.targetRevision > job.revision);
        for (const w of settled) {
          if (!w.silent) {
            if (!readbackOk) {
              showToast(
                "Settings saved, but could not reload persisted values",
                "#ff9f1c",
                "alert",
              );
            } else {
              showToast("Settings committed to local storage", "#ff9f1c", "save");
            }
          }
          w.resolve(readbackOk);
        }
      }
    } finally {
      isProcessingSaves = false;
      if (committedInRun && !resetInProgress) {
        applyCommittedSideEffects(state.settings, lastAppliedSettings);
      }
    }
  };

  // Settings persistence
  const saveSettingsSilently = (silent) => {
    if (resetInProgress) return Promise.resolve(false);
    recordFormEdits(true);
    const targetRevision = editRevision;
    const patch = JSON.parse(JSON.stringify(lastKnownPatch));
    pendingSave = {
      epoch: saveEpoch,
      revision: targetRevision,
      patch,
      fieldRevisions: { ...fieldRevisions },
    };
    return new Promise((resolve) => {
      saveWaiters.push({ targetRevision, silent: Boolean(silent), resolve });
      if (!isProcessingSaves) activeSavePromise = processSaveQueue();
    });
  };

  document
    .getElementById("settings")
    .addEventListener("input", () => recordFormEdits());
  document
    .getElementById("settings")
    .addEventListener("change", () => saveSettingsSilently(true));
  document
    .getElementById("saveSettingsBtn")
    .addEventListener("click", () => saveSettingsSilently(false));

  document
    .getElementById("testProtonBtn")
    .addEventListener("click", async () => {
      const selectedPath = document.getElementById("protonPath").value;
      if (!selectedPath || selectedPath === "default") {
        showToast(
          "Using Steam default applaunch — no custom Proton path to test",
          "#ff9f1c",
          "info",
        );
        return;
      }
      const exists = await window.api.ui.checkPathExists(selectedPath);
      if (exists) {
        showToast(
          "Proton path verified — compatibility layer found",
          "#2ec4b6",
          "check",
        );
      } else {
        showToast(
          "Proton path not found. Check your compatibilitytools.d directory.",
          "#ff5a5f",
          "alert",
        );
      }
    });

  document
    .getElementById("resetSettingsBtn")
    .addEventListener("click", async () => {
      if (resetInProgress) return;
      const confirmed = await showConfirmModal(
        "Reset all Settings to Factory Defaults? This action cannot be undone.",
      );
      if (!confirmed || resetInProgress) return;

      resetInProgress = true;
      const resetButton = document.getElementById("resetSettingsBtn");
      resetButton.disabled = true;
      // Reset is a barrier in the same save pipeline: discard queued edits,
      // invalidate old readbacks, and let any already-dispatched write settle.
      saveEpoch++;
      pendingSave = null;
      const supersededWaiters = saveWaiters;
      saveWaiters = [];
      for (const waiter of supersededWaiters) waiter.resolve(false);
      try {
        await activeSavePromise;
        const defaultSettings = await window.api.settings.getDefaults();
        if (!defaultSettings) {
          showToast("Error retrieving settings defaults", "#ff5a5f", "x");
          return;
        }

        const success = await window.api.settings.save(defaultSettings);
        if (success) {
          let reloaded = null;
          if (window.api.settings && typeof window.api.settings.load === "function") {
            try {
              reloaded = await window.api.settings.load();
            } catch (err) {
              console.error("Failed to reload settings after reset:", err);
            }
          }
          const effective = reloaded && typeof reloaded === "object" ? reloaded : defaultSettings;
          const nextSettings = { ...(state.settings || {}), ...effective };
          if (Array.isArray(state.favorites)) {
            nextSettings.favorites = state.favorites;
          }
          state.settings = nextSettings;
          for (const key of Object.keys(lastKnownPatch)) {
            if (Object.hasOwn(effective, key)) {
              applyFieldValueToDOM(key, effective[key]);
              lastKnownPatch[key] = effective[key];
            }
          }
          if (!reloaded && window.api.settings && typeof window.api.settings.load === "function") {
            showToast(
              "Settings reset, but could not reload persisted values",
              "#ff9f1c",
              "alert",
            );
          }
          if (typeof location !== "undefined" && typeof location.reload === "function") {
            try {
              location.reload();
            } catch {}
          }
        } else {
          showToast("Error resetting settings", "#ff5a5f", "x");
        }
      } catch (err) {
        console.error("Failed to reset settings:", err);
        showToast("Error resetting settings", "#ff5a5f", "x");
      } finally {
        resetInProgress = false;
        resetButton.disabled = false;
      }
    });

  // Mod Loadouts
  state.modLoadouts = settings.modLoadouts || {};
  const loadoutSelect = document.getElementById("loadoutSelect");
  const loadoutNameInput = document.getElementById("loadoutNameInput");
  const saveLoadoutBtn = document.getElementById("saveLoadoutBtn");
  const deleteLoadoutBtn = document.getElementById("deleteLoadoutBtn");
  const quickLaunchBtn = document.getElementById("quickLaunchBtn");

  const updateLoadoutDropdown = () => {
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "-- Create New Loadout --";
    loadoutSelect.replaceChildren(defaultOpt);

    Object.keys(state.modLoadouts)
      .sort()
      .forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        loadoutSelect.appendChild(opt);
      });
  };

  updateLoadoutDropdown();

  loadoutSelect.addEventListener("change", () => {
    const selected = loadoutSelect.value;
    const checkboxes = document.querySelectorAll(".mod-select-checkbox");
    checkboxes.forEach((cb) => (cb.checked = false));

    if (selected) {
      loadoutNameInput.value = selected;
      deleteLoadoutBtn.style.display = "inline-block";
      const modsInLoadout = state.modLoadouts[selected] || [];
      checkboxes.forEach((cb) => {
        if (modsInLoadout.includes(cb.dataset.modId)) {
          cb.checked = true;
        }
      });
    } else {
      loadoutNameInput.value = "";
      deleteLoadoutBtn.style.display = "none";
    }
  });

  saveLoadoutBtn.addEventListener("click", async () => {
    const name = loadoutNameInput.value.trim();
    if (!name) {
      showToast("Please enter a loadout name", "#ff5a5f", "alert");
      return;
    }

    const selectedMods = Array.from(
      document.querySelectorAll(".mod-select-checkbox:checked"),
    ).map((cb) => cb.dataset.modId);
    state.modLoadouts[name] = selectedMods;

    state.settings.modLoadouts = state.modLoadouts;
    await saveSettingsSilently(true);
    updateLoadoutDropdown();
    loadoutSelect.value = name;
    deleteLoadoutBtn.style.display = "inline-block";

    showToast(`Loadout "${name}" saved`, "#2ec4b6", "save");
  });

  deleteLoadoutBtn.addEventListener("click", async () => {
    const name = loadoutSelect.value;
    if (name && state.modLoadouts[name]) {
      delete state.modLoadouts[name];
      state.settings.modLoadouts = state.modLoadouts;
      await saveSettingsSilently(true);
      updateLoadoutDropdown();
      loadoutNameInput.value = "";
      deleteLoadoutBtn.style.display = "none";

      const checkboxes = document.querySelectorAll(".mod-select-checkbox");
      checkboxes.forEach((cb) => (cb.checked = false));

      showToast(`Loadout "${name}" deleted`, "#ff5a5f", "trash");
    }
  });

  quickLaunchBtn.addEventListener("click", () => {
    const selectedMods = Array.from(
      document.querySelectorAll(".mod-select-checkbox:checked"),
    )
      .map((cb) => {
        return state.localMods.find((m) => m.id === cb.dataset.modId);
      })
      .filter(Boolean);

    showToast("Initializing direct launch from loadout...", "#2ec4b6", "play");
    window.api.game.launch("", "", selectedMods).catch((err) => {
      showToast(`Launch failed: ${err.message}`, "#ef233c", "alert");
    });
  });
}
