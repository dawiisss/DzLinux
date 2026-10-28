/** @jest-environment jsdom */

jest.mock("../../src/renderer/feedback.js", () => ({
  showToast: jest.fn(),
}));

const { showToast } = require("../../src/renderer/feedback.js");
const {
  loadDiagnostics,
  loadSystemCompatibilityCheck,
  bindDiagnosticsEvents,
} = require("../../src/renderer/diagnostics.js");

describe("renderer diagnostics (WP7 / R15, R16)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = `
      <span id="teleTotalSessions"></span>
      <span id="teleTotalPlaytime"></span>
      <span id="teleAvgSession"></span>
      <span id="teleTotalCrashes"></span>
      <span id="teleTotalWarnings"></span>
      <span id="teleTotalDrops"></span>
      <div id="diagnosticsListBody"></div>
      <button id="btnRunSystemCheck">Run System Check</button>
      <div id="systemCheckContainer"></div>
    `;
    bindDiagnosticsEvents();
  });

  test("R15: system check button disables while pending, suppresses toast until resolved, and shows error toast on failure", async () => {
    let resolveCheck;
    window.api = {
      diagnostics: {
        runSystemCheck: jest.fn(
          () =>
            new Promise((resolve) => {
              resolveCheck = resolve;
            }),
        ),
      },
    };

    const btn = document.getElementById("btnRunSystemCheck");
    btn.click();

    // While pending: button is disabled, no completion toast has fired
    expect(btn.disabled).toBe(true);
    expect(showToast).not.toHaveBeenCalled();

    // Repeated click while pending does not start a second check
    btn.click();
    expect(window.api.diagnostics.runSystemCheck).toHaveBeenCalledTimes(1);

    resolveCheck([
      {
        label: "vm.max_map_count",
        category: "Kernel",
        status: "warn",
        details: "Low map count",
        fixSuggestion: "Increase vm.max_map_count",
      },
    ]);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(btn.disabled).toBe(false);
    expect(showToast).toHaveBeenCalledWith(
      "System compatibility check completed",
      "#2ec4b6",
      "check",
    );

    // Now test IPC failure path
    showToast.mockClear();
    window.api.diagnostics.runSystemCheck.mockRejectedValueOnce(
      new Error("IPC check failed"),
    );

    const outcome = await loadSystemCompatibilityCheck();
    expect(outcome.ok).toBe(false);
    expect(btn.disabled).toBe(false);
    expect(document.getElementById("systemCheckContainer").textContent).toContain(
      "Failed to execute system compatibility check.",
    );

    // Clicking button when IPC fails shows failure toast, not completion toast
    window.api.diagnostics.runSystemCheck.mockRejectedValueOnce(
      new Error("IPC check failed"),
    );
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(showToast).not.toHaveBeenCalledWith(
      "System compatibility check completed",
      expect.anything(),
      expect.anything(),
    );
    expect(showToast).toHaveBeenCalledWith(
      "Failed to execute system compatibility check",
      "#ef233c",
      "alert",
    );
  });

  test("R16: loadDiagnostics uses single getSnapshot pass and ignores stale older responses", async () => {
    const pendingSnapshots = [];
    window.api = {
      diagnostics: {
        getSnapshot: jest.fn(
          () =>
            new Promise((resolve) => {
              pendingSnapshots.push(resolve);
            }),
        ),
        getSessionSummary: jest.fn(),
        getRecentLogs: jest.fn(),
        runSystemCheck: jest.fn().mockResolvedValue([]),
      },
    };

    const firstLoad = loadDiagnostics();
    const secondLoad = loadDiagnostics();
    expect(window.api.diagnostics.getSnapshot).toHaveBeenCalledTimes(2);
    expect(window.api.diagnostics.getSessionSummary).not.toHaveBeenCalled();
    expect(window.api.diagnostics.getRecentLogs).not.toHaveBeenCalled();

    // Resolve newer snapshot first
    pendingSnapshots[1]({
      summary: {
        totalSessions: 4,
        totalPlaytime: "2h 15m",
        averageSessionLength: "34m",
        totalCrashes: 1,
        totalWarnings: 0,
        totalDrops: 2,
      },
      logs: [
        {
          name: "latest.rpt",
          date: "2026-04-15T10:00:00Z",
          status: "CLEAN",
          playtime: "45m",
          connectionDrops: 0,
          snippet: "Normal run",
        },
      ],
    });
    await secondLoad;

    // Resolve older snapshot late
    pendingSnapshots[0]({
      summary: {
        totalSessions: 1,
        totalPlaytime: "0h 5m",
        averageSessionLength: "5m",
        totalCrashes: 0,
        totalWarnings: 0,
        totalDrops: 0,
      },
      logs: [
        {
          name: "stale.rpt",
          date: "2026-04-10T10:00:00Z",
          status: "CRASH",
          playtime: "5m",
          connectionDrops: 0,
          snippet: "Stale crash",
        },
      ],
    });
    await firstLoad;

    expect(document.getElementById("teleTotalSessions").textContent).toBe("4");
    expect(document.getElementById("diagnosticsListBody").textContent).toContain(
      "latest.rpt",
    );
    expect(
      document.getElementById("diagnosticsListBody").textContent,
    ).not.toContain("stale.rpt");
  });
});
