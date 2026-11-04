const { EventEmitter } = require("node:events");

describe("processExit", () => {
  let mockUnlock;
  let mockLockAndDelay;
  let mockSpawn;
  let processExit;

  beforeEach(() => {
    jest.resetModules();
    mockUnlock = jest.fn();
    mockLockAndDelay = jest.fn().mockResolvedValue();
    mockSpawn = jest.fn();
    jest.doMock("../../src/main/steamworksManager", () => ({
      lockAndDelayForLaunch: mockLockAndDelay,
      unlockForLaunch: mockUnlock,
    }));
    jest.doMock("child_process", () => ({ spawn: mockSpawn }));
    jest.spyOn(console, "log").mockImplementation(() => {});
    processExit = require("../../src/main/game/processExit");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("exitError", () => {
    test("treats code 0 and shutdown signals as clean", () => {
      expect(processExit.exitError(0, null)).toBeNull();
      expect(processExit.exitError(null, "SIGTERM")).toBeNull();
      expect(processExit.exitError(null, "SIGINT")).toBeNull();
      expect(processExit.exitError(null, "SIGHUP")).toBeNull();
    });

    test("reports non-zero codes and crash signals", () => {
      expect(processExit.exitError(1, null).code).toBe(1);
      expect(processExit.exitError(null, "SIGSEGV").code).toBe("SIGSEGV");
      expect(processExit.exitError(null, "SIGKILL").message).toContain("SIGKILL");
    });
  });

  describe("watchLaunchedProcess", () => {
    test("resolves on spawn and reports a signal-killed process as a crash", async () => {
      const child = new EventEmitter();
      const handleGameExit = jest.fn();
      const before = Date.now();
      const launched = processExit.watchLaunchedProcess(child, "Proton", handleGameExit);
      child.emit("spawn");
      await launched;

      child.emit("exit", null, "SIGSEGV");
      const error = handleGameExit.mock.calls[0][0];
      expect(error.code).toBe("SIGSEGV");
      expect(error.startedAt).toBeGreaterThanOrEqual(before);
      expect(mockUnlock).toHaveBeenCalledTimes(1);
    });

    test("releases the launch lock once when both error and exit fire", async () => {
      const child = new EventEmitter();
      const handleGameExit = jest.fn();
      const launched = processExit.watchLaunchedProcess(child, "Steam", handleGameExit);
      child.emit("error", new Error("ENOENT"));
      child.emit("exit", -2, null);

      await expect(launched).rejects.toThrow("ENOENT");
      expect(mockUnlock).toHaveBeenCalledTimes(1);
    });

    test("holdLock decides when the lock is released, not the process exit", async () => {
      const child = new EventEmitter();
      const holdLock = jest.fn();
      const launched = processExit.watchLaunchedProcess(child, "Steam", jest.fn(), { holdLock });
      child.emit("spawn");
      await launched;

      child.emit("exit", 0, null);
      expect(mockUnlock).not.toHaveBeenCalled();

      const release = holdLock.mock.calls[0][0];
      release();
      release();
      expect(mockUnlock).toHaveBeenCalledTimes(1);
    });

    test("releases a held lock if the process fails to spawn", async () => {
      const child = new EventEmitter();
      const holdLock = jest.fn();
      const launched = processExit.watchLaunchedProcess(child, "Steam", jest.fn(), { holdLock });
      child.emit("error", new Error("ENOENT"));

      await expect(launched).rejects.toThrow("ENOENT");
      expect(holdLock).not.toHaveBeenCalled();
      expect(mockUnlock).toHaveBeenCalledTimes(1);
    });
  });

  describe("spawnWithLaunchLock", () => {
    const launch = (overrides = {}) =>
      processExit.spawnWithLaunchLock({
        command: "proton",
        args: ["run"],
        options: { stdio: "ignore" },
        label: "Proton",
        handleGameExit: jest.fn(),
        ...overrides,
      });

    test("locks before spawning and releases when the process exits", async () => {
      const child = new EventEmitter();
      mockSpawn.mockImplementation(() => {
        expect(mockLockAndDelay).toHaveBeenCalledTimes(1);
        process.nextTick(() => child.emit("spawn"));
        return child;
      });

      await launch();
      expect(mockSpawn).toHaveBeenCalledWith("proton", ["run"], { stdio: "ignore" });
      expect(mockUnlock).not.toHaveBeenCalled();

      child.emit("exit", 0, null);
      expect(mockUnlock).toHaveBeenCalledTimes(1);
    });

    test("releases the lock and does not spawn when the launch was cancelled", async () => {
      const assertCurrent = () => {
        throw new Error("cancelled");
      };
      await expect(launch({ assertCurrent })).rejects.toThrow("cancelled");
      expect(mockSpawn).not.toHaveBeenCalled();
      expect(mockUnlock).toHaveBeenCalledTimes(1);
    });

    test("releases the lock when spawn throws synchronously", async () => {
      mockSpawn.mockImplementation(() => {
        throw new TypeError("ERR_INVALID_ARG_VALUE");
      });
      await expect(launch({ command: "" })).rejects.toThrow("ERR_INVALID_ARG_VALUE");
      expect(mockUnlock).toHaveBeenCalledTimes(1);
    });

    test("does not release a lock it failed to take", async () => {
      mockLockAndDelay.mockRejectedValue(new Error("lock failed"));
      await expect(launch()).rejects.toThrow("lock failed");
      expect(mockSpawn).not.toHaveBeenCalled();
      expect(mockUnlock).not.toHaveBeenCalled();
    });

    test("unrefs detached processes", async () => {
      const child = new EventEmitter();
      child.unref = jest.fn();
      mockSpawn.mockImplementation(() => {
        process.nextTick(() => child.emit("spawn"));
        return child;
      });
      await launch({ options: { stdio: "ignore", detached: true } });
      expect(child.unref).toHaveBeenCalledTimes(1);
    });
  });
});
