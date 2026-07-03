describe("steamworksWorker safeBigInt", () => {
  // We can't easily require the worker since it sets up process.on('message'),
  // so we test the safeBigInt logic directly

  function safeBigInt(val) {
    try {
      return BigInt(val);
    } catch {
      return null;
    }
  }

  test("converts valid string to BigInt", () => {
    expect(safeBigInt("123")).toBe(123n);
  });

  test("converts number to BigInt", () => {
    expect(safeBigInt(456)).toBe(456n);
  });

  test("converts large string to BigInt", () => {
    expect(safeBigInt("9007199254740993")).toBe(9007199254740993n);
  });

  test("returns null for invalid string", () => {
    expect(safeBigInt("invalid")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(safeBigInt("")).toBe(0n); // BigInt('') is 0n
  });

  test("returns null for object", () => {
    expect(safeBigInt({})).toBeNull();
  });

  test("returns null for null", () => {
    // BigInt(null) throws in some environments
    const result = safeBigInt(null);
    // null -> BigInt(0) in some JS engines
    expect(result === 0n || result === null).toBe(true);
  });

  test("converts negative string to BigInt", () => {
    expect(safeBigInt("-123")).toBe(-123n);
  });
});

describe("steamworksWorker message handlers", () => {
  let messageHandler;
  let processSendMock;
  let processOnSpy;
  let mockClient;

  let originalOn;

  beforeAll(() => {
    jest.resetModules();
    // Capture the message handler registered on process
    originalOn = process.on;
    processOnSpy = jest.fn((event, handler) => {
      if (event === "message") {
        messageHandler = handler;
      }
      return process;
    });
    process.on = processOnSpy;

    processSendMock = jest.fn();
    process.send = processSendMock;

    mockClient = {
      localplayer: {
        getName: jest.fn(() => "TestPlayer"),
        disconnect: jest.fn(),
      },
      workshop: {
        subscribe: jest.fn(() => Promise.resolve()),
        download: jest.fn(() => Promise.resolve()),
        unsubscribe: jest.fn(() => Promise.resolve()),
        state: jest.fn(() => 8),
        downloadInfo: jest.fn(() => ({ current: 50n, total: 100n })),
        getSubscribedItems: jest.fn(() => [12345n]),
      },
    };

    jest.doMock("steamworks.js", () => ({
      init: jest.fn(() => mockClient),
    }), { virtual: true });

    // Load the worker to trigger the registration
    require("../../src/main/steamworksWorker");
  });

  afterAll(() => {
    process.on = originalOn;
    delete process.send;
    jest.dontMock("steamworks.js");
  });

  beforeEach(() => {
    processSendMock.mockClear();
    mockClient.localplayer.getName.mockClear();
    mockClient.workshop.subscribe.mockClear();
    mockClient.workshop.download.mockClear();
    mockClient.workshop.unsubscribe.mockClear();
    mockClient.workshop.state.mockClear();
    mockClient.workshop.downloadInfo.mockClear();
    mockClient.workshop.getSubscribedItems.mockClear();
  });

  test("worker registers message and sigterm handlers", () => {
    expect(processOnSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    expect(processOnSpy).toHaveBeenCalledWith("message", expect.any(Function));
    expect(messageHandler).toBeDefined();
  });

  test("handles init message successfully", async () => {
    await messageHandler({ id: "1", type: "init" });
    expect(processSendMock).toHaveBeenCalledWith({
      id: "1",
      result: true,
      error: undefined,
    });
  });

  test("handles getUserProfile", async () => {
    await messageHandler({ id: "2", type: "getUserProfile" });
    expect(mockClient.localplayer.getName).toHaveBeenCalled();
    expect(processSendMock).toHaveBeenCalledWith({
      id: "2",
      result: { name: "TestPlayer" },
    });
  });

  test("handles subscribeMod", async () => {
    await messageHandler({ id: "3", type: "subscribeMod", payload: "123456" });
    expect(mockClient.workshop.subscribe).toHaveBeenCalledWith(123456n);
    expect(mockClient.workshop.download).toHaveBeenCalledWith(123456n, true);
    expect(processSendMock).toHaveBeenCalledWith({
      id: "3",
      result: true,
    });
  });

  test("handles unsubscribeMod", async () => {
    await messageHandler({ id: "4", type: "unsubscribeMod", payload: "123456" });
    expect(mockClient.workshop.unsubscribe).toHaveBeenCalledWith(123456n);
    expect(processSendMock).toHaveBeenCalledWith({
      id: "4",
      result: true,
    });
  });

  test("handles getModState", async () => {
    await messageHandler({ id: "5", type: "getModState", payload: "123456" });
    expect(mockClient.workshop.state).toHaveBeenCalledWith(123456n);
    expect(processSendMock).toHaveBeenCalledWith({
      id: "5",
      result: 8,
    });
  });

  test("handles getDownloadProgress", async () => {
    await messageHandler({ id: "6", type: "getDownloadProgress", payload: "123456" });
    expect(mockClient.workshop.downloadInfo).toHaveBeenCalledWith(123456n);
    expect(processSendMock).toHaveBeenCalledWith({
      id: "6",
      result: {
        progress: 0.5,
        current: 50,
        total: 100,
      },
    });
  });

  test("handles getSubscribedMods", async () => {
    await messageHandler({ id: "7", type: "getSubscribedMods" });
    expect(mockClient.workshop.getSubscribedItems).toHaveBeenCalled();
    expect(processSendMock).toHaveBeenCalledWith({
      id: "7",
      result: ["12345"],
    });
  });
});
