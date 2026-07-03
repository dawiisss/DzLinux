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
  let isSilentCheck = false;

  const dismiss = () => {
    elements.modal.style.display = "none";
  };

  elements.dismissBtn.onclick = dismiss;

  elements.downloadBtn.onclick = () => {
    if (downloaded) {
      window.api.updater.install();
      return;
    }
    if (downloadInProgress) return;
    if (fallbackDownloadUrl) {
      window.api.ui.openExternal(fallbackDownloadUrl);
      return;
    }
    downloadInProgress = true;
    elements.downloadBtn.style.display = "none";
    elements.progressContainer.style.display = "block";
    window.api.updater.download();
  };

  window.api.updater.onProgress((progress) => {
    const pct = Math.round(progress.percent);
    elements.progressBar.style.width = pct + "%";
    elements.progressText.textContent = `Downloading... ${pct}% (${(progress.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s)`;
  });

  window.api.updater.onDownloaded(() => {
    downloaded = true;
    elements.progressText.textContent = "Download complete.";
    elements.downloadBtn.textContent = "INSTALL & RESTART";
    elements.downloadBtn.style.display = "inline-flex";
    elements.progressContainer.style.display = "none";
  });

  window.api.updater.onError((err) => {
    console.error("Update error:", err.message);
  });

  const crashModal = document.getElementById("crashDiagnosticModal");
  const crashDesc = document.getElementById("crashDiagnosticDescription");
  const crashSnippet = document.getElementById("crashDiagnosticSnippet");
  const crashFix = document.getElementById("crashDiagnosticFix");
  const crashCloseBtn = document.getElementById("crashDiagnosticCloseBtn");
  const crashCopyBtn = document.getElementById("crashDiagnosticCopyBtn");

  if (crashModal) {
    window.api.diagnostics.onGameCrashed((diagnostic) => {
      if (diagnostic && diagnostic.status === "CRASH") {
        crashDesc.textContent =
          diagnostic.description || "Unknown error occurred.";
        crashSnippet.textContent = diagnostic.snippet || "> LOG UNAVAILABLE";
        crashFix.textContent =
          "🛠️ SUGGESTED FIX: " +
          (diagnostic.suggestedFix ||
            "Check community forums for assistance.");

        crashModal.style.display = "flex";

        crashCopyBtn.onclick = () => {
          const text = `[CRASH DIAGNOSTIC]\nStatus: ${diagnostic.status}\nDescription: ${diagnostic.description}\nSnippet: ${diagnostic.snippet}\nSuggested Fix: ${diagnostic.suggestedFix}`;
          navigator.clipboard
            .writeText(text)
            .then(() => {
              showToast("Crash log copied to clipboard", "#ff5a5f", "📋");
            })
            .catch(() => {});
        };
      }
    });

    crashCloseBtn.onclick = () => {
      crashModal.style.display = "none";
    };
  }

  const showSystemPackage = (info) => {
    elements.currentVersion.textContent = "v" + (info.currentVersion || "");
    elements.latestVersion.textContent = "System Package";
    elements.releaseNotes.textContent =
      'This installation is managed by your system package manager. Use "apt upgrade" or "dnf update" to update, or download the latest release manually.';
    fallbackDownloadUrl =
      info.releaseUrl ||
      "https://github.com/dawiisss/DzLinux/releases/latest";
    elements.downloadBtn.textContent = "OPEN RELEASE PAGE";
    elements.modal.style.display = "flex";
  };

  const showUpdateAvailable = (info) => {
    elements.currentVersion.textContent = "v" + (info.currentVersion || "");
    elements.latestVersion.textContent = "v" + info.version;
    elements.releaseNotes.textContent =
      info.releaseNotes || "No release notes provided.";
    fallbackDownloadUrl = info.downloadUrl || null;
    if (fallbackDownloadUrl) {
      elements.downloadBtn.textContent = "OPEN RELEASE PAGE";
    } else {
      elements.downloadBtn.textContent = "DOWNLOAD";
    }

    elements.modal.style.display = "flex";
    elements.modal.style.animation =
      "fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
  };

  window.api.updater.onAvailable(async (info) => {
    const current = await window.api.app.getVersion();
    latestResult = {
      kind: "available",
      currentVersion: current,
      updateInfo: info
    };
    if (elements.checkForUpdatesBtn) {
      elements.checkForUpdatesBtn.classList.add("update-btn-pulsate");
      elements.checkForUpdatesBtn.title = "Update Available! Click to view.";
    }
    if (!isSilentCheck) {
      showUpdateAvailable({ ...info, currentVersion: current });
    }
  });

  const checkAndShow = async () => {
    isSilentCheck = false;
    try {
      const result = await window.api.updater.check();
      latestResult = result;
      if (result && result.kind === "system-package") {
        showSystemPackage(result);
        if (elements.checkForUpdatesBtn) {
          elements.checkForUpdatesBtn.classList.add("update-btn-pulsate");
          elements.checkForUpdatesBtn.title = "Update Available! Click to view.";
        }
      } else if (result && result.kind === "available") {
        const info = result.updateInfo;
        if (info && info.version) {
          showUpdateAvailable({ ...info, currentVersion: result.currentVersion });
        }
        if (elements.checkForUpdatesBtn) {
          elements.checkForUpdatesBtn.classList.add("update-btn-pulsate");
          elements.checkForUpdatesBtn.title = "Update Available! Click to view.";
        }
      }
    } catch (err) {
      console.error("Startup update check failed:", err);
    }
  };

  const performSilentCheck = async () => {
    isSilentCheck = true;
    try {
      const result = await window.api.updater.check();
      latestResult = result;
      if (elements.checkForUpdatesBtn) {
        if (result && (result.kind === "available" || result.kind === "system-package")) {
          elements.checkForUpdatesBtn.classList.add("update-btn-pulsate");
          elements.checkForUpdatesBtn.title = "Update Available! Click to view.";
        } else {
          elements.checkForUpdatesBtn.classList.remove("update-btn-pulsate");
          elements.checkForUpdatesBtn.title = "Check for Updates";
        }
      }
    } catch (err) {
      console.error("Silent background update check failed:", err);
    } finally {
      setTimeout(() => {
        isSilentCheck = false;
      }, 5000);
    }
  };

  checkAndShow();

  // Polling every 60 seconds (1 minute)
  setInterval(performSilentCheck, 60000);

  if (elements.checkForUpdatesBtn) {
    elements.checkForUpdatesBtn.onclick = async () => {
      // If we already know an update is available, open the modal directly without checking again
      if (latestResult && (latestResult.kind === "available" || latestResult.kind === "system-package")) {
        if (latestResult.kind === "system-package") {
          showSystemPackage(latestResult);
        } else {
          const info = latestResult.updateInfo;
          if (info && info.version) {
            showUpdateAvailable({ ...info, currentVersion: latestResult.currentVersion });
          }
        }
        return;
      }

      showToast("Checking for updates...", "#2ec4b6", "🔄");
      try {
        const result = await window.api.updater.check();
        latestResult = result;
        if (result && result.kind === "system-package") {
          showSystemPackage(result);
          elements.checkForUpdatesBtn.classList.add("update-btn-pulsate");
          elements.checkForUpdatesBtn.title = "Update Available! Click to view.";
        } else if (result && result.kind === "available") {
          const info = result.updateInfo;
          if (info && info.version) {
            showUpdateAvailable({ ...info, currentVersion: result.currentVersion });
          }
          elements.checkForUpdatesBtn.classList.add("update-btn-pulsate");
          elements.checkForUpdatesBtn.title = "Update Available! Click to view.";
        } else if (result && result.kind === "not-available") {
          showToast("Your DzLinux client is up to date", "#2ec4b6", "✓");
          elements.checkForUpdatesBtn.classList.remove("update-btn-pulsate");
          elements.checkForUpdatesBtn.title = "Check for Updates";
        } else {
          showToast("Update check failed. Check your internet connection.", "#ff5a5f", "⚠️");
        }
      } catch (err) {
        console.error("Manual check failed:", err);
        showToast("Update check failed.", "#ff5a5f", "⚠️");
      }
    };
  }
}
