import { state, addFavorite, removeFavorite } from "./state.js";
import { showToast, copyToClipboard } from "./feedback.js";
import { renderFavoritesManager } from "./favorites.js";

let currentContextMenu = null;

export function hideContextMenu() {
  if (currentContextMenu) {
    currentContextMenu.remove();
    currentContextMenu = null;
  }
}

export function initContextMenu() {
  document.addEventListener("click", hideContextMenu);
  document.addEventListener("contextmenu", async (e) => {
    const row = e.target.closest(".server-row");
    if (!row) {
      hideContextMenu();
      return;
    }

    e.preventDefault();
    hideContextMenu();

    const rowId = row.id.replace("row-", "").replace("fav-", "");
    const server = state.allServers.find((s) => s.id === rowId);
    if (!server) return;

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.top = `${e.clientY}px`;
    menu.style.left = `${e.clientX}px`;

    const addMenuItem = (label, icon, onClick) => {
      const item = document.createElement("div");
      item.className = "context-menu-item";
      const iconSpan = document.createElement("span");
      iconSpan.textContent = icon;
      item.appendChild(iconSpan);
      item.appendChild(document.createTextNode(` ${label}`));
      item.addEventListener("click", () => {
        onClick();
        hideContextMenu();
      });
      menu.appendChild(item);
    };

    addMenuItem("QUICK CONNECT", "🔌", () => {
      import("./serverBrowser.js").then(({ connectToServer }) =>
        connectToServer(server.ip, server.port),
      );
    });

    const isFav = state.favoritesSet.has(`${server.ip}:${server.port}`);
    addMenuItem(
      isFav ? "REMOVE FAVORITE" : "ADD FAVORITE",
      isFav ? "⭐" : "☆",
      async () => {
        if (isFav) {
          await removeFavorite(server.ip, server.port);
        } else {
          await addFavorite(
            server.ip,
            server.port,
            server.queryPort,
            server.name,
          );
        }

        import("./serverBrowser.js").then(({ renderServers }) =>
          renderServers(),
        );

        const starBtn = document.querySelector(`#row-${server.id} .star-btn`);
        if (starBtn) {
          starBtn.innerHTML = isFav ? "☆" : "★";
          starBtn.className = isFav ? "star-btn" : "star-btn active";
          starBtn.title = isFav ? "Add to Favorites" : "Remove from Favorites";
          starBtn.setAttribute(
            "aria-label",
            isFav ? "Add to Favorites" : "Remove from Favorites",
          );
        }
        renderFavoritesManager();
      },
    );

    const divider = document.createElement("div");
    divider.className = "context-menu-divider";
    menu.appendChild(divider);

    addMenuItem("WATCH SERVER", "👁️", async () => {
      const watchlist = await window.api.watchlist.load();
      if (
        watchlist.some(
          (item) => item.ip === server.ip && item.port === server.port,
        )
      ) {
        showToast("ALREADY ON WATCHLIST", "var(--accent)", "ℹ️");
        return;
      }
      watchlist.push({
        ip: server.ip,
        port: server.port,
        queryPort: server.queryPort || null,
        name: server.name,
        active: true,
        threshold: 50,
        mode: "below",
        lastStatus: "idle",
      });
      await window.api.watchlist.save(watchlist);
      showToast(`WATCHING: ${server.name}`, "var(--accent-green)", "👁️");
    });

    addMenuItem("COPY ADDRESS", "📋", () =>
      copyToClipboard(`${server.ip}:${server.port}`),
    );

    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${e.clientY - rect.height}px`;
    }
    if (rect.right > window.innerWidth) {
      menu.style.left = `${e.clientX - rect.width}px`;
    }

    currentContextMenu = menu;
  });
}
