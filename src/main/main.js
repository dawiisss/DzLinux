const { app, BrowserWindow, nativeImage } = require("electron");
const path = require("node:path");
const { initLogger, closeLogger } = require("./logger");
const settingsManager = require("./settings");
const { setupAutoUpdater } = require("./updater");
const steamworksManager = require("./steamworksManager");
const { registerIpcHandlers } = require("./ipcHandlers");

const settings = settingsManager.loadSettings();
if (settings.nativeWayland && process.env.XDG_SESSION_TYPE === "wayland") {
  app.commandLine.appendSwitch("enable-features", "UseOzonePlatform");
  app.commandLine.appendSwitch("ozone-platform", "wayland");
}

// Optimize V8 engine memory footprint for the main process and renderers
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=512 --optimize-for-size");

if (process.platform === "linux" && typeof app.setDesktopName === "function") {
  app.setDesktopName("DzLinux");
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 800,
    frame: false,
    icon: nativeImage.createFromPath(path.join(__dirname, "..", "assets", "icon.png")),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadFile(path.join(__dirname, "..", "index.html"));
  return win;
};

app.whenReady().then(async () => {
  await initLogger();
  registerIpcHandlers();

  const mainWindow = createWindow();
  setupAutoUpdater(mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let isQuitting = false;
app.on("before-quit", (event) => {
  if (isQuitting) return;
  isQuitting = true;
  event.preventDefault();
  const shutdownTimeout = setTimeout(() => {
    console.warn("Shutdown timed out, forcing exit");
    app.exit(0);
  }, 5000);

  const serverQuery = require("./serverQuery");

  Promise.all([
    steamworksManager.shutdown(),
    serverQuery.getCacheWriteQueue(),
  ])
    .then(() => {
      closeLogger();
      clearTimeout(shutdownTimeout);
      app.exit(0);
    })
    .catch((err) => {
      console.error("Failed during graceful shutdown:", err);
      clearTimeout(shutdownTimeout);
      app.exit(0);
    });
});
