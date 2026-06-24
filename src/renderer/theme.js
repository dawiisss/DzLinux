export function applyTheme(themeName) {
  document.body.className.split(" ").forEach((cls) => {
    if (cls.startsWith("theme-")) {
      document.body.classList.remove(cls);
    }
  });
  if (themeName && themeName !== "tactical-dark") {
    document.body.classList.add(`theme-${themeName}`);
  }
}

export function applyServerListMode(mode) {
  if (mode === "compact") {
    document.body.classList.add("compact-mode");
  } else {
    document.body.classList.remove("compact-mode");
  }
}

export function initTheme(settings) {
  applyTheme(settings.theme);
  applyServerListMode(settings.serverListMode || "standard");
  const themeSelect = document.getElementById("themeSelect");
  if (themeSelect) {
    themeSelect.addEventListener("change", (e) => applyTheme(e.target.value));
  }
}
