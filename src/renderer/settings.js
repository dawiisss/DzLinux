import { state } from "./state.js";
import { showToast, showConfirmModal } from "./feedback.js";
import { applyServerListMode } from "./theme.js";

export async function initSettings() {
  const settings = state.settings;

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
  document.getElementById("queryConcurrency").value =
    settings.queryConcurrency || 500;
  document.getElementById("serverListMode").value =
    settings.serverListMode || "compact";
  applyServerListMode(settings.serverListMode || "compact");

  document.getElementById("themeSelect").value =
    settings.theme || "tactical-dark";
  document.getElementById("layoutModeSelect").value =
    settings.layoutMode || "modern";
  document.getElementById("audioFeedback").value =
    settings.audioFeedback !== false ? "true" : "false";
  document.getElementById("showWatchlistTab").checked =
    settings.showWatchlistTab !== false;
  document.getElementById("showDiagnosticsTab").checked =
    settings.showDiagnosticsTab !== false;
  document.getElementById("flagMangoHud").checked =
    settings.mangoHudEnabled === true;

  document.getElementById("dxvkAsyncEnabled").checked =
    settings.dxvkAsyncEnabled !== false;
  document.getElementById("dxvkThreads").value = settings.dxvkThreads || "0";
  document.getElementById("disableProtonLogs").checked =
    settings.disableProtonLogs !== false;
  const gmCheckbox = document.getElementById("enableGameMode");
  gmCheckbox.checked = settings.enableGameMode === true;
  window.api.game.checkGameMode().then((hasGameMode) => {
    if (!hasGameMode) {
      gmCheckbox.disabled = true;
      gmCheckbox.checked = false;
      gmCheckbox.parentElement.style.opacity = "0.5";
      gmCheckbox.parentElement.title =
        "Feral GameMode is not installed on this system. Install 'gamemode' to use this feature.";
    }
  });
  document.getElementById("nativeWayland").checked =
    settings.nativeWayland === true;
  document.getElementById("mallocSystem").checked =
    settings.mallocSystem !== false;
  document.getElementById("maxMem").value = settings.maxMem || "16000";
  document.getElementById("mallocTrim").checked = settings.mallocTrim !== false;
  document.getElementById("noEsync").checked = settings.noEsync === true;

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

  // Proton Scanner
  try {
    const versions = await window.api.game.scanProton();
    const select = document.getElementById("protonPath");
    versions.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.path;
      opt.textContent = v.name;
      select.appendChild(opt);
    });
    if (settings.protonPath) {
      select.value = settings.protonPath;
    }
  } catch (e) {
    console.error(e);
  }

  // Settings persistence
  const saveSettingsSilently = async (silent = true) => {
    const newSettings = {
      ...state.settings,
      launchParams: document.getElementById("launchParams").value,
      modDirectory: document.getElementById("modDirectory").value,
      autoRefreshEnabled:
        document.getElementById("autoRefreshEnabled").value === "true",
      autoRefreshTime:
        parseInt(document.getElementById("autoRefreshTime").value) || 180,
      theme: document.getElementById("themeSelect").value,
      layoutMode: document.getElementById("layoutModeSelect").value,
      audioFeedback: document.getElementById("audioFeedback").value === "true",
      showWatchlistTab: document.getElementById("showWatchlistTab").checked,
      showDiagnosticsTab: document.getElementById("showDiagnosticsTab").checked,
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
        parseInt(document.getElementById("serverListPageSize").value) || 50,
      queryConcurrency:
        parseInt(document.getElementById("queryConcurrency").value) || 500,
      serverListMode: document.getElementById("serverListMode").value,
      watchlistRefreshEnabled:
        document.getElementById("watchlistRefreshEnabled").value === "true",
      watchlistRefreshTime:
        parseInt(document.getElementById("watchlistRefreshTime").value) || 10,
    };

    state.pagination.size = newSettings.serverListPageSize;
    applyServerListMode(newSettings.serverListMode);

    const success = await window.api.settings.save(newSettings);
    if (success) {
      state.settings = newSettings;

      // Update tab visibility dynamically
      const { applyTabVisibility } = await import("./ui-behavior.js");
      applyTabVisibility(newSettings);

      const { applyLayoutMode } = await import("./theme.js");
      applyLayoutMode(newSettings.layoutMode);

      // Restart countdown and watchlist polling with new settings
      const { startCountdown } = await import("./serverBrowser.js");
      const { startWatchlistPoll } = await import("./watchlist.js");
      startCountdown();
      startWatchlistPoll();
      if (!silent)
        showToast("Settings committed to local storage", "#ff9f1c", "💾");
    } else {
      if (!silent) showToast("Error committing settings", "#ff5a5f", "❌");
    }
  };

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
          "ℹ️",
        );
        return;
      }
      const exists = await window.api.ui.checkPathExists(selectedPath);
      if (exists) {
        showToast(
          "Proton path verified — compatibility layer found",
          "#2ec4b6",
          "✓",
        );
      } else {
        showToast(
          "Proton path not found. Check your compatibilitytools.d directory.",
          "#ff5a5f",
          "⚠️",
        );
      }
    });

  document
    .getElementById("resetSettingsBtn")
    .addEventListener("click", async () => {
      const confirmed = await showConfirmModal(
        "Reset all Settings to Factory Defaults? This action CANNOT be undone.",
      );
      if (!confirmed) return;

      const defaultSettings = {
        launchParams: "",
        steamUsername: "",
        modDirectory: "",
        favorites: [],
        history: [],
        theme: "tactical-dark",
        layoutMode: "modern",
        sidebarPinned: false,
        serverListMode: "compact",
        autoRefreshEnabled: false,
        protonPath: "default",
        queryConcurrency: 500,
        audioFeedback: true,
        showWatchlistTab: true,
        showDiagnosticsTab: true,
        dxvkAsyncEnabled: true,
        dxvkThreads: "0",
        disableProtonLogs: true,
        enableGameMode: false,
        nativeWayland: false,
        mallocSystem: true,
        maxMem: "16000",
        mallocTrim: true,
        noEsync: false,
        mangoHudConfig: "cpu_temp,gpu_temp,ram,fps,frame_timing",
        dxvkConfig: "",
      };

      const success = await window.api.settings.save(defaultSettings);
      if (success) {
        state.settings = defaultSettings;
        location.reload();
      } else {
        showToast("Error resetting settings", "#ff5a5f", "❌");
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
      showToast("Please enter a loadout name", "#ff5a5f", "⚠️");
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

    showToast(`Loadout "${name}" saved`, "#2ec4b6", "💾");
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

      showToast(`Loadout "${name}" deleted`, "#ff5a5f", "🗑️");
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

    showToast("Initializing direct launch from loadout...", "#2ec4b6", "🚀");
    window.api.game.launch("", "", selectedMods);
  });
}
