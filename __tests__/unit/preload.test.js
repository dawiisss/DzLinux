let mockExposedApis = {};

jest.mock(
  "electron",
  () => ({
    contextBridge: {
      exposeInMainWorld: jest.fn((key, api) => {
        mockExposedApis[key] = api;
      }),
    },
    ipcRenderer: {
      invoke: jest.fn(() => Promise.resolve("mocked-invoke-result")),
      send: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn(),
      removeAllListeners: jest.fn(),
    },
  }),
  { virtual: true }
);

describe("preload", () => {
  beforeEach(() => {
    mockExposedApis = {};
    jest.clearAllMocks();
    
    // Load preload.js to trigger contextBridge exposure
    jest.resetModules();
    require("../../src/main/preload");
  });

  test("exposes api object in main world", () => {
    const { contextBridge } = require("electron");
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith("api", expect.any(Object));
    expect(mockExposedApis.api).toBeDefined();
  });

  test("app endpoints delegate to ipcRenderer", async () => {
    const { ipcRenderer } = require("electron");
    const result = await mockExposedApis.api.app.getVersion();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("get-version");
    expect(result).toBe("mocked-invoke-result");
  });

  test("settings endpoints delegate to ipcRenderer", async () => {
    const { ipcRenderer } = require("electron");
    await mockExposedApis.api.settings.load();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("load-settings");

    const dummySettings = { theme: "toxic" };
    await mockExposedApis.api.settings.save(dummySettings);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("save-settings", dummySettings);
  });

  test("servers endpoints delegate to ipcRenderer", async () => {
    const { ipcRenderer } = require("electron");
    await mockExposedApis.api.servers.fetch("gen-123");
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("fetch-servers", "gen-123");

    await mockExposedApis.api.servers.ping("1.2.3.4", 2302, 27015);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("ping-server", "1.2.3.4", 2302, 27015);
  });

  test("servers listener helpers register and remove ipcRenderer listeners", () => {
    const { ipcRenderer } = require("electron");
    const mockCallback = jest.fn();

    const unsubscribe = mockExposedApis.api.servers.onBatch(mockCallback);
    expect(ipcRenderer.on).toHaveBeenCalledWith("servers-batch", expect.any(Function));

    const handler = ipcRenderer.on.mock.calls[0][1];
    handler({}, "batch-data", "gen-123");
    expect(mockCallback).toHaveBeenCalledWith("batch-data", "gen-123");

    unsubscribe();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith("servers-batch", handler);
  });

  test("ui endpoints delegate to ipcRenderer", async () => {
    const { ipcRenderer } = require("electron");
    
    mockExposedApis.api.ui.windowMin();
    expect(ipcRenderer.send).toHaveBeenCalledWith("window-min");

    mockExposedApis.api.ui.windowMax();
    expect(ipcRenderer.send).toHaveBeenCalledWith("window-max");

    mockExposedApis.api.ui.windowClose();
    expect(ipcRenderer.send).toHaveBeenCalledWith("window-close");

    await mockExposedApis.api.ui.openExternal("https://google.com");
    expect(ipcRenderer.invoke).toHaveBeenCalledWith("open-external", "https://google.com");
  });

  test("ui.openExternal rejects invalid URLs", async () => {
    await expect(mockExposedApis.api.ui.openExternal("invalid-url")).rejects.toThrow("Invalid URL scheme");
    await expect(mockExposedApis.api.ui.openExternal("ftp://unsafe")).rejects.toThrow("Invalid URL scheme");
  });
});
