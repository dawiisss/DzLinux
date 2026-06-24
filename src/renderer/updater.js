import { showToast } from "./feedback.js";

export function initUpdater() {
  document.addEventListener("DOMContentLoaded", async () => {
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
    };

    if (!elements.modal) return;

    let downloadInProgress = false;
    let downloaded = false;
    let fallbackDownloadUrl = null;

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

    // Crash Diagnostics Modal Logic
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
                showToast("CRASH LOG COPIED TO CLIPBOARD", "#ff5a5f", "📋");
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
      }

      elements.modal.style.display = "flex";
      elements.modal.style.animation =
        "fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
    };

    window.api.updater.onAvailable(async (info) => {
      const current = await window.api.app.getVersion();
      showUpdateAvailable({ ...info, currentVersion: current });
    });

    const result = await window.api.updater.check();
    if (result && result.kind === "system-package") {
      showSystemPackage(result);
    } else if (result && result.kind === "available") {
      const info = result.updateInfo;
      if (info && info.version) {
        showUpdateAvailable({ ...info, currentVersion: result.currentVersion });
      }
    } else if (result && result.kind === "error") {
      showToast("Update check failed. Check your internet connection.", "#ff5a5f", "⚠️");
    }
  });
}
