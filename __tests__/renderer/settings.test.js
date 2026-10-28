/** @jest-environment jsdom */
const fs = require("node:fs/promises");
const path = require("node:path");

jest.mock("../../src/renderer/feedback.js", () => ({
  showToast: jest.fn(),
  showConfirmModal: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../src/renderer/theme.js", () => ({
  applyServerListMode: jest.fn(),
  applyLayoutMode: jest.fn(),
}));

jest.mock("../../src/renderer/ui-behavior.js", () => ({
  applyTabVisibility: jest.fn(),
}));

jest.mock("../../src/renderer/serverBrowser.js", () => ({
  startCountdown: jest.fn(),
}));

const { initSettings } = require("../../src/renderer/settings.js");
const { state, applyFavoritesSnapshot, setFiltersFromSettings } = require("../../src/renderer/state.js");
const { showToast, showConfirmModal } = require("../../src/renderer/feedback.js");
const { startCountdown } = require("../../src/renderer/serverBrowser.js");

const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};

describe("renderer settings reconciliation and startup history", () => {
  let settingsHtml;

  beforeAll(async () => {
    settingsHtml = await fs.readFile(path.join(__dirname, "../../src/index.html"), "utf8");
  });

  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = settingsHtml;
    state.settings = {
      playerName: "Survivor",
      launchParams: "",
      modDirectory: "/old/mods",
      autoRefreshEnabled: false,
      autoRefreshTime: 360,
      watchlistRefreshEnabled: true,
      watchlistRefreshTime: 10,
      serverListPageSize: 50,
      queryConcurrency: 150,
      serverListMode: "compact",
      theme: "tactical-dark",
      layoutMode: "modern",
      listMode: "paging",
      audioFeedback: true,
      enableWatchlist: true,
      showWatchlistTab: true,
      showDiagnosticsTab: true,
      enableHistory: true,
      showHistoryTab: true,
      enableTrustScore: true,
      protonPath: "default",
      mangoHudEnabled: false,
      dxvkAsyncEnabled: true,
      dxvkThreads: "0",
      disableProtonLogs: true,
      enableGameMode: false,
      nativeWayland: false,
      mallocSystem: true,
      maxMem: "16000",
      mallocTrim: true,
      noEsync: false,
      mangoHudConfig: "cpu_temp,gpu_temp",
      dxvkConfig: "",
      modLoadouts: {},
      favorites: [{ id: "1.2.3.4:2302", ip: "1.2.3.4", port: 2302 }],
    };
    state.favorites = [{ id: "1.2.3.4:2302", ip: "1.2.3.4", port: 2302 }];
    state.favoriteDataRevision = 1;
    state.modLoadouts = {};

    window.api = {
      game: {
        checkGameMode: jest.fn().mockResolvedValue(true),
        scanProton: jest.fn().mockResolvedValue([]),
        launch: jest.fn().mockResolvedValue(),
      },
      settings: {
        save: jest.fn().mockResolvedValue(true),
        load: jest.fn().mockImplementation(async () => ({ ...state.settings })),
        getDefaults: jest.fn().mockResolvedValue({
          ...state.settings,
          playerName: "",
          modDirectory: "",
        }),
      },
      ui: {
        checkPathExists: jest.fn().mockResolvedValue(true),
      },
    };
  });

  test("clearing Workshop path and saving reconciles rediscovered path into DOM and state (R18)", async () => {
    await initSettings();
    const modDirInput = document.getElementById("modDirectory");
    modDirInput.value = "";

    window.api.settings.load.mockResolvedValueOnce({
      ...state.settings,
      modDirectory: "/discovered/workshop/221100",
    });

    document.getElementById("saveSettingsBtn").click();
    await flush();

    expect(window.api.settings.save).toHaveBeenCalledWith(
      expect.objectContaining({ modDirectory: "" }),
    );
    expect(window.api.settings.save.mock.calls[0][0].favorites).toBeUndefined();
    expect(modDirInput.value).toBe("/discovered/workshop/221100");
    expect(state.settings.modDirectory).toBe("/discovered/workshop/221100");
    expect(showToast).toHaveBeenCalledWith(
      "Settings committed to local storage",
      "#ff9f1c",
      "save",
    );
  });

  test("delayed readback from Save A does not overwrite newer form edit B or concurrent Favorites snapshot (R17)", async () => {
    await initSettings();

    let resolveReadbackA;
    window.api.settings.load
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveReadbackA = resolve;
          }),
      )
      .mockImplementationOnce(async () => ({
        ...state.settings,
        playerName: "PlayerB",
        modDirectory: "/discovered/mods",
      }));

    // Trigger Save A: clear modDirectory and set playerName = "PlayerA"
    const playerInput = document.getElementById("playerName");
    const modDirInput = document.getElementById("modDirectory");
    playerInput.value = "PlayerA";
    modDirInput.value = "";
    document.getElementById("settings").dispatchEvent(new Event("change"));
    await flush();

    // While Save A readback is still pending, user edits playerName to "PlayerB" and triggers Save B,
    // and a new Favorites snapshot arrives
    playerInput.value = "PlayerB";
    playerInput.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("settings").dispatchEvent(new Event("change"));

    applyFavoritesSnapshot({
      dataRevision: 2,
      entries: [
        { id: "1.2.3.4:2302", ip: "1.2.3.4", port: 2302 },
        { id: "5.6.7.8:2302", ip: "5.6.7.8", port: 2302 },
      ],
      groups: [],
    });

    // Now resolve Save A's stale readback (which still has PlayerA and older favorites)
    resolveReadbackA({
      ...state.settings,
      playerName: "PlayerA",
      modDirectory: "/discovered/mods",
      favorites: [{ id: "1.2.3.4:2302", ip: "1.2.3.4", port: 2302 }],
    });
    await flush();

    expect(playerInput.value).toBe("PlayerB");
    expect(state.settings.playerName).toBe("PlayerB");
    expect(modDirInput.value).toBe("/discovered/mods");
    expect(state.settings.modDirectory).toBe("/discovered/mods");
    expect(state.favorites).toHaveLength(2);
    expect(state.settings.favorites).toHaveLength(2);
  });

  test.each([
    [false, 360, true, 180, true],
    [true, 360, true, 180, true],
    [true, 360, false, 360, true],
    [false, 360, true, 180, false],
  ])("overlapping saves reconcile timers from committed values (%s, %s -> %s, %s; save succeeds: %s)", async (initialEnabled, initialTime, nextEnabled, nextTime, saveBSucceeds) => {
    jest.useFakeTimers();
    const realStartCountdown = jest.requireActual("../../src/renderer/serverBrowser/serverBrowserRender.js").startCountdown;
    startCountdown.mockImplementation(realStartCountdown);
    try {
      Object.assign(state.settings, { autoRefreshEnabled: initialEnabled, autoRefreshTime: initialTime });
      let stored = { ...state.settings };
      await initSettings();
      realStartCountdown();
      const initialTimer = state.autoRefresh.interval;
      let releaseReadback;
      window.api.settings.save
        .mockImplementationOnce(async (patch) => { stored = { ...stored, ...patch }; return true; })
        .mockImplementationOnce(async (patch) => {
          if (saveBSucceeds) stored = { ...stored, ...patch };
          return saveBSucceeds;
        });
      window.api.settings.load
        .mockImplementationOnce(() => new Promise((resolve) => {
          const savedA = { ...stored };
          releaseReadback = () => resolve(savedA);
        }))
        .mockImplementationOnce(async () => ({ ...stored }));

      document.getElementById("playerName").value = "Save A";
      document.getElementById("saveSettingsBtn").click();
      await flush();
      document.getElementById("autoRefreshEnabled").value = String(nextEnabled);
      document.getElementById("autoRefreshTime").value = String(nextTime);
      document.getElementById("saveSettingsBtn").click();
      releaseReadback();
      await flush();

      expect(state.settings.autoRefreshEnabled).toBe(stored.autoRefreshEnabled);
      expect(state.settings.autoRefreshTime).toBe(stored.autoRefreshTime);
      expect(Boolean(state.autoRefresh.interval)).toBe(stored.autoRefreshEnabled);
      if (stored.autoRefreshEnabled) {
        expect(state.autoRefresh.seconds).toBe(stored.autoRefreshTime);
        jest.advanceTimersByTime(1000);
        expect(state.autoRefresh.seconds).toBe(stored.autoRefreshTime - 1);
      }
      if (saveBSucceeds) {
        expect(startCountdown).toHaveBeenCalledTimes(1);
        expect(state.autoRefresh.interval).not.toBe(initialTimer);
      } else {
        expect(startCountdown).not.toHaveBeenCalled();
        expect(document.getElementById("autoRefreshEnabled").value).toBe(String(nextEnabled));
      }
    } finally {
      jest.clearAllTimers();
      state.autoRefresh.interval = null;
      state.autoRefresh.countdownInterval = null;
      startCountdown.mockReset();
      jest.useRealTimers();
    }
  });

  test.each(["16", 16])("custom DXVK threads %s survive an unrelated save and normalized readback", async (threads) => {
    state.settings.dxvkThreads = threads;
    await initSettings();
    const select = document.getElementById("dxvkThreads");
    expect(select.value).toBe("16");
    window.api.settings.load.mockResolvedValueOnce({ ...state.settings, dxvkThreads: "32" });
    document.getElementById("playerName").value = "New player";
    document.getElementById("saveSettingsBtn").click();
    await flush();
    expect(window.api.settings.save).toHaveBeenLastCalledWith(expect.objectContaining({ dxvkThreads: "16" }));
    expect(select.value).toBe("32");
    document.getElementById("saveSettingsBtn").click();
    await flush();
    expect(window.api.settings.save).toHaveBeenLastCalledWith(expect.objectContaining({ dxvkThreads: "32" }));
    expect(Array.from(select.options).filter((option) => option.value === "32")).toHaveLength(1);
  });

  test("factory reset reloads rediscovered paths and distinct readback failure feedback is shown (R18)", async () => {
    await initSettings();
    showConfirmModal.mockResolvedValueOnce(true);
    window.api.settings.load.mockResolvedValueOnce({
      ...state.settings,
      playerName: "",
      modDirectory: "/reset/discovered/221100",
    });

    document.getElementById("resetSettingsBtn").click();
    await flush();

    expect(state.settings.modDirectory).toBe("/reset/discovered/221100");
    expect(document.getElementById("modDirectory").value).toBe("/reset/discovered/221100");

    // Manual save with readback failure shows distinct warning toast
    window.api.settings.load.mockRejectedValueOnce(new Error("readback failed"));
    document.getElementById("saveSettingsBtn").click();
    await flush();

    expect(showToast).toHaveBeenCalledWith(
      "Settings saved, but could not reload persisted values",
      "#ff9f1c",
      "alert",
    );
  });

  test.each(["write", "readback"])("factory reset drains an active %s and discards queued pre-reset edits", async (phase) => {
    await initSettings();
    let stored = { ...state.settings };
    let releaseActive;
    const deferred = new Promise((resolve) => { releaseActive = resolve; });
    const writes = [];
    window.api.settings.save.mockImplementation(async (patch) => {
      writes.push(patch.playerName);
      if (phase === "write" && writes.length === 1) await deferred;
      stored = { ...stored, ...patch };
      return true;
    });
    let reads = 0;
    window.api.settings.load.mockImplementation(async () => {
      const snapshot = { ...stored };
      if (phase === "readback" && ++reads === 1) await deferred;
      return snapshot;
    });

    const player = document.getElementById("playerName");
    player.value = "Save A";
    document.getElementById("settings").dispatchEvent(new Event("change"));
    await flush();
    player.value = "Save B";
    document.getElementById("saveSettingsBtn").click();
    document.getElementById("resetSettingsBtn").click();
    await flush();

    expect(writes).toEqual(["Save A"]);
    expect(document.getElementById("resetSettingsBtn").disabled).toBe(true);
    // Further changes while the reset is waiting must not resurrect old input.
    player.value = "Save C";
    document.getElementById("settings").dispatchEvent(new Event("change"));
    releaseActive();
    await flush();

    expect(writes).toEqual(["Save A", ""]);
    expect(stored.playerName).toBe("");
    expect(state.settings.playerName).toBe("");
    expect(player.value).toBe("");
    expect(document.getElementById("resetSettingsBtn").disabled).toBe(false);
    expect(showToast).not.toHaveBeenCalledWith(
      "Settings committed to local storage", "#ff9f1c", "save",
    );
  });

  test("a failed reset releases the save barrier so preferences can be saved again", async () => {
    await initSettings();
    window.api.settings.getDefaults.mockRejectedValueOnce(new Error("unavailable"));
    document.getElementById("resetSettingsBtn").click();
    await flush();
    expect(document.getElementById("resetSettingsBtn").disabled).toBe(false);
    expect(showToast).toHaveBeenCalledWith("Error resetting settings", "#ff5a5f", "x");

    document.getElementById("playerName").value = "After failure";
    document.getElementById("saveSettingsBtn").click();
    await flush();
    expect(window.api.settings.save).toHaveBeenCalledWith(
      expect.objectContaining({ playerName: "After failure" }),
    );
  });

  test("non-string filterName does not crash setFiltersFromSettings and obsolete history bootstrap helper is removed (R02, R19)", () => {
    const stateModule = require("../../src/renderer/state.js");
    expect(stateModule.setFavoritesFromSettings).toBeUndefined();
    expect(() => setFiltersFromSettings({ filterName: 12345 })).not.toThrow();
    expect(state.filters.name).toBe("");
    expect(state.filters.nameLower).toBe("");
  });
});
