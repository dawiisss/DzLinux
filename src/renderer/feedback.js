// No utils needed here

export function showToast(message, borderHex = "#2ec4b6", icon = "📋") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.style.borderLeftColor = borderHex;

  const iconSpan = document.createElement("span");
  if (icon.trim().startsWith("<")) {
    iconSpan.innerHTML = icon;
  } else {
    iconSpan.textContent = icon;
  }
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
    showToast("IP address copied to system clipboard", "#2ec4b6", "📋");
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
