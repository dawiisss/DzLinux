import { showToast } from "./feedback.js";

export function initUpdater() {
  if (!window.api || !window.api.updater) return;

  const elements = {
    currentVersion: document.getElementById("currentVersionText"),
    latestVersion: document.getElementById("latestVersionText"),
    releaseNotes: document.getElementById("updateReleaseNotes"),
    modal: document.getElementById("updateModal"),
    dismissBtn: document.getElementById("updateDismissBtn"),
    downloadBtn: document.getElementById("updateDownloadBtn"),
    progressContainer: document.getElementById("updateProgressContainer"),
    progressBar: document.getElementById("updateProgressBar"),
    progressText: document.getElementById("updateProgressText"),
    checkForUpdatesBtn: document.getElementById("checkForUpdatesBtn"),
  };

  if (!elements.modal) return;

  let downloadInProgress = false;
  let downloaded = false;
  let fallbackDownloadUrl = null;
  let latestResult = null;

  const dismiss = () => {
    elements.modal.style.display = "none";
  };

  elements.dismissBtn.addEventListener("click", dismiss);

  elements.downloadBtn.addEventListener("click", () => {
    if (downloaded) {
      window.api.updater.install().catch((err) => {
        console.error("Update installation failed:", err);
        showToast("Update installation failed.", "#ff5a5f", "alert");
      });
      return;
    }
    if (downloadInProgress) return;
    if (fallbackDownloadUrl) {
      window.api.ui.openExternal(fallbackDownloadUrl).catch((err) => {
        console.error("Failed to open release page:", err);
        showToast("Could not open the release page.", "#ff5a5f", "alert");
      });
      return;
    }
    downloadInProgress = true;
    elements.downloadBtn.style.display = "none";
    elements.progressContainer.style.display = "block";
    window.api.updater.download()
      .then((success) => {
        if (!success) throw new Error("The update could not be downloaded");
      })
      .catch((err) => {
        console.error("Update download failed:", err);
        downloadInProgress = false;
        elements.progressContainer.style.display = "none";
        elements.downloadBtn.style.display = "inline-flex";
        showToast(`Update download failed: ${err.message}`, "#ff5a5f", "alert");
      });
  });

  window.api.updater.onProgress((progress) => {
    const pct = Math.round(progress.percent);
    elements.progressBar.style.width = pct + "%";
    elements.progressText.textContent = `Downloading... ${pct}% (${(progress.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s)`;
  });

  window.api.updater.onDownloaded(() => {
    downloaded = true;
    elements.progressText.textContent = "Download complete.";
    elements.downloadBtn.textContent = "Install & Restart";
    elements.downloadBtn.style.display = "inline-flex";
    elements.progressContainer.style.display = "none";
  });

  window.api.updater.onError((err) => {
    console.error("Update error:", err.message);
    downloadInProgress = false;
    elements.progressContainer.style.display = "none";
    elements.downloadBtn.style.display = "inline-flex";
    showToast("Update download failed. Please try again.", "#ff5a5f", "alert");
  });

  const showSystemPackage = (info) => {
    elements.currentVersion.textContent = "v" + (info.currentVersion || "");
    elements.latestVersion.textContent = "System Package";
    elements.releaseNotes.textContent =
      'This installation is managed by your system package manager. Use "apt upgrade" or "dnf update" to update, or download the latest release manually.';
    fallbackDownloadUrl =
      info.releaseUrl || "https://github.com/dawiisss/DzLinux/releases/latest";
    elements.downloadBtn.textContent = "Open release page";
    elements.modal.style.display = "flex";
  };

  const showUpdateAvailable = (info) => {
    elements.currentVersion.textContent = "v" + (info.currentVersion || "");
    elements.latestVersion.textContent = "v" + info.version;

    // Strip HTML tags since release notes from electron-updater come as HTML
    const cleanNotes = (info.releaseNotes || "No release notes provided.")
      .replace(/<br\s*\/?>/gi, "\n") // Convert breaks to newlines
      .replace(/<\/p>/gi, "\n\n") // Add spacing for paragraphs
      .replace(/<li>/gi, "• ") // Add bullet points for lists
      .replace(/<\/?[^>]+(>|$)/g, "") // Strip all remaining HTML tags
      .trim();

    elements.releaseNotes.textContent =
      cleanNotes || "No release notes provided.";
    fallbackDownloadUrl = info.downloadUrl || null;
    if (fallbackDownloadUrl) {
      elements.downloadBtn.textContent = "Open release page";
    } else {
      elements.downloadBtn.textContent = "Download";
    }

    elements.modal.style.display = "flex";
    elements.modal.style.animation = "fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
  };

  window.api.updater.onAvailable(async (info) => {
    const current = await window.api.app.getVersion();
    latestResult = {
      kind: "available",
      currentVersion: current,
      updateInfo: info,
    };
    if (elements.checkForUpdatesBtn) {
      elements.checkForUpdatesBtn.classList.add("update-btn-pulsate");
      elements.checkForUpdatesBtn.title = "Update Available! Click to view.";
    }
    showUpdateAvailable({ ...info, currentVersion: current });
  });

  const checkAndShow = async () => {
    try {
      const result = await window.api.updater.check();
      latestResult = result;
      if (result && result.kind === "system-package") {
        showSystemPackage(result);
        if (elements.checkForUpdatesBtn) {
          elements.checkForUpdatesBtn.classList.add("update-btn-pulsate");
          elements.checkForUpdatesBtn.title =
            "Update Available! Click to view.";
        }
      } else if (result && result.kind === "available") {
        const info = result.updateInfo;
        if (info && info.version) {
          showUpdateAvailable({
            ...info,
            currentVersion: result.currentVersion,
          });
        }
        if (elements.checkForUpdatesBtn) {
          elements.checkForUpdatesBtn.classList.add("update-btn-pulsate");
          elements.checkForUpdatesBtn.title =
            "Update Available! Click to view.";
        }
      }
    } catch (err) {
      console.error("Startup update check failed:", err);
    }
  };

  checkAndShow();

  if (elements.checkForUpdatesBtn) {
    elements.checkForUpdatesBtn.addEventListener("click", async () => {
      // If we already know an update is available, open the modal directly without checking again
      if (
        latestResult &&
        (latestResult.kind === "available" ||
          latestResult.kind === "system-package")
      ) {
        if (latestResult.kind === "system-package") {
          showSystemPackage(latestResult);
        } else {
          const info = latestResult.updateInfo;
          if (info && info.version) {
            showUpdateAvailable({
              ...info,
              currentVersion: latestResult.currentVersion,
            });
          }
        }
        return;
      }

      showToast("Checking for updates...", "#2ec4b6", "rotate-ccw");
      try {
        const result = await window.api.updater.check();
        latestResult = result;
        if (result && result.kind === "system-package") {
          showSystemPackage(result);
          elements.checkForUpdatesBtn.classList.add("update-btn-pulsate");
          elements.checkForUpdatesBtn.title =
            "Update Available! Click to view.";
        } else if (result && result.kind === "available") {
          const info = result.updateInfo;
          if (info && info.version) {
            showUpdateAvailable({
              ...info,
              currentVersion: result.currentVersion,
            });
          }
          elements.checkForUpdatesBtn.classList.add("update-btn-pulsate");
          elements.checkForUpdatesBtn.title =
            "Update Available! Click to view.";
        } else if (result && result.kind === "not-available") {
          showToast("Your DzLinux client is up to date", "#2ec4b6", "check");
          elements.checkForUpdatesBtn.classList.remove("update-btn-pulsate");
          elements.checkForUpdatesBtn.title = "Check for Updates";
        } else {
          showToast(
            "Update check failed. Check your internet connection.",
            "#ff5a5f",
            "alert",
          );
        }
      } catch (err) {
        console.error("Manual check failed:", err);
        showToast("Update check failed.", "#ff5a5f", "alert");
      }
    });
  }
}
