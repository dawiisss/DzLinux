/** @jest-environment jsdom */

const { initUpdater } = require("../../src/renderer/updater.js");

test("reopening a downloaded update keeps the install action and label together", async () => {
  document.body.innerHTML = [
    "currentVersionText", "latestVersionText", "updateReleaseNotes", "updateModal",
    "updateDismissBtn", "updateDownloadBtn", "updateProgressContainer", "updateProgressBar",
    "updateProgressText", "checkForUpdatesBtn",
  ].map(id => `<button id="${id}"></button>`).join("");

  let announceDownload;
  const updater = {
    check: jest.fn().mockResolvedValue({
      kind: "available", currentVersion: "2.1.2", updateInfo: { version: "2.1.3" },
    }),
    download: jest.fn().mockResolvedValue(true),
    install: jest.fn().mockResolvedValue(),
    onProgress: jest.fn(),
    onAvailable: jest.fn(),
    onError: jest.fn(),
    onDownloaded: callback => { announceDownload = callback; },
  };
  window.api = { updater };
  initUpdater();
  await Promise.resolve();

  const action = document.getElementById("updateDownloadBtn");
  expect(action.textContent).toBe("Download");
  action.click();
  expect(updater.download).toHaveBeenCalledTimes(1);
  announceDownload({ version: "2.1.3" });
  document.getElementById("updateDismissBtn").click();
  document.getElementById("checkForUpdatesBtn").click();

  expect(action.textContent).toBe("Install & Restart");
  expect(updater.install).not.toHaveBeenCalled();
  action.click();
  expect(updater.install).toHaveBeenCalledTimes(1);
});
