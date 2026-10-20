import { favoriteKey } from "./favoriteIdentity.js";
import { state, addFavorite, removeFavorite, setHistoryRecords } from "./state.js";
import { showToast, showConfirmModal, copyToClipboard } from "./feedback.js";
import { connectToServer, cancelPendingConnection } from "./serverBrowser/serverBrowserTable.js";
import { filterAndSortHistory, formatExactTime, formatRelativeTime, mapName, recordId } from "./history/historyModel.js";
import { createHistoryDetails } from "./history/historyDetails.js";

let records = [];
let filters = { search: "", sort: "recent", date: "all" };
let loadGeneration = 0;
let joinGeneration = 0;
let loading = false;
let failure = false;
let active = false;
let expandedId = null;
let details = null;
let pendingJoinId = null;
let popover = null;
let popoverTrigger = null;
let refreshTimer = null;
let cleanup = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function icon(name) {
  const node = el("app-icon");
  node.setAttribute("name", name);
  node.setAttribute("aria-hidden", "true");
  return node;
}
function button(label, action, id, className = "btn btn-outline btn-sm") {
  const node = el("button", className, label);
  node.type = "button";
  node.dataset.historyAction = action;
  if (id) node.dataset.serverId = id;
  return node;
}
function closeDetails() {
  details?.destroy();
  details = null;
  expandedId = null;
}
function closePopover(restoreFocus = false) {
  popover?.remove();
  popover = null;
  const trigger = popoverTrigger;
  popoverTrigger = null;
  trigger?.setAttribute("aria-expanded", "false");
  if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
}
function browserHistoryChanged() {
  if (state.flags.historyOnly) document.dispatchEvent(new CustomEvent("dzlinux:render-servers"));
}
function applyRecords(next) {
  records = Array.isArray(next) ? next : [];
  setHistoryRecords(records);
  browserHistoryChanged();
}
function filteredRecords() {
  return filterAndSortHistory(records, filters);
}

export async function loadAndRenderHistory({ silent = false, refreshDetails = false } = {}) {
  if (!window.api?.history) return;
  const request = ++loadGeneration;
  loading = true;
  failure = false;
  if (!silent || !records.length) renderHistoryTable();
  try {
    const result = await window.api.history.get();
    if (request !== loadGeneration) return;
    applyRecords(result);
    loading = false;
    renderHistoryTable();
    if (refreshDetails && details) void details.load({ silent: true });
  } catch (error) {
    if (request !== loadGeneration) return;
    loading = false;
    failure = true;
    closeDetails();
    renderHistoryTable();
    console.error("Failed to load connection history:", error);
  }
}

export function renderHistoryTable() {
  const tbody = document.getElementById("historyListBody");
  if (!tbody) return;
  closePopover(true);
  const focused = document.activeElement;
  const focusedInDetails = details?.element.contains(focused);
  const focusedAction = focused?.dataset?.historyAction;
  const focusedId = focused?.dataset?.serverId;
  const visible = filteredRecords();
  if (expandedId && !visible.some((record) => recordId(record) === expandedId)) closeDetails();
  const count = document.getElementById("historyResultCount");
  if (count) count.textContent = loading ? "Loading history…" : failure ? "History unavailable" :
    visible.length + (visible.length === 1 ? " server" : " servers");
  const reset = document.getElementById("historyResetFilters");
  if (reset) reset.hidden = !filters.search && filters.sort === "recent" && filters.date === "all";
  const options = document.getElementById("historyOptionsBtn");
  if (options) options.disabled = loading || failure || !records.length;
  tbody.replaceChildren();

  if (loading && !records.length || failure || !visible.length) {
    const row = el("tr");
    const cell = el("td", "history-empty");
    cell.colSpan = 4;
    if (failure) {
      cell.append(el("h3", "", "Could not load history"), el("p", "", "Your history could not be read. Try again to reload it."),
        button("Retry", "retry"));
    } else if (loading) {
      cell.setAttribute("role", "status");
      cell.appendChild(el("p", "", "Loading history…"));
    } else if (records.length) {
      cell.append(el("h3", "", "No matching servers"), el("p", "", "Try another search or reset your filters."),
        button("Reset filters", "reset"));
    } else {
      cell.append(el("h3", "", "Your next connection starts here"), el("p", "", "Servers appear here when you use Connect."),
        button("Browse servers", "browse", null, "btn btn-primary"));
    }
    row.appendChild(cell);
    tbody.appendChild(row);
    if ((focusedId || focusedInDetails) && !focused?.isConnected) document.getElementById("historySearchInput")?.focus({ preventScroll: true });
    return;
  }

  for (const record of visible) {
    const id = recordId(record);
    const row = el("tr", "history-row");
    row.dataset.serverId = id;
    if (expandedId === id) row.classList.add("history-row-expanded");
    const server = el("td", "history-server-cell");
    const identity = el("div", "history-server-identity");
    const disclosure = button("", "expand", id, "btn history-disclosure");
    disclosure.appendChild(icon("chevron-down"));
    disclosure.setAttribute("aria-label", (expandedId === id ? "Hide" : "Show") + " history for " + record.name);
    disclosure.setAttribute("aria-expanded", String(expandedId === id));
    disclosure.setAttribute("aria-controls", "history-details-" + encodeURIComponent(id));
    const text = el("div", "history-server-text");
    const name = el("div", "history-server-name", record.name || id);
    if (state.favoritesSet.has(favoriteKey(record.ip, record.port))) {
      const favorite = icon("star");
      favorite.className = "history-favorite";
      favorite.removeAttribute("aria-hidden");
      favorite.setAttribute("role", "img");
      favorite.setAttribute("aria-label", "Favorite server");
      name.appendChild(favorite);
    }
    text.append(name, el("div", "history-server-meta", mapName(record.map) + " · " + record.ip + ":" + record.port));
    identity.append(disclosure, text);
    server.appendChild(identity);
    const last = el("td", "history-last-used");
    const time = el("time", "", formatRelativeTime(record.lastJoined));
    if (record.lastJoined) time.dateTime = new Date(record.lastJoined).toISOString();
    time.title = formatExactTime(record.lastJoined);
    time.setAttribute("aria-label", time.textContent + ". " + time.title);
    last.appendChild(time);
    if (!record.lastJoined) last.appendChild(el("span", "history-imported", "Imported server"));
    const attempts = el("td", "history-attempt-count", String(record.playCount || 0));
    attempts.title = "Recorded connection attempts, including attempts that did not launch the game";
    const actions = el("td", "history-row-actions");
    const actionGroup = el("div", "history-action-group");
    const join = button(pendingJoinId === id ? "Checking…" : "Join again", "join", id, "btn btn-primary btn-sm");
    join.disabled = pendingJoinId === id;
    join.prepend(icon("play"));
    actionGroup.appendChild(join);
    if (pendingJoinId === id) actionGroup.appendChild(button("Cancel", "cancel-join", id));
    const more = button("", "more", id);
    more.appendChild(icon("more-vertical"));
    more.setAttribute("aria-label", "More actions for " + (record.name || id));
    more.setAttribute("aria-expanded", "false");
    more.setAttribute("aria-controls", "history-action-popover");
    actionGroup.appendChild(more);
    actions.appendChild(actionGroup);
    row.append(server, last, attempts, actions);
    tbody.appendChild(row);
    if (expandedId === id && details) {
      const detailRow = el("tr", "history-detail-row");
      const cell = el("td");
      cell.colSpan = 4;
      details.element.id = "history-details-" + encodeURIComponent(id);
      cell.appendChild(details.element);
      detailRow.appendChild(cell);
      tbody.appendChild(detailRow);
    }
  }
  if (focusedAction && focusedId && !focused?.isConnected) {
    const target = [...tbody.querySelectorAll("button")].find((node) =>
      node.dataset.historyAction === focusedAction && node.dataset.serverId === focusedId && !node.disabled);
    (target || document.getElementById("historySearchInput"))?.focus({ preventScroll: true });
  }
  if (focusedInDetails && focused?.isConnected) focused.focus({ preventScroll: true });
}

function resetFilters() {
  filters = { search: "", sort: "recent", date: "all" };
  const search = document.getElementById("historySearchInput");
  const sort = document.getElementById("historySortSelect");
  const date = document.getElementById("historyDateSelect");
  if (search) search.value = "";
  if (sort) sort.value = "recent";
  if (date) date.value = "all";
  renderHistoryTable();
  search?.focus();
}

async function joinAgain(record) {
  const request = ++joinGeneration;
  pendingJoinId = recordId(record);
  renderHistoryTable();
  try {
    await connectToServer(record.ip, record.port, { serverContext: record, forceModQuery: true });
  } catch (error) {
    showToast("Could not join server: " + error.message, "var(--accent-red)", "alert");
  } finally {
    if (request === joinGeneration) {
      pendingJoinId = null;
      if (active) renderHistoryTable();
    }
  }
}

function toggleExpanded(record) {
  const id = recordId(record);
  if (expandedId === id) {
    closeDetails();
    renderHistoryTable();
    return;
  }
  closeDetails();
  expandedId = id;
  details = createHistoryDetails(id);
  renderHistoryTable();
  void details.load();
}

function openActions(trigger, record) {
  if (popoverTrigger === trigger) {
    closePopover(true);
    return;
  }
  closePopover();
  popoverTrigger = trigger;
  trigger.setAttribute("aria-expanded", "true");
  popover = el("div", "history-action-popover");
  popover.id = "history-action-popover";
  popover.setAttribute("role", "group");
  popover.setAttribute("aria-label", record ? "Server actions" : "History options");
  const addAction = (label, action, destructive = false) => {
    const item = el("button", destructive ? "history-menu-danger" : "", label);
    item.type = "button";
    item.addEventListener("click", () => {
      closePopover(true);
      Promise.resolve().then(action).catch((error) => {
        console.error("History action failed:", error);
        showToast("Action failed: " + error.message, "var(--accent-red)", "alert");
      });
    });
    popover.appendChild(item);
  };
  if (record) {
    const favorite = state.favoritesSet.has(favoriteKey(record.ip, record.port));
    addAction(favorite ? "Remove from favorites" : "Add to favorites", async () => {
      if (favorite) await removeFavorite(record.ip, record.port);
      else await addFavorite(record.ip, record.port, record.queryPort, record.name);
      renderHistoryTable();
      document.dispatchEvent(new CustomEvent("dzlinux:render-servers"));
    });
    addAction("Copy address", () => copyToClipboard(record.ip + ":" + record.port));
    addAction("Remove from history", async () => {
      if (!await showConfirmModal("Remove all retained history for " + (record.name || recordId(record)) + "?")) return;
      ++loadGeneration;
      const result = await window.api.history.delete(recordId(record));
      loading = false;
      failure = false;
      if (expandedId === recordId(record)) closeDetails();
      applyRecords(result);
      renderHistoryTable();
      showToast("Server removed from history", "var(--accent)", "history");
      document.getElementById("historySearchInput")?.focus();
    }, true);
  } else {
    addAction("Clear all history", async () => {
      if (!await showConfirmModal("Clear history for all " + records.length + " servers?")) return;
      ++loadGeneration;
      const result = await window.api.history.clear();
      loading = false;
      failure = false;
      closeDetails();
      applyRecords(result);
      renderHistoryTable();
      showToast("History cleared", "var(--accent)", "history");
      document.getElementById("historySearchInput")?.focus();
    }, true);
  }
  document.getElementById("history").appendChild(popover);
  const rect = trigger.getBoundingClientRect();
  const menuRect = popover.getBoundingClientRect();
  popover.style.left = Math.max(8, Math.min(window.innerWidth - menuRect.width - 8, rect.right - menuRect.width)) + "px";
  popover.style.top = (rect.bottom + menuRect.height + 8 > window.innerHeight
    ? Math.max(8, rect.top - menuRect.height - 4) : rect.bottom + 4) + "px";
  popover.querySelector("button")?.focus();
}

export function initHistoryManager() {
  cleanup?.();
  const root = document.getElementById("history");
  if (!root) return;
  const listeners = [];
  const listen = (target, name, handler) => {
    target?.addEventListener(name, handler);
    if (target) listeners.push(() => target.removeEventListener(name, handler));
  };
  active = root.classList.contains("active");
  const startTimer = () => {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => { void loadAndRenderHistory({ silent: true, refreshDetails: true }); }, 60000);
  };
  if (active) startTimer();
  listen(document.getElementById("historySearchInput"), "input", (event) => {
    filters.search = event.target.value;
    renderHistoryTable();
  });
  listen(document.getElementById("historySortSelect"), "change", (event) => {
    filters.sort = event.target.value;
    renderHistoryTable();
  });
  listen(document.getElementById("historyDateSelect"), "change", (event) => {
    filters.date = event.target.value;
    renderHistoryTable();
  });
  listen(document.getElementById("historyResetFilters"), "click", resetFilters);
  listen(document.getElementById("historyOptionsBtn"), "click", (event) => openActions(event.currentTarget));
  listen(document.getElementById("historyListBody"), "click", (event) => {
    const control = event.target.closest("button[data-history-action]");
    const action = control?.dataset.historyAction;
    if (action === "retry") { void loadAndRenderHistory(); return; }
    if (action === "reset") { resetFilters(); return; }
    if (action === "browse") {
      document.dispatchEvent(new CustomEvent("dzlinux:switch-tab", { detail: { tab: "browser" } }));
      return;
    }
    const row = event.target.closest("tr.history-row");
    const id = control?.dataset.serverId || row?.dataset.serverId;
    const record = records.find((entry) => recordId(entry) === id);
    if (!record) return;
    if (action === "join") { void joinAgain(record); return; }
    if (action === "cancel-join") {
      ++joinGeneration;
      pendingJoinId = null;
      cancelPendingConnection();
      renderHistoryTable();
      return;
    }
    if (action === "more") { openActions(control, record); return; }
    if (action === "expand" || (!control && event.target.closest(".history-server-cell") && !window.getSelection()?.toString())) {
      toggleExpanded(record);
    }
  });
  listen(document, "click", (event) => {
    if (popover && !popover.contains(event.target) && !popoverTrigger?.contains(event.target)) closePopover();
  });
  listen(document, "keydown", (event) => {
    if (event.key === "Escape" && popover) { event.preventDefault(); closePopover(true); }
  });
  listen(document, "focusin", (event) => {
    if (popover && !popover.contains(event.target) && event.target !== popoverTrigger) closePopover();
  });
  listen(window, "favorites-changed", () => { if (active) renderHistoryTable(); });
  listen(window, "history-changed", (event) => {
    void loadAndRenderHistory({ silent: true, refreshDetails: active && event.detail?.serverId === expandedId });
  });
  listen(document, "dzlinux:tab-changed", (event) => {
    active = event.detail?.tab === "history";
    clearInterval(refreshTimer);
    refreshTimer = null;
    if (active) {
      startTimer();
      void loadAndRenderHistory();
    } else {
      ++loadGeneration;
      loading = false;
      closePopover();
      closeDetails();
    }
  });
  cleanup = () => {
    listeners.forEach((remove) => remove());
    clearInterval(refreshTimer);
    refreshTimer = null;
    ++loadGeneration;
    closePopover();
    closeDetails();
    active = false;
    cleanup = null;
  };
  return cleanup;
}
