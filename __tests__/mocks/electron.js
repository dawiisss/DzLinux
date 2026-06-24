const path = require("path");
const os = require("os");

const tmpDir = path.join(os.tmpdir(), "dzlinux-test-data");

module.exports = {
  app: {
    getPath: jest.fn(() => tmpDir),
    getVersion: jest.fn(() => "1.0.7"),
    isPackaged: false,
    getAppPath: jest.fn(() => "/tmp/dzlinux-test"),
    commandLine: { appendSwitch: jest.fn() },
    whenReady: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    quit: jest.fn(),
    exit: jest.fn(),
  },
  BrowserWindow: Object.assign(
    jest.fn(() => ({
      loadFile: jest.fn(),
      webContents: { send: jest.fn(), isDestroyed: jest.fn(() => false) },
      isDestroyed: jest.fn(() => false),
      isMaximized: jest.fn(() => false),
      minimize: jest.fn(),
      maximize: jest.fn(),
      unmaximize: jest.fn(),
      close: jest.fn(),
    })),
    {
      getFocusedWindow: jest.fn(() => null),
      getAllWindows: jest.fn(() => []),
    },
  ),
  ipcMain: { handle: jest.fn(), on: jest.fn() },
  ipcRenderer: {
    invoke: jest.fn(),
    send: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
  },
  shell: { openExternal: jest.fn(), openPath: jest.fn() },
  dialog: { showMessageBox: jest.fn() },
  contextBridge: { exposeInMainWorld: jest.fn() },
  nativeImage: { createFromPath: jest.fn(() => ({})) },
};
