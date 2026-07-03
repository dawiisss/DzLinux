const child_process = require("child_process");

describe("steamworksManager", () => {
  let mockWorker;
  let exitCallback;
  let messageCallback;
  let forkSpy;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    messageCallback = null;
    exitCallback = null;

    mockWorker = {
      on: jest.fn((event, cb) => {
        if (event === "exit") exitCallback = cb;
        if (event === "message") messageCallback = cb;
      }),
      once: jest.fn((event, cb) => {
        if (event === "exit") exitCallback = cb;
      }),
      send: jest.fn(),
      kill: jest.fn(),
    };

    forkSpy = jest.spyOn(child_process, "fork").mockReturnValue(mockWorker);
  });

  afterEach(() => {
    forkSpy.mockRestore();
  });

  test("init spawns worker and registers listeners", () => {
    const steamworksManager = require("../../src/main/steamworksManager");
    const success = steamworksManager.init();

    expect(success).toBe(true);
    expect(forkSpy).toHaveBeenCalledWith(expect.stringContaining("steamworksWorker.js"));
    expect(mockWorker.on).toHaveBeenCalledWith("message", expect.any(Function));
    expect(mockWorker.on).toHaveBeenCalledWith("exit", expect.any(Function));
  });

  test("shutdown terminates worker gracefully via SIGTERM", async () => {
    const steamworksManager = require("../../src/main/steamworksManager");
    steamworksManager.init();

    const shutdownPromise = steamworksManager.shutdown();

    // Trigger graceful exit
    expect(mockWorker.kill).toHaveBeenCalledWith("SIGTERM");
    expect(mockWorker.once).toHaveBeenCalledWith("exit", expect.any(Function));
    
    exitCallback();
    await shutdownPromise;
  });

  test("shutdown kills worker forcefully via SIGKILL if timeout fires", async () => {
    jest.useFakeTimers();

    const steamworksManager = require("../../src/main/steamworksManager");
    steamworksManager.init();

    const shutdownPromise = steamworksManager.shutdown();

    // Fast forward timeout (2000ms)
    jest.advanceTimersByTime(2000);
    await shutdownPromise;

    expect(mockWorker.kill).toHaveBeenCalledWith("SIGKILL");
    
    // Cleanup fake timers
    jest.useRealTimers();
  });

  test("sendRequest handles successful resolution", async () => {
    const steamworksManager = require("../../src/main/steamworksManager");
    steamworksManager.init();

    const requestPromise = steamworksManager.getUserProfile();

    // Verify message sent to worker
    expect(mockWorker.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "getUserProfile",
      })
    );

    // Get the request ID sent to worker
    const sentMsg = mockWorker.send.mock.calls[0][0];
    const requestId = sentMsg.id;

    // Simulate worker response
    messageCallback({
      id: requestId,
      result: { name: "Test User" },
    });

    const result = await requestPromise;
    expect(result).toEqual({ name: "Test User" });
  });

  test("sendRequest rejects on error", async () => {
    const steamworksManager = require("../../src/main/steamworksManager");
    steamworksManager.init();

    const requestPromise = steamworksManager.subscribeMod("12345");

    const sentMsg = mockWorker.send.mock.calls[0][0];
    messageCallback({
      id: sentMsg.id,
      error: "Failed to subscribe",
    });

    const result = await requestPromise;
    expect(result).toBe(false); // Wrapper returns false on throw
  });

  test("worker exit rejects pending requests", async () => {
    const steamworksManager = require("../../src/main/steamworksManager");
    steamworksManager.init();

    // We call a method directly to test throw path (getUserProfile returns null on catch)
    const requestPromise = steamworksManager.getUserProfile();

    // Simulate worker crash/exit
    exitCallback();

    const result = await requestPromise;
    expect(result).toBeNull();
  });

  test("lockForLaunch disables worker initialization and shuts down active worker", async () => {
    const steamworksManager = require("../../src/main/steamworksManager");
    steamworksManager.init();

    const shutdownPromise = steamworksManager.lockForLaunch();
    exitCallback();
    await shutdownPromise;

    // Subsequent init calls should return false and not call fork
    forkSpy.mockClear();
    const success = steamworksManager.init();
    expect(success).toBe(false);
    expect(forkSpy).not.toHaveBeenCalled();

    // unlockForLaunch enables it again
    steamworksManager.unlockForLaunch();
    const success2 = steamworksManager.init();
    expect(success2).toBe(true);
    expect(forkSpy).toHaveBeenCalled();
  });

  test("lockAndDelayForLaunch locks, delays, and invokes callback on timeout", async () => {
    jest.useFakeTimers();

    const steamworksManager = require("../../src/main/steamworksManager");
    steamworksManager.init();

    const mockCallback = jest.fn();
    const launchPromise = steamworksManager.lockAndDelayForLaunch(mockCallback);

    // Mock worker exit to resolve lockForLaunch
    exitCallback();

    // Advance timer past launch delay (1500ms) and launch timeout (15000ms)
    await jest.runAllTimersAsync();

    await launchPromise;

    expect(mockCallback).toHaveBeenCalled();

    jest.useRealTimers();
  });
});
