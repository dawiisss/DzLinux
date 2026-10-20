import { state, applyFavoritesSnapshot, setHistoryRecords } from "./state.js";
import { showToast, showConfirmModal, copyToClipboard } from "./feedback.js";
import { connectToServer } from "./serverBrowser/serverBrowserTable.js";
import { favoriteKey, formatAddress } from "./favoriteIdentity.js";
import { selectFavorites, fresh } from "./favorites/favoritesModel.js";
import { createFavoritesView } from "./favorites/favoritesView.js";
import { openFavoriteEditor } from "./favorites/favoriteEditor.js";
import { openFavoriteGroups } from "./favorites/favoriteGroups.js";

const runtimes = new Map();
let current = null; let watch = null; let watchError = null; let view = null;
let forceOrder = false;
let initialized = false; let visible = false; let frame = null; let relativeTimer = null;
let batchId = null; let sequence = 0; let groupsSignature = ""; let historyError = null;
let browserReference = null; let browserRevision = -1; let browserMap = new Map();
const subscriptions = [];
const filters = { search: "", group: "all", sort: "saved" };
const api = () => window.api.favorites;
const fail = (error) => showToast(error.message || "Favorites request failed", "var(--accent-red)", "alert");
const historyEnabled = () => state.settings?.enableHistory !== false && state.settings?.showHistoryTab !== false;

function updateBrowserIndex() {
  if (browserReference === state.allServers && browserRevision === state.serverDataRevision) return;
  browserReference = state.allServers;
  browserRevision = state.serverDataRevision;
  browserMap = new Map(state.allServers.map((server) => [favoriteKey(server.ip, server.port), server]));
}
function resolveServer(entry) {
  updateBrowserIndex();
  const browser = browserMap.get(favoriteKey(entry.ip, entry.port));
  const metadataKnown = Boolean(browser && !browser.isFavoritePlaceholder && !browser.id?.startsWith("fav-"));
  let runtime = runtimes.get(entry.id);
  if (!runtime) {
    runtime = { id: entry.id, ip: entry.ip, port: entry.port, mods: null, hasQueriedMods: false, modded: true, country: "" };
    runtimes.set(entry.id, runtime);
  }
  const observation = current?.observations[entry.id];
  const currentObservation = fresh(observation) ? observation : null;
  Object.assign(runtime, { ip: entry.ip, port: entry.port, queryPort: observation?.queryPort || entry.queryPort || browser?.queryPort || null,
    name: observation?.name || browser?.name || entry.name || entry.ip,
    map: observation?.map || browser?.map || entry.map || "", _listed: metadataKnown, _metadataKnown: metadataKnown,
    reportedPlayers: currentObservation?.players ?? null, reportedCapacity: currentObservation?.capacity ?? null });
  for (const field of ["thirdPerson", "password", "country", "verifiedCommunity", "monetized", "time"]) {
    if (metadataKnown && browser[field] !== undefined) runtime[field] = browser[field];
    else delete runtime[field];
  }
  if (!runtime.hasQueriedMods && metadataKnown && browser.hasQueriedMods) {
    for (const field of ["mods", "hasQueriedMods", "modded", "isQueryingMods", "modQueryFailed"]) runtime[field] = browser[field];
  }
  if (observation) Object.assign(runtime, { realPing: currentObservation?.ping, players: observation.players, maxPlayers: observation.capacity });
  return runtime;
}
export function getPlaceholderServerById(id) { return runtimes.get(id) || null; }
function accept(snapshot, sync = true) {
  if (!snapshot || (current && snapshot.revision < current.revision)) return;
  current = snapshot;
  if (sync && snapshot.dataRevision > state.favoriteDataRevision) applyFavoritesSnapshot(snapshot);
  for (const id of runtimes.keys()) if (!snapshot.entries.some((entry) => entry.id === id)) runtimes.delete(id);
  scheduleRender();
}
function scheduleRender() {
  if (!visible || frame !== null) return;
  frame = requestAnimationFrame(() => { frame = null; render(); });
}
function render() {
  if (!current || !view || !visible) return;
  updateBrowserIndex();
  const signature = JSON.stringify(current.groups);
  const groupSelect = document.getElementById("favoritesGroup");
  if (signature !== groupsSignature) {
    groupsSignature = signature;
    groupSelect.replaceChildren();
    for (const item of [{ id: "all", name: "All favorites" }, { id: "ungrouped", name: "Ungrouped" }, ...current.groups]) {
      const option = document.createElement("option"); option.value = item.id; option.textContent = item.name; groupSelect.append(option);
    }
  }
  if (!["all", "ungrouped", ...current.groups.map((group) => group.id)].includes(filters.group)) filters.group = "all";
  groupSelect.value = filters.group;
  const lastUsed = document.querySelector('#favoritesSort option[value="lastUsed"]');
  lastUsed.disabled = !historyEnabled() || Boolean(historyError);
  document.getElementById("favoritesHistoryStatus").hidden = !historyError;
  document.getElementById("favoritesHistoryStatus").querySelector("span").textContent = historyError ? "Last used sorting is unavailable. " + historyError : "";
  lastUsed.title = !historyEnabled() ? "History is disabled" : historyError || "Recorded connection attempts retained for 30 days; not confirmed gameplay";
  if (lastUsed.disabled && filters.sort === "lastUsed") filters.sort = "saved";
  document.getElementById("favoritesSort").value = filters.sort;
  const displayEntries = current.entries.map((entry) => {
    const runtime = resolveServer(entry);
    return { ...entry, name: runtime.name, map: runtime.map };
  });
  const selected = selectFavorites(displayEntries, { ...filters, observations: current.observations, history: historyEnabled() ? state.history : [] });
  view.render(selected, { allEntries: displayEntries, observations: current.observations, groups: current.groups, watch, watchError, refreshing: Boolean(batchId), forceOrder });
  forceOrder = false;
  document.getElementById("favoritesCount").textContent = selected.length === current.entries.length ? current.entries.length + " favorites" : "Showing " + selected.length + " of " + current.entries.length + " favorites";
  document.getElementById("resetFavoritesFilters").hidden = !filters.search && filters.group === "all";
  const refresh = document.getElementById("refreshFavPingsBtn"); refresh.disabled = Boolean(batchId) || !current.entries.length;
  refresh.setAttribute("aria-label", "Refresh all " + current.entries.length + " favorites");
  document.getElementById("cancelFavoritesRefresh").hidden = !batchId;
}
export function renderFavoritesManager() {
  visible = Boolean(document.getElementById("favorites")?.classList.contains("active"));
  scheduleRender();
}
async function load() {
  const error = document.getElementById("favoritesError");
  try { accept(await api().getSnapshot()); error.hidden = true; }
  catch (failure) {
    error.hidden = false; error.querySelector("span").textContent = "Could not load Favorites: " + failure.message;
    if (!current) document.getElementById("favoritesCount").textContent = "Favorites unavailable";
  }
  for (const id of ["addFavBtn", "manageFavoriteGroups"]) document.getElementById(id).disabled = !current;
  document.getElementById("refreshFavPingsBtn").disabled = !current?.entries.length || Boolean(batchId);
}
async function loadHistory() {
  if (!historyEnabled()) return;
  try { setHistoryRecords(await window.api.history.get()); historyError = null; }
  catch (failure) { historyError = "History unavailable: " + failure.message; }
  scheduleRender();
}
function saved(snapshot) { applyFavoritesSnapshot(snapshot); accept(snapshot, false); }
function editor(entry = null) {
  openFavoriteEditor({ entry, entries: current?.entries || [], groups: current?.groups || [], onSaved: saved, onView: async (identity) => {
    await load(); filters.search = ""; filters.group = "all"; document.getElementById("favoritesSearch").value = "";
    const existing = current?.entries.find((entry) => favoriteKey(entry.ip, entry.port) === favoriteKey(identity.ip, identity.port));
    if (existing) editor(existing);
  } });
}
async function refresh(ids = null) {
  if (batchId) return;
  const id = "favorites-refresh-" + (++sequence); batchId = id; scheduleRender();
  document.getElementById("favoritesRefreshStatus").textContent = "Starting refresh…";
  try {
    const result = await api().refresh(ids, id);
    if (batchId !== id) return;
    const text = (result.cancelled ? "Cancelled · " : "") + result.checked + " checked · " + result.unreachable + " unreachable";
    document.getElementById("favoritesRefreshStatus").textContent = text;
    document.getElementById("favoritesAnnouncement").textContent = text;
    accept(await api().getSnapshot());
  } catch (error) { fail(error); document.getElementById("favoritesRefreshStatus").textContent = "Refresh failed. Try again."; }
  finally { if (batchId === id) batchId = null; scheduleRender(); }
}
async function action(type, id) {
  try {
    if (type === "add") { editor(); return; }
    if (type === "browse") { document.dispatchEvent(new CustomEvent("dzlinux:switch-tab", { detail: { tab: "browser" } })); return; }
    if (type === "reset") { filters.search = ""; filters.group = "all"; document.getElementById("favoritesSearch").value = ""; scheduleRender(); return; }
    const entry = current?.entries.find((entry) => entry.id === id); if (!entry) return;
    if (type === "edit") editor(entry);
    else if (type === "pin") { forceOrder = true; saved(await api().update(id, { pinned: !entry.pinned }, entry.revision)); }
    else if (type === "copy") copyToClipboard(formatAddress(entry.ip, entry.port));
    else if (type === "refresh") await refresh([id]);
    else if (type === "connect") await connectToServer(entry.ip, entry.port, { serverContext: resolveServer(entry), forceModQuery: true });
    else if (type === "expand") { state.expandedFavoriteId = state.expandedFavoriteId === id ? null : id; scheduleRender(); }
    else if (type === "remove") {
      if (await showConfirmModal("Remove " + (entry.label || entry.name || entry.ip) + " from Favorites? History and any Watchlist entry will remain.")) saved(await api().remove(id));
    } else if (type === "watch") {
      if (watchError) throw new Error("Watchlist is unavailable. Open Watchlist and retry.");
      if (watch?.enabled === false) { showToast("Enable Watchlist in Settings to configure monitoring", "var(--accent)", "info"); return; }
      const existing = watch?.entries.find((item) => favoriteKey(item.ip, item.port) === favoriteKey(entry.ip, entry.port));
      document.dispatchEvent(new CustomEvent(existing ? "dzlinux:edit-watch" : "dzlinux:watch-server", { detail: existing ? { id: existing.id } : { server: resolveServer(entry) } }));
    }
  } catch (error) { fail(error); }
}
async function saveView() {
  state.settings.favoritesViewSort = filters.sort; state.settings.favoritesViewGroupId = filters.group;
  try { if (await window.api.settings.save(state.settings) === false) throw new Error("The list changed, but the view preference could not be saved"); }
  catch (error) { fail(error); }
}
async function loadWatch() {
  try { watch = await window.api.watchlist.getSnapshot(); watchError = null; }
  catch (error) { watchError = error.message; }
  scheduleRender();
}
export async function initFavorites() {
  if (initialized) return; initialized = true;
  filters.sort = state.settings.favoritesViewSort || "saved"; filters.group = state.settings.favoritesViewGroupId || "all";
  view = createFavoritesView(document.getElementById("favoritesListBody"), (type, id) => { void action(type, id); }, resolveServer);
  subscriptions.push(api().onChanged(accept), api().onRefreshProgress((progress) => {
    if (progress.requestId !== batchId) return;
    document.getElementById("favoritesRefreshStatus").textContent = progress.checked + "/" + progress.total + " checked · " + progress.unreachable + " unreachable";
  }), window.api.watchlist.onChanged((snapshot) => { watch = snapshot; watchError = null; scheduleRender(); }));
  document.getElementById("addFavBtn").addEventListener("click", () => editor());
  document.getElementById("manageFavoriteGroups").addEventListener("click", () => openFavoriteGroups(() => current?.groups || [], saved));
  document.getElementById("refreshFavPingsBtn").addEventListener("click", () => { void refresh(); });
  document.getElementById("cancelFavoritesRefresh").addEventListener("click", () => { if (batchId) void api().cancel(batchId).catch(fail); });
  document.getElementById("retryFavoriteHistory").addEventListener("click", () => { void loadHistory(); });
  document.getElementById("retryFavoritesBtn").addEventListener("click", () => { void load(); });
  document.getElementById("favoritesSearch").addEventListener("input", (event) => { filters.search = event.target.value; scheduleRender(); });
  document.getElementById("resetFavoritesFilters").addEventListener("click", () => { void action("reset"); });
  document.getElementById("favoritesSort").addEventListener("change", async (event) => {
    filters.sort = event.target.value; if (filters.sort === "lastUsed") await loadHistory(); scheduleRender(); void saveView();
  });
  document.getElementById("favoritesGroup").addEventListener("change", (event) => { filters.group = event.target.value; scheduleRender(); void saveView(); });
  window.addEventListener("favorites-changed", (event) => accept(event.detail, false));
  window.addEventListener("history-updated", () => { historyError = null; scheduleRender(); });
  const updateMods = (event) => {
    const source = event.detail?.server; if (!source || !current) return;
    const entry = current.entries.find((item) => favoriteKey(item.ip, item.port) === favoriteKey(source.ip, source.port));
    if (!entry) return;
    const runtime = resolveServer(entry);
    if (source !== runtime) for (const field of ["mods", "hasQueriedMods", "modded", "isQueryingMods", "modQueryFailed"]) runtime[field] = source[field];
    view.refreshDetail(entry.id); scheduleRender();
  };
  document.addEventListener("dzlinux:server-mods-updated", updateMods);
  document.addEventListener("dzlinux:favorite-mods-refreshed", updateMods);
  document.addEventListener("dzlinux:render-favorites", renderFavoritesManager);
  document.addEventListener("dzlinux:server-data-changed", scheduleRender);
  document.addEventListener("dzlinux:tab-changed", (event) => {
    visible = event.detail?.tab === "favorites"; clearInterval(relativeTimer); relativeTimer = null;
    if (visible) { scheduleRender(); relativeTimer = setInterval(scheduleRender, 5000); if (watchError) void loadWatch(); if (filters.sort === "lastUsed") void loadHistory(); }
    else { view.closeMenu(); if (batchId) void api().cancel(batchId).catch(() => {}); }
  });
  window.addEventListener("beforeunload", () => { clearInterval(relativeTimer); if (frame !== null) cancelAnimationFrame(frame); view.destroy(); for (const off of subscriptions) off(); void api().cancel().catch(() => {}); }, { once: true });
  await load(); await loadWatch();
  if (filters.sort === "lastUsed") await loadHistory();
}
