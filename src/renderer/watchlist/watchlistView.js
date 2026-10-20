import { element, button } from "./dialog.js";
import { describeCondition } from "./watchlistEditor.js";

export function relativeTime(timestamp, now = Date.now()) {
  if (!timestamp) return "Not checked yet";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return `Checked ${seconds} seconds ago`;
  return `Checked ${Math.floor(seconds / 60)} minutes ago`;
}

function monitoring(entry, snapshot) {
  const observation = entry.observation;
  if (!snapshot.enabled) return ["Paused", "Watchlist is disabled", "eye"];
  if (entry.snoozedUntil > Date.now()) return ["Snoozed", "Until " + new Date(entry.snoozedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), "clock"];
  if (!entry.enabled) return [entry.pausedReason === "alerted" ? "Alerted — paused" : "Paused", entry.pausedReason === "alerted" ? "Select Watch again to rearm" : "Resume to monitor", "bell"];
  if (observation?.checking) return ["Checking", relativeTime(observation.completedAt), "loader"];
  if (!snapshot.polling) return ["Polling disabled", observation ? relativeTime(observation.completedAt) : "Refresh to check now", "clock"];
  if (!observation?.completedAt) return ["Not checked", "Waiting for first check", "clock"];
  if (Date.now() - observation.completedAt > Math.max(30000, 2 * snapshot.intervalMs)) return ["Stale", relativeTime(observation.completedAt), "alert"];
  if (observation.status === "unreachable") return [entry.condition.type === "server-back-online" && entry.runtime.outageArmed ? "Watching for return" : "Unreachable", relativeTime(observation.completedAt), "alert"];
  if (entry.condition.type === "server-back-online") return [entry.runtime.outageArmed ? "Watching for return" : "Watching", relativeTime(observation.completedAt), "eye"];
  if (observation.players === null || (entry.condition.type === "free-slots" && observation.capacity === null)) return ["Waiting for data", "Population or capacity unknown", "info"];
  return [entry.runtime.match ? "Condition met" : "Waiting", relativeTime(observation.completedAt), entry.runtime.match ? "check" : "eye"];
}

export function createWatchlistView(tbody, onAction) {
  const rows = new Map();
  let openMenu = null;
  function closeMenu() {
    if (!openMenu) return;
    const { menu, trigger } = openMenu;
    menu.remove(); trigger.setAttribute("aria-expanded", "false"); openMenu = null;
  }
  function showMenu(trigger, entry) {
    if (openMenu?.trigger === trigger) { closeMenu(); return; }
    closeMenu();
    const menu = element("div", "watch-menu"); menu.setAttribute("role", "menu");
    const choices = [["Edit watch", "edit"]];
    if (entry.pausedReason === "alerted") choices.push(["Watch again", "rearm"]);
    else choices.push([entry.enabled ? "Pause" : "Resume", entry.enabled ? "pause" : "resume"]);
    if (entry.snoozedUntil > Date.now()) choices.push(["Wake now", "wake"]);
    else if (entry.enabled) choices.push(["Snooze for 15 minutes", "snooze"]);
    choices.push(["Copy address", "copy"], ["Remove watch", "remove"]);
    for (const [label, action] of choices) {
      const item = button(label, () => { closeMenu(); trigger.focus(); onAction(action, entry.id); }, "watch-menu-item");
      item.setAttribute("role", "menuitem"); menu.append(item);
    }
    menu.addEventListener("keydown", (event) => {
      const items = [...menu.querySelectorAll("button")];
      const index = items.indexOf(document.activeElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
      }
      if (event.key === "Escape") { event.preventDefault(); closeMenu(); trigger.focus(); }
    });
    document.body.append(menu);
    const rect = trigger.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(window.innerWidth - 220, rect.right - 210)) + "px";
    menu.style.top = Math.max(8, Math.min(window.innerHeight - menu.offsetHeight - 8, rect.bottom + 4)) + "px";
    trigger.setAttribute("aria-expanded", "true"); openMenu = { menu, trigger };
    menu.querySelector("button").focus();
  }
  const outside = (event) => { if (openMenu && !openMenu.menu.contains(event.target) && !openMenu.trigger.contains(event.target)) closeMenu(); };
  const focusOutside = (event) => { if (openMenu && !openMenu.menu.contains(event.target) && event.target !== openMenu.trigger) closeMenu(); };
  document.addEventListener("pointerdown", outside); document.addEventListener("focusin", focusOutside);
  document.addEventListener("scroll", closeMenu, true); window.addEventListener("resize", closeMenu);
  function render(snapshot) {
    const activeIds = new Set(snapshot.entries.map((entry) => entry.id));
    for (const [id, row] of rows) if (!activeIds.has(id)) { if (row.contains(openMenu?.trigger)) closeMenu(); row.remove(); rows.delete(id); }
    tbody.querySelector(".watch-empty-row")?.remove();
    if (!snapshot.entries.length) {
      const row = element("tr", "watch-empty-row"); const cell = element("td", "watch-empty"); cell.colSpan = 5;
      cell.append(element("h3", "", "Watch for the right time to join"), element("p", "watch-help", "Right-click a server and choose Watch server to set an alert."), button("Browse servers", () => onAction("browse")));
      row.append(cell); tbody.append(row); return;
    }
    for (const entry of snapshot.entries) {
      let row = rows.get(entry.id);
      if (!row) {
        row = element("tr", "watch-row"); row.dataset.watchId = entry.id;
        row.innerHTML = '<td><strong class="watch-name"></strong><span class="watch-address"></span><span class="watch-population"></span></td><td><span class="watch-condition"></span></td><td><span class="watch-status"><app-icon></app-icon><strong></strong></span><span class="watch-checked"></span></td><td><span class="watch-policy"></span><span class="watch-auto"></span></td><td class="watch-actions"></td>';
        const actions = element("div", "watch-action-group");
        row.querySelector(".watch-actions").append(actions);
        actions.append(button("Connect", () => onAction("connect", entry.id), "btn"));
        const rearm = button("Watch again", () => onAction("rearm", entry.id)); rearm.classList.add("watch-rearm");
        const menu = button("", () => showMenu(menu, rows.get(entry.id)._entry)); menu.innerHTML = '<app-icon name="more-vertical" aria-hidden="true"></app-icon>';
        menu.setAttribute("aria-label", "Actions for " + (entry.name || entry.ip)); menu.setAttribute("aria-haspopup", "menu"); menu.setAttribute("aria-expanded", "false");
        actions.append(menu, rearm); rows.set(entry.id, row); tbody.append(row);
      }
      row._entry = entry;
      row.querySelector(".watch-name").textContent = entry.observation?.name || entry.name || "Unknown server";
      row.querySelector(".watch-address").textContent = `${entry.ip}:${entry.port}`;
      const observation = entry.observation;
      const known = observation?.status === "online";
      const players = known ? observation.players : observation?.lastKnownPlayers;
      const capacity = known ? observation.capacity : observation?.lastKnownCapacity;
      row.querySelector(".watch-population").textContent = observation ? `${players ?? "—"}/${capacity ?? "—"} players${!known ? " · last known" : ""}` : "Population not checked";
      row.querySelector(".watch-condition").textContent = describeCondition(entry.condition);
      const [status, detail, icon] = monitoring(entry, snapshot);
      row.querySelector(".watch-status strong").textContent = status;
      row.querySelector(".watch-status app-icon").setAttribute("name", icon);
      row.querySelector(".watch-checked").textContent = detail;
      row.querySelector(".watch-checked").title = observation?.completedAt ? "Last attempt: " + new Date(observation.completedAt).toLocaleString() + (observation.lastSuccessAt ? " · Last response: " + new Date(observation.lastSuccessAt).toLocaleString() : " · No successful response") : "No completed query";
      row.querySelector(".watch-policy").textContent = entry.alertPolicy === "once" ? "Alert once" : `Keep watching · ${entry.cooldownSeconds / 60} min cooldown`;
      row.querySelector(".watch-auto").textContent = entry.autoJoin ? `Auto-join · Priority ${entry.priority}` : "Notification only";
      row.querySelector(".watch-rearm").hidden = entry.pausedReason !== "alerted";
    }
  }
  return { render, closeMenu, destroy() {
    closeMenu(); document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", focusOutside);
    document.removeEventListener("scroll", closeMenu, true); window.removeEventListener("resize", closeMenu);
  } };
}
