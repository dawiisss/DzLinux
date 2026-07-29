// No utils needed here

export function showToast(message, borderHex = "var(--accent)", icon = "clipboard", onClick = null) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.style.borderLeftColor = borderHex;

  if (typeof onClick === "function") {
    toast.style.cursor = "pointer";
    toast.addEventListener("click", () => {
      onClick();
      toast.remove();
    });
  }

  let iconHtml = icon;
  if (typeof icon === "string" && !icon.trim().startsWith("<")) {
    if (/^[a-z0-9-]+$/.test(icon)) {
      iconHtml = `<app-icon name="${icon}" style="width: 1.1rem; height: 1.1rem; vertical-align: middle;"></app-icon>`;
    } else {
      // Fallback: render the original string (like an emoji) directly as text
      iconHtml = icon;
    }
  }

  const iconSpan = document.createElement("span");
  iconSpan.innerHTML = iconHtml;
  toast.appendChild(iconSpan);
  toast.appendChild(document.createTextNode("\u00A0 \u00A0 "));
  toast.appendChild(document.createTextNode(message));

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(15px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

export function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast("IP address copied to system clipboard", "#2ec4b6", "clipboard");
  }).catch((err) => {
    console.error("Clipboard copy failed", err);
    showToast("Failed to copy to clipboard", "#ef233c", "alert");
  });
}

export function showConfirmModal(message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("confirmModal");
    const msgEl = document.getElementById("confirmModalMessage");
    const okBtn = document.getElementById("confirmModalOkBtn");
    const cancelBtn = document.getElementById("confirmModalCancelBtn");

    msgEl.textContent = message;
    overlay.style.display = "flex";

    const cleanup = (result) => {
      overlay.style.display = "none";
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlayClick);
      resolve(result);
    };

    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onOverlayClick = (e) => {
      if (e.target === overlay) cleanup(false);
    };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlayClick);
  });
}
