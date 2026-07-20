const fs = require("fs");
const path = require("path");
const os = require("os");

describe("logger", () => {
  let tmpDir;
  let logDir;
  let logFile;
  let originalConsoleLog;
  let originalConsoleWarn;
  let originalConsoleError;
  let loggerModule;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dzlinux-logger-"));
    logDir = path.join(tmpDir, "logs");
    logFile = path.join(logDir, "dzlinux.log");

    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;

    jest.resetModules();

    jest.doMock(
      "electron",
      () => ({
        app: {
          getPath: jest.fn(() => tmpDir),
        },
      }),
      { virtual: true },
    );

    loggerModule = require("../../src/main/logger");
  });

  afterEach(async () => {
    // Always close the logger if it was initialized, even if the test failed
    // mid-way. This prevents the write stream from leaking into other test
    // suites and emitting 'error' events when tmpDir is removed.
    try {
      await loggerModule.closeLogger();
    } catch {
      // ignore
    }

    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Helper: wait for a condition to be true, polling every 10ms
  async function waitFor(condFn, timeoutMs = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (condFn()) return true;
      await new Promise((r) => setTimeout(r, 10));
    }
    return false;
  }

  describe("initLogger", () => {
    test("creates log directory and file", async () => {
      const { initLogger, getLogFilePath, closeLogger } = loggerModule;

      await initLogger();

      // initLogger awaits the stream's 'open' event, so the file exists now
      expect(fs.existsSync(logDir)).toBe(true);
      expect(getLogFilePath()).toBe(logFile);
      expect(fs.existsSync(logFile)).toBe(true);

      await new Promise((r) => setTimeout(r, 20));
      const content = fs.readFileSync(logFile, "utf8");
      expect(content).toContain("Logger initialized");

      await closeLogger();
    });

    test("intercepts console.log and writes to file", async () => {
      const { initLogger, closeLogger } = loggerModule;

      await initLogger();
      console.log("test log message");

      await waitFor(() => {
        if (!fs.existsSync(logFile)) return false;
        return fs.readFileSync(logFile, "utf8").includes("test log message");
      });

      const content = fs.readFileSync(logFile, "utf8");
      expect(content).toContain("test log message");
      expect(content).toContain("[INFO]");

      await closeLogger();
    });

    test("intercepts console.warn and writes to file", async () => {
      const { initLogger, closeLogger } = loggerModule;

      await initLogger();
      console.warn("test warn message");

      await waitFor(() => {
        if (!fs.existsSync(logFile)) return false;
        return fs.readFileSync(logFile, "utf8").includes("test warn message");
      });

      const content = fs.readFileSync(logFile, "utf8");
      expect(content).toContain("test warn message");
      expect(content).toContain("[WARN]");

      await closeLogger();
    });

    test("intercepts console.error and writes to file", async () => {
      const { initLogger, closeLogger } = loggerModule;

      await initLogger();
      console.error("test error message");

      await waitFor(() => {
        if (!fs.existsSync(logFile)) return false;
        return fs.readFileSync(logFile, "utf8").includes("test error message");
      });

      const content = fs.readFileSync(logFile, "utf8");
      expect(content).toContain("test error message");
      expect(content).toContain("[ERROR]");

      await closeLogger();
    });
  });

  describe("pruneOldEntries", () => {
    test("removes entries older than 7 days", async () => {
      const { initLogger, closeLogger } = loggerModule;

      fs.mkdirSync(logDir, { recursive: true });
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const recentDate = new Date();
      const oldEntry = `[${oldDate.toISOString()}] [INFO] old message\n`;
      const recentEntry = `[${recentDate.toISOString()}] [INFO] recent message\n`;
      fs.writeFileSync(logFile, oldEntry + recentEntry, "utf8");

      await initLogger();

      await waitFor(() => {
        if (!fs.existsSync(logFile)) return false;
        const c = fs.readFileSync(logFile, "utf8");
        return !c.includes("old message") && c.includes("recent message");
      });

      const content = fs.readFileSync(logFile, "utf8");
      expect(content).not.toContain("old message");
      expect(content).toContain("recent message");

      await closeLogger();
    });

    test("keeps continuation lines (stack traces) for kept entries", async () => {
      const { initLogger, closeLogger } = loggerModule;

      fs.mkdirSync(logDir, { recursive: true });
      const recentDate = new Date();
      const recentEntry = `[${recentDate.toISOString()}] [ERROR] something broke\n  at foo (bar.js:1)\n  at baz (qux.js:2)\n`;
      fs.writeFileSync(logFile, recentEntry, "utf8");

      await initLogger();

      // initLogger awaits stream open, so file exists; content is preserved
      // because pruneOldEntries keeps recent entries + their continuation lines
      const content = fs.readFileSync(logFile, "utf8");
      expect(content).toContain("something broke");
      expect(content).toContain("at foo (bar.js:1)");
      expect(content).toContain("at baz (qux.js:2)");

      await closeLogger();
    });

    test("removes continuation lines when parent entry is pruned", async () => {
      const { initLogger, closeLogger } = loggerModule;

      fs.mkdirSync(logDir, { recursive: true });
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const oldEntry = `[${oldDate.toISOString()}] [ERROR] old crash\n  at old (trace.js:1)\n`;
      fs.writeFileSync(logFile, oldEntry, "utf8");

      await initLogger();

      const content = fs.readFileSync(logFile, "utf8");
      expect(content).not.toContain("old crash");
      expect(content).not.toContain("at old (trace.js:1)");

      await closeLogger();
    });

    test("handles missing log file gracefully", async () => {
      const { initLogger, closeLogger } = loggerModule;

      await initLogger();

      expect(fs.existsSync(logFile)).toBe(true);

      await closeLogger();
    });
  });

  describe("closeLogger", () => {
    test("can be called without initLogger (no-op)", async () => {
      const { closeLogger } = loggerModule;
      await expect(closeLogger()).resolves.not.toThrow();
    });

    test("allows re-initialization after close", async () => {
      const { initLogger, closeLogger } = loggerModule;

      await initLogger();
      expect(fs.existsSync(logFile)).toBe(true);
      await closeLogger();
      await initLogger();

      expect(fs.existsSync(logFile)).toBe(true);

      await closeLogger();
    });
  });

  describe("getLogFilePath", () => {
    test("returns the expected path", () => {
      const { getLogFilePath } = loggerModule;
      expect(getLogFilePath()).toBe(logFile);
    });
  });
});
