const { Notification: DesktopNotification, BrowserWindow } = require("electron");
const path = require("node:path");

function createNotifications(onClick) {
  const active = new Set();
  return {
    deliver(event) {
      if (!DesktopNotification.isSupported()) return;
      try {
        if (active.size >= 100) {
          const oldest = active.values().next().value;
          oldest.close();
          active.delete(oldest);
        }
        const notification = new DesktopNotification({
          title: "Watchlist condition met", body: `${event.server.name || event.server.ip}: ${event.condition}`,
          icon: path.join(__dirname, "..", "assets", "icon.png"),
        });
        active.add(notification);
        notification.on("close", () => active.delete(notification));
        notification.on("failed", () => active.delete(notification));
        notification.on("click", () => {
          active.delete(notification);
          const win = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed());
          if (!win) return;
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
          void Promise.resolve(onClick(event, win.webContents)).catch((error) => console.error("Watchlist notification click failed:", error));
        });
        notification.show();
      } catch (error) {
        console.error("Watchlist desktop notification failed:", error);
      }
    },
    close() {
      for (const notification of active) notification.close();
      active.clear();
    },
  };
}

module.exports = { createNotifications };
