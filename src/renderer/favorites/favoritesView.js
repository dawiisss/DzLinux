import { element, button } from "../dialog.js";
import { buildDetailRow } from "../serverRow.js";
import { state } from "../state.js";
import { favoriteKey, formatAddress } from "../favoriteIdentity.js";
import { availability, checkedText, mapName } from "./favoritesModel.js";
import { calculateTrustScore } from "../trustScore.js";

const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
export function createFavoritesView(tbody, onAction, resolveServer) {
  const rows = new Map(); const details = new Map(); let menu = null;
  function createDetail(server) {
    const wasQueried = server.hasQueriedMods;
    let detail = buildDetailRow(server, true);
    // A cache hit can synchronously populate mods while the first detail row
    // is still being built, before its notification has a mounted target.
    if (!wasQueried && server.hasQueriedMods) detail = buildDetailRow(server, true);
    detail.firstElementChild.colSpan = 5;
    return detail;
  }
  function closeMenu(restore = false) {
    if (!menu) return;
    const trigger = menu.trigger; menu.node.remove(); menu = null; trigger.setAttribute("aria-expanded", "false");
    if (restore && trigger.isConnected) trigger.focus();
  }
  function openMenu(trigger, entry, context) {
    if (menu?.trigger === trigger) { closeMenu(true); return; }
    closeMenu();
    const node = element("div", "favorite-menu"); node.setAttribute("role", "menu");
    const watch = context.watch?.entries.find((item) => favoriteKey(item.ip, item.port) === favoriteKey(entry.ip, entry.port));
    for (const [label, action] of [["Edit favorite", "edit"], ["Move to group", "edit"], [watch ? "Edit watch" : "Watch server", "watch"], ["Copy address", "copy"], ["Refresh this server", "refresh"], ["Remove favorite", "remove"]]) {
      const item = button(label, () => { closeMenu(true); onAction(action, entry.id); }, "favorite-menu-item");
      item.setAttribute("role", "menuitem"); node.append(item);
    }
    node.addEventListener("keydown", (event) => {
      const items = [...node.querySelectorAll("button")]; const current = items.indexOf(document.activeElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
      }
      if (event.key === "Escape") { event.preventDefault(); closeMenu(true); }
    });
    document.body.append(node);
    const rect = trigger.getBoundingClientRect();
    node.style.left = Math.max(8, Math.min(window.innerWidth - 230, rect.right - 220)) + "px";
    node.style.top = Math.max(8, Math.min(window.innerHeight - node.offsetHeight - 8, rect.bottom + 4)) + "px";
    menu = { node, trigger }; trigger.setAttribute("aria-expanded", "true"); node.querySelector("button").focus();
  }
  const outside = (event) => { if (menu && !menu.node.contains(event.target) && !menu.trigger.contains(event.target)) closeMenu(); };
  document.addEventListener("pointerdown", outside); document.addEventListener("focusin", outside);
  const dismiss = () => closeMenu(); document.addEventListener("scroll", dismiss, true); window.addEventListener("resize", dismiss);
  function refreshDetail(id) {
    const row = rows.get(id); const detail = details.get(id);
    if (!row || !detail) return;
    if (!detail.isConnected) { details.delete(id); return; }
    const focused = detail.contains(document.activeElement) ? document.activeElement.textContent : null;
    const scrollTop = detail.querySelector(".detail-container")?.scrollTop || 0;
    const replacement = createDetail(resolveServer(row._entry));
    detail.replaceWith(replacement); details.set(id, replacement);
    const container = replacement.querySelector(".detail-container"); if (container) container.scrollTop = scrollTop;
    if (focused) [...replacement.querySelectorAll("button")].find((item) => item.textContent === focused)?.focus();
  }
  function render(entries, context) {
    const previousFocus = document.activeElement;
    const visible = new Set(entries.map((entry) => entry.id)); const all = new Set(context.allEntries.map((entry) => entry.id));
    for (const [id, row] of rows) {
      if (!visible.has(id)) {
        if (row.contains(menu?.trigger)) closeMenu();
        const focused = row.contains(document.activeElement) || details.get(id)?.contains(document.activeElement);
        row.remove(); details.get(id)?.remove();
        if (focused) document.getElementById("favoritesSearch")?.focus();
      }
      if (!all.has(id)) { rows.delete(id); details.delete(id); }
    }
    tbody.querySelector(".favorite-empty-row")?.remove();
    if (!entries.length) {
      const row = element("tr", "favorite-empty-row"); const cell = element("td", "favorite-empty"); cell.colSpan = 5;
      const empty = !context.allEntries.length;
      cell.append(element("h3", "", empty ? "Keep your regular servers here" : "No matching favorites"), element("p", "watch-help", empty ? "Add a server address or favorite a server from the browser." : "Try another search or reset the group filter."));
      cell.append(button(empty ? "Add server" : "Reset filters", () => onAction(empty ? "add" : "reset")));
      if (empty) cell.append(button("Browse servers", () => onAction("browse")));
      row.append(cell); tbody.append(row); return;
    }
    const interactionActive = menu || tbody.contains(document.activeElement);
    let ordered = entries;
    if (!context.forceOrder && (context.refreshing || interactionActive)) {
      const currentIds = [...tbody.querySelectorAll(".favorite-row")].map((row) => row.dataset.favoriteId);
      const existing = new Map(entries.map((entry) => [entry.id, entry]));
      ordered = [...currentIds.filter((id) => existing.has(id)).map((id) => existing.get(id)), ...entries.filter((entry) => !currentIds.includes(entry.id))];
    }
    let cursor = tbody.firstElementChild;
    for (const entry of ordered) {
      let row = rows.get(entry.id);
      if (!row) {
        row = element("tr", "server-row favorite-row"); row.id = "fav-row-" + entry.id; row.dataset.favoriteId = entry.id;
        row.innerHTML = '<td><strong class="favorite-name"></strong><span class="favorite-official"></span><span class="favorite-address"></span><span class="favorite-group"></span></td><td><span class="favorite-population"></span><span class="favorite-last-known"></span></td><td><strong class="favorite-availability"></strong><span class="favorite-ping"></span><span class="favorite-checked"></span></td><td><span class="favorite-map"></span><span class="favorite-flags"></span><span class="favorite-trust"></span><span class="favorite-watch"></span><button type="button" class="favorite-disclosure btn btn-outline"></button></td><td class="favorite-actions"><div class="favorite-action-group"></div></td>';
        const actions = row.querySelector(".favorite-action-group");
        actions.append(button("Connect", () => onAction("connect", entry.id), "btn btn-connect"));
        const pin = button("", () => onAction("pin", entry.id)); pin.classList.add("favorite-pin"); pin.innerHTML = '<app-icon name="pin" aria-hidden="true"></app-icon>'; actions.append(pin);
        const more = button("", () => openMenu(more, row._entry, row._context)); more.innerHTML = '<app-icon name="more-vertical" aria-hidden="true"></app-icon>';
        more.setAttribute("aria-haspopup", "menu"); more.setAttribute("aria-expanded", "false"); more.setAttribute("aria-label", "Favorite actions"); actions.append(more);
        row.querySelector(".favorite-disclosure").addEventListener("click", () => onAction("expand", entry.id));
        rows.set(entry.id, row);
      }
      row._entry = entry; row._context = context;
      const server = resolveServer(entry); const observation = context.observations[entry.id];
      setText(row.querySelector(".favorite-name"), entry.label || entry.name || "Unknown server");
      setText(row.querySelector(".favorite-official"), entry.label ? entry.name || "Server name not checked" : "");
      setText(row.querySelector(".favorite-address"), formatAddress(entry.ip, entry.port));
      const groupName = context.groups.find((group) => group.id === entry.groupId)?.name || "";
      setText(row.querySelector(".favorite-group"), groupName + (!server._listed ? (groupName ? " · " : "") + "Unlisted in browser" : ""));
      setText(row.querySelector(".favorite-population"), `${observation?.players ?? "—"}/${observation?.capacity ?? "—"} players`);
      setText(row.querySelector(".favorite-last-known"), observation?.status === "unreachable" && observation.lastSuccessAt ? "Last known response" : "");
      setText(row.querySelector(".favorite-availability"), availability(observation));
      setText(row.querySelector(".favorite-ping"), observation?.ping != null ? `${Math.round(observation.ping)} ms${observation.status === "unreachable" ? " · last known" : ""}` : "Ping unknown");
      setText(row.querySelector(".favorite-checked"), checkedText(observation));
      row.querySelector(".favorite-checked").title = observation?.completedAt ? "Last attempt: " + new Date(observation.completedAt).toLocaleString() + (observation.lastSuccessAt ? " · Last response: " + new Date(observation.lastSuccessAt).toLocaleString() : " · No successful response") + (observation.error ? " · " + observation.error : "") : "No Favorites query completed";
      setText(row.querySelector(".favorite-map"), mapName(entry.map));
      const flags = [];
      if (server._metadataKnown) {
        if (typeof server.thirdPerson === "boolean") flags.push(server.thirdPerson ? "3PP" : "1PP");
        if (server.password) flags.push("Password protected");
        if (server.country) flags.push(server.country.toUpperCase());
        if (server.time) flags.push(server.time);
      }
      setText(row.querySelector(".favorite-flags"), flags.join(" · "));
      const trustNode = row.querySelector(".favorite-trust");
      if (state.settings?.enableTrustScore !== false && server._metadataKnown) {
        const trust = calculateTrustScore(server); setText(trustNode, "Trust score: " + trust.score); trustNode.title = trust.reasons.join(" · ");
      } else setText(trustNode, "");
      const watch = context.watch?.entries.find((item) => favoriteKey(item.ip, item.port) === favoriteKey(entry.ip, entry.port));
      const watchText = context.watchError ? "Watchlist unavailable" : context.watch?.enabled === false ? "Watchlist disabled" : !watch ? "No watch" : watch.snoozedUntil > Date.now() ? "Watch snoozed" : !watch.enabled ? watch.pausedReason === "alerted" ? "Watch alerted — paused" : "Watch paused" : "Watching";
      setText(row.querySelector(".favorite-watch"), watchText + (watch?.autoJoin ? " · Auto-join enabled" : ""));
      const expanded = state.expandedFavoriteId === entry.id;
      const disclosure = row.querySelector(".favorite-disclosure");
      setText(disclosure, (expanded ? "Hide mods" : "Show mods") + (server.hasQueriedMods && !server.modQueryFailed && Array.isArray(server.mods) ? ` (${server.mods.length})` : ""));
      disclosure.setAttribute("aria-expanded", String(expanded)); disclosure.setAttribute("aria-controls", "fav-detail-" + server.id);
      const pin = row.querySelector(".favorite-pin"); pin.setAttribute("aria-pressed", String(entry.pinned)); pin.setAttribute("aria-label", (entry.pinned ? "Unpin " : "Pin ") + (entry.label || entry.name || entry.ip));
      pin.title = entry.pinned ? "Unpin favorite" : "Pin favorite to the top";
      pin.querySelector("app-icon").setAttribute("fill", entry.pinned ? "currentColor" : "none"); pin.classList.toggle("active", entry.pinned);
      if (row !== cursor) tbody.insertBefore(row, cursor);
      cursor = row.nextSibling;
      if (expanded) {
        let detail = details.get(entry.id);
        if (!detail) { detail = createDetail(server); details.set(entry.id, detail); }
        if (detail !== cursor) tbody.insertBefore(detail, cursor);
        cursor = detail.nextSibling;
      } else if (details.has(entry.id)) { details.get(entry.id).remove(); details.delete(entry.id); cursor = row.nextSibling; }
    }
    if (context.forceOrder && previousFocus?.isConnected && document.activeElement !== previousFocus) previousFocus.focus();
  }
  return { render, refreshDetail, closeMenu, destroy() {
    closeMenu(); document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside);
    document.removeEventListener("scroll", dismiss, true); window.removeEventListener("resize", dismiss);
  } };
}
