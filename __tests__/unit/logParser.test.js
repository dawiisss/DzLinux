const fs = require("fs");
const path = require("path");
const os = require("os");

describe("logParser", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dzlinux-log-"));
    jest.resetModules();

    // Set up the directory structure the logParser expects
    const steamappsDir = path.join(tmpDir, "steamapps");
    const workshopDir = path.join(
      steamappsDir,
      "workshop",
      "content",
      "221100",
    );
    const dayzLogsDir = path.join(
      steamappsDir,
      "compatdata",
      "221100",
      "pfx",
      "drive_c",
      "users",
      "steamuser",
      "AppData",
      "Local",
      "DayZ",
    );
    fs.mkdirSync(workshopDir, { recursive: true });
    fs.mkdirSync(dayzLogsDir, { recursive: true });

    jest.mock(
      "electron",
      () => ({
        app: { getPath: jest.fn(() => "/tmp/dzlinux-test-data") },
      }),
      { virtual: true },
    );

    // Use doMock so we can reference tmpDir-derived paths at runtime
    jest.doMock("../../src/main/settings", () => ({
      loadSettings: jest.fn(() => ({
        modDirectory: path.join(
          tmpDir,
          "steamapps",
          "workshop",
          "content",
          "221100",
        ),
      })),
    }));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createLogFile(name, content) {
    const dayzLogsDir = path.join(
      tmpDir,
      "steamapps",
      "compatdata",
      "221100",
      "pfx",
      "drive_c",
      "users",
      "steamuser",
      "AppData",
      "Local",
      "DayZ",
    );
    fs.writeFileSync(path.join(dayzLogsDir, name), content);
  }

  describe("getRecentLogs", () => {
    test("returns empty array when modDirectory is empty string", async () => {
      jest.resetModules();
      jest.doMock("../../src/main/settings", () => ({
        loadSettings: jest.fn(() => ({ modDirectory: "" })),
      }));
      const logParser = require("../../src/main/logParser");
      const logs = await logParser.getRecentLogs();
      expect(logs).toEqual([]);
    });

    test("returns empty array when modDirectory does not exist", async () => {
      jest.resetModules();
      jest.doMock("../../src/main/settings", () => ({
        loadSettings: jest.fn(() => ({ modDirectory: "/non/existent/path" })),
      }));
      const logParser = require("../../src/main/logParser");
      const logs = await logParser.getRecentLogs();
      expect(logs).toEqual([]);
    });

    test("returns empty array when no logs exist", async () => {
      const logParser = require("../../src/main/logParser");
      const logs = await logParser.getRecentLogs();
      expect(logs).toEqual([]);
    });

    test("returns log files sorted by modification time", async () => {
      createLogFile(
        "old.log",
        "10:00:00 Something happened\n10:05:00 Session ended\n",
      );
      createLogFile(
        "new.log",
        "11:00:00 Something happened\n11:05:00 Session ended\n",
      );

      const dayzLogsDir = path.join(
        tmpDir,
        "steamapps",
        "compatdata",
        "221100",
        "pfx",
        "drive_c",
        "users",
        "steamuser",
        "AppData",
        "Local",
        "DayZ",
      );
      const oldPath = path.join(dayzLogsDir, "old.log");
      const oldTime = new Date("2020-01-01");
      fs.utimesSync(oldPath, oldTime, oldTime);

      const logParser = require("../../src/main/logParser");
      const logs = await logParser.getRecentLogs();
      expect(logs.length).toBe(2);
      expect(logs[0].name).toBe("new.log");
    });

    test("detects crash from segmentation fault", async () => {
      createLogFile(
        "crash.log",
        "10:00:00 Game started\n10:05:00 segmentation fault at 0x0000\n",
      );

      const logParser = require("../../src/main/logParser");
      const logs = await logParser.getRecentLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].status).toBe("CRASH");
    });

    test("detects crash from access violation", async () => {
      createLogFile(
        "crash.log",
        "10:00:00 Game started\n10:05:00 access violation c0000005\n",
      );

      const logParser = require("../../src/main/logParser");
      const logs = await logParser.getRecentLogs();
      expect(logs[0].status).toBe("CRASH");
    });

    test("detects crash from out of memory", async () => {
      createLogFile(
        "oom.log",
        "10:00:00 Game started\n10:05:00 Out of memory - bad allocation\n",
      );

      const logParser = require("../../src/main/logParser");
      const logs = await logParser.getRecentLogs();
      expect(logs[0].status).toBe("CRASH");
    });

    test("detects warning from missing addon", async () => {
      createLogFile(
        "warn.log",
        "10:00:00 Game started\n10:05:00 Missing addon @SomeMod\n",
      );

      const logParser = require("../../src/main/logParser");
      const logs = await logParser.getRecentLogs();
      expect(logs[0].status).toBe("WARNING");
    });

    test("marks .mdmp files as CRASH immediately", async () => {
      createLogFile("crash.mdmp", "binary dump data");

      const logParser = require("../../src/main/logParser");
      const logs = await logParser.getRecentLogs();
      expect(logs[0].status).toBe("CRASH");
      expect(logs[0].snippet).toContain("Minidump");
    });

    test("marks clean logs as CLEAN", async () => {
      createLogFile(
        "clean.log",
        "10:00:00 Game started\n10:05:00 Player connected\n10:10:00 Session ended\n",
      );

      const logParser = require("../../src/main/logParser");
      const logs = await logParser.getRecentLogs();
      expect(logs[0].status).toBe("CLEAN");
    });

    test("calculates playtime from timestamps", async () => {
      createLogFile(
        "session.log",
        "10:00:00 Game started\n10:30:00 Session ended\n",
      );

      const logParser = require("../../src/main/logParser");
      const logs = await logParser.getRecentLogs();
      expect(logs[0].playtime).toContain("30m");
    });

    test("counts connection drops", async () => {
      createLogFile(
        "drops.log",
        "10:00:00 Game started\n10:05:00 disconnecting from server\n10:10:00 connection lost\n10:15:00 Session ended\n",
      );

      const logParser = require("../../src/main/logParser");
      const logs = await logParser.getRecentLogs();
      expect(logs[0].connectionDrops).toBe(2);
    });
  });

  describe("getSessionSummary", () => {
    test("returns zeroed summary when no logs exist", async () => {
      const logParser = require("../../src/main/logParser");
      const summary = await logParser.getSessionSummary();
      expect(summary.totalSessions).toBe(0);
      expect(summary.totalCrashes).toBe(0);
      expect(summary.totalWarnings).toBe(0);
    });

    test("aggregates crash and warning counts", async () => {
      createLogFile("crash.log", "10:00:00 segmentation fault\n");
      createLogFile("warn.log", "10:00:00 Missing addon\n");
      createLogFile(
        "clean.log",
        "10:00:00 Game started\n10:05:00 Session ended\n",
      );

      const logParser = require("../../src/main/logParser");
      const summary = await logParser.getSessionSummary();
      expect(summary.totalSessions).toBe(3);
      expect(summary.totalCrashes).toBe(1);
      expect(summary.totalWarnings).toBe(1);
    });
  });
});
