import { showToast } from "./feedback.js";

export function initCrashDiagnostic() {
  if (!window.api || !window.api.diagnostics) return;

  const crashModal = document.getElementById("crashDiagnosticModal");
  const crashDesc = document.getElementById("crashDiagnosticDescription");
  const crashSnippet = document.getElementById("crashDiagnosticSnippet");
  const crashFix = document.getElementById("crashDiagnosticFix");
  const crashCloseBtn = document.getElementById("crashDiagnosticCloseBtn");
  const crashCopyBtn = document.getElementById("crashDiagnosticCopyBtn");

  if (!crashModal) return;

  let latestCrashText = "";

  crashCopyBtn.addEventListener("click", () => {
    if (!latestCrashText) return;
    navigator.clipboard
      .writeText(latestCrashText)
      .then(() => {
        showToast("Crash log copied to clipboard", "#ff5a5f", "📋");
      })
      .catch(() => {});
  });

  window.api.diagnostics.onGameCrashed((diagnostic) => {
    if (diagnostic && diagnostic.status === "CRASH") {
      crashDesc.textContent =
        diagnostic.description || "Unknown error occurred.";
      crashSnippet.textContent = diagnostic.snippet || "> Log unavailable";
      crashFix.textContent =
        "🛠️ Suggested fix: " +
        (diagnostic.suggestedFix || "Check community forums for assistance.");

      latestCrashText = `[CRASH DIAGNOSTIC]\nStatus: ${diagnostic.status}\nDescription: ${diagnostic.description}\nSnippet: ${diagnostic.snippet}\nSuggested Fix: ${diagnostic.suggestedFix}`;
      crashModal.style.display = "flex";
    }
  });

  crashCloseBtn.addEventListener("click", () => {
    crashModal.style.display = "none";
  });
}
