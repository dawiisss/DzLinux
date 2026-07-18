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

export function applyLayoutMode(mode) {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  if (mode === "modern") {
    document.body.classList.add("layout-modern");
  } else {
    document.body.classList.remove("layout-modern");
  }
}

export function initTheme(settings) {
  applyTheme(settings.theme);
  applyServerListMode(settings.serverListMode || "compact");
  applyLayoutMode(settings.layoutMode || "modern");

  const themeSelect = document.getElementById("themeSelect");
  if (themeSelect) {
    themeSelect.addEventListener("change", (e) => applyTheme(e.target.value));
  }

  const layoutSelect = document.getElementById("layoutModeSelect");
  if (layoutSelect) {
    layoutSelect.addEventListener("change", (e) => applyLayoutMode(e.target.value));
  }

  const sidebar = document.getElementById("sidebar");
  const toggleBtn = document.getElementById("sidebar-toggle");
  if (sidebar && toggleBtn && !toggleBtn.dataset.bound) {
    toggleBtn.dataset.bound = "true";

    // Set initial pinned state based on settings
    const isPinned = settings.sidebarPinned === true;
    if (isPinned) {
      sidebar.classList.add("pinned");
    } else {
      sidebar.classList.remove("pinned");
    }

    toggleBtn.addEventListener("click", async () => {
      sidebar.classList.toggle("pinned");
      settings.sidebarPinned = sidebar.classList.contains("pinned");
      if (window.api && window.api.settings && window.api.settings.save) {
        await window.api.settings.save(settings);
      }
    });
  }
}


