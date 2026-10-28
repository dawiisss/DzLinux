const child_process = require("child_process");
const { EventEmitter } = require("node:events");

function createMockWorker() {
  const emitter = new EventEmitter();
  emitter.send = jest.fn();
  emitter.kill = jest.fn();
  jest.spyOn(emitter, "on");
  jest.spyOn(emitter, "once");
  jest.spyOn(emitter, "removeListener");
  return emitter;
}

describe("steamworksManager", () => {
  let mockWorker;
  let forkSpy;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockWorker = createMockWorker();
    forkSpy = jest.spyOn(child_process, "fork").mockImplementation(() => mockWorker);
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

  test("shutdown terminates worker gracefully via SIGTERM and cleans up temporary exit listener", async () => {
    const steamworksManager = require("../../src/main/steamworksManager");
    steamworksManager.init();

    const shutdownPromise1 = steamworksManager.shutdown();
    const shutdownPromise2 = steamworksManager.shutdown();
    expect(shutdownPromise1).toBe(shutdownPromise2);

    expect(mockWorker.kill).toHaveBeenCalledTimes(1);
    expect(mockWorker.kill).toHaveBeenCalledWith("SIGTERM");
    expect(mockWorker.once).toHaveBeenCalledWith("exit", expect.any(Function));

    mockWorker.emit("exit", 0, "SIGTERM");
    await shutdownPromise1;
  });

  test("shutdown kills worker forcefully via SIGKILL if timeout fires", async () => {
    jest.useFakeTimers();

    const steamworksManager = require("../../src/main/steamworksManager");
    steamworksManager.init();

    const shutdownPromise = steamworksManager.shutdown();

    jest.advanceTimersByTime(2000);
    await shutdownPromise;

    expect(mockWorker.kill).toHaveBeenCalledWith("SIGKILL");
    expect(mockWorker.removeListener).toHaveBeenCalledWith("exit", expect.any(Function));

    jest.useRealTimers();
  });

  test("force-killed worker A emitting late exit/message cannot affect newly initialized worker B or its pending requests (R08)", async () => {
    jest.useFakeTimers();

    const workerA = createMockWorker();
    const workerB = createMockWorker();
    forkSpy
      .mockImplementationOnce(() => workerA)
      .mockImplementationOnce(() => workerB);

    const steamworksManager = require("../../src/main/steamworksManager");
    steamworksManager.init();

    // Start a request on Worker A
    const reqAPromise = steamworksManager.getModState("111");
    expect(workerA.send).toHaveBeenCalledTimes(1);
    const reqAId = workerA.send.mock.calls[0][0].id;

    // Shut down Worker A, let it time out into SIGKILL without emitting exit yet
    const shutdownPromise = steamworksManager.shutdown();
    jest.advanceTimersByTime(2000);
    await shutdownPromise;

    // Request A should have settled (getModState catches rejection and resolves null)
    await expect(reqAPromise).resolves.toBeNull();

    // Now start Worker B and send a request on Worker B
    expect(steamworksManager.init()).toBe(true);
    const reqBPromise = steamworksManager.getModState("222");
    expect(workerB.send).toHaveBeenCalledTimes(1);
    const reqBId = workerB.send.mock.calls[0][0].id;

    // Late message and late exit arrive from Worker A
    workerA.emit("message", { id: reqAId, result: 99 });
    workerA.emit("message", { id: reqBId, error: "forged from old worker" });
    workerA.emit("exit", null, "SIGKILL");

    // Worker B must still be active and its request must resolve normally when Worker B replies
    workerB.emit("message", { id: reqBId, result: 4 });
    await expect(reqBPromise).resolves.toBe(4);

    // Calling init() again does not spawn a third worker because Worker B is still current
    expect(steamworksManager.init()).toBe(true);
    expect(forkSpy).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  test("sendRequest handles successful resolution", async () => {
    const steamworksManager = require("../../src/main/steamworksManager");
    steamworksManager.init();

    const requestPromise = steamworksManager.getUserProfile();

    expect(mockWorker.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "getUserProfile",
      }),
    );

    const sentMsg = mockWorker.send.mock.calls[0][0];
    mockWorker.emit("message", {
      id: sentMsg.id,
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
    mockWorker.emit("message", {
      id: sentMsg.id,
      error: "Failed to subscribe",
    });

    const result = await requestPromise;
    expect(result).toBe(false);
  });

  test("worker exit rejects pending requests", async () => {
    const steamworksManager = require("../../src/main/steamworksManager");
    steamworksManager.init();

    const requestPromise = steamworksManager.getUserProfile();

    mockWorker.emit("exit", 1, null);

    const result = await requestPromise;
    expect(result).toBeNull();
  });

  test("lockForLaunch disables worker initialization and shuts down active worker", async () => {
    const steamworksManager = require("../../src/main/steamworksManager");
    steamworksManager.init();

    const shutdownPromise = steamworksManager.lockForLaunch();
    mockWorker.emit("exit", 0, "SIGTERM");
    await shutdownPromise;

    forkSpy.mockClear();
    const success = steamworksManager.init();
    expect(success).toBe(false);
    expect(forkSpy).not.toHaveBeenCalled();

    steamworksManager.unlockForLaunch();
    mockWorker = createMockWorker();
    const success2 = steamworksManager.init();
    expect(success2).toBe(true);
    expect(forkSpy).toHaveBeenCalled();
  });

  test("lockAndDelayForLaunch locks worker and keeps it locked until unlockForLaunch is called", async () => {
    jest.useFakeTimers();

    const steamworksManager = require("../../src/main/steamworksManager");
    steamworksManager.init();

    const launchPromise = steamworksManager.lockAndDelayForLaunch();

    mockWorker.emit("exit", 0, "SIGTERM");

    await jest.advanceTimersByTimeAsync(1500);

    await launchPromise;

    expect(steamworksManager.init()).toBe(false);

    steamworksManager.unlockForLaunch();
    mockWorker = createMockWorker();
    expect(steamworksManager.init()).toBe(true);

    jest.useRealTimers();
  });
});
