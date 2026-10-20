import { favoriteKey } from "./favoriteIdentity.js";
import { state, addFavorite, removeFavorite } from "./state.js";
import { showToast, copyToClipboard, showConfirmModal } from "./feedback.js";
import { renderFavoritesManager, getPlaceholderServerById } from "./favorites.js";

import { STAR_FAV_SVG, STAR_UNFAV_SVG } from "./utils.js";

const PLUG_SVG = `<app-icon name="plug" style="width: 1rem; height: 1rem; vertical-align: middle; color: var(--accent);"></app-icon>`;
const EYE_SVG = `<app-icon name="eye" style="width: 1rem; height: 1rem; vertical-align: middle; color: var(--accent-green);"></app-icon>`;
const COPY_SVG = `<app-icon name="copy" style="width: 1rem; height: 1rem; vertical-align: middle; color: var(--accent);"></app-icon>`;

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

    const rowId = row.id.replace(/^(?:fav-row-|row-)/, "");
    const server =
      state.allServers.find((s) => s.id === rowId) ||
      getPlaceholderServerById(rowId);
    if (!server) return;

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.top = `${e.clientY}px`;
    menu.style.left = `${e.clientX}px`;

    const addMenuItem = (label, icon, onClick) => {
      const item = document.createElement("div");
      item.className = "context-menu-item";
      const iconSpan = document.createElement("span");
      if (icon.trim().startsWith("<")) {
        iconSpan.innerHTML = icon;
      } else {
        iconSpan.textContent = icon;
      }
      item.appendChild(iconSpan);
      item.appendChild(document.createTextNode(` ${label}`));
      item.addEventListener("click", () => {
        Promise.resolve(onClick()).catch((err) => {
          console.error(`Context menu action failed: ${label}`, err);
          showToast("Action failed", "#ff5a5f", "alert");
        });
        hideContextMenu();
      });
      menu.appendChild(item);
    };

    addMenuItem("Quick Connect", PLUG_SVG, () => {
      document.dispatchEvent(new CustomEvent("dzlinux:connect-server", { detail: { server, options: { forceModQuery: Boolean(row.closest("#favorites")) } } }));
    });

    const isFav = state.favoritesSet.has(favoriteKey(server.ip, server.port));
    addMenuItem(
      isFav ? "Remove Favorite" : "Add Favorite",
      isFav ? STAR_FAV_SVG : STAR_UNFAV_SVG,
      async () => {
        if (isFav) {
          if (row.closest("#favorites") && !await showConfirmModal("Remove this favorite? History and Watchlist entries will remain.")) return;
          await removeFavorite(server.ip, server.port);
        } else {
          await addFavorite(
            server.ip,
            server.port,
            server.queryPort,
            server.name,
          );
        }

        document.dispatchEvent(new CustomEvent("dzlinux:render-servers"));

        document
          .querySelectorAll(`#row-${server.id} .star-btn, #fav-row-${server.id} .star-btn`)
          .forEach((starBtn) => {
            starBtn.innerHTML = isFav ? STAR_UNFAV_SVG : STAR_FAV_SVG;
            starBtn.className = isFav ? "star-btn" : "star-btn active";
            starBtn.title = isFav ? "Add to Favorites" : "Remove from Favorites";
            starBtn.setAttribute(
              "aria-label",
              isFav ? "Add to Favorites" : "Remove from Favorites",
            );
          });
        renderFavoritesManager();
      },
    );

    const divider = document.createElement("div");
    divider.className = "context-menu-divider";
    menu.appendChild(divider);

    addMenuItem("Watch server", EYE_SVG, () => {
      document.dispatchEvent(new CustomEvent("dzlinux:watch-server", { detail: { server } }));
    });

    addMenuItem("Copy Address", COPY_SVG, () =>
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

export function setCurrentContextMenu(menu) {
  hideContextMenu();
  currentContextMenu = menu;
}
