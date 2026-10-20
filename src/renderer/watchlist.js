import { showToast, showConfirmModal, copyToClipboard } from "./feedback.js";
import { connectToServer } from "./serverBrowser/serverBrowserTable.js";
import { createWatchlistView, relativeTime } from "./watchlist/watchlistView.js";
import { openWatchEditor } from "./watchlist/watchlistEditor.js";
import { createAutoJoinController } from "./watchlist/autoJoinController.js";

let current = null;
let view = null;
let autoJoin = null;
let initialized = false;
let visible = false;
let relativeTimer = null;
const subscriptions = [];
const api = () => window.api.watchlist;
const fail = (error) => showToast(error.message || "Watchlist request failed", "var(--accent-red)", "alert");

function accept(snapshot) {
  if (current && snapshot.revision < current.revision) return;
  current = snapshot;
  update();
  autoJoin?.update(snapshot);
}
function update() {
  if (!current || !view) return;
  if (visible) view.render(current);
  const refresh = document.getElementById("refreshWatchlistBtn");
  refresh.disabled = current.refreshing || !current.enabled || !current.entries.length;
  refresh.querySelector("span").textContent = current.refreshing ? "Refreshing…" : "Refresh";
  const status = document.getElementById("watchlistMonitoring");
  status.textContent = !current.enabled ? "Watchlist is disabled in Settings" : current.polling ? "Monitoring while DzLinux is running" : "Automatic polling is disabled · Refresh checks active watches";
  const last = document.getElementById("watchlistLastCheck");
  last.textContent = current.refreshing ? "Checking watched servers…" : current.lastCheckedAt ? relativeTime(current.lastCheckedAt) : "No completed checks yet";
  if (current.nextCheckAt && current.polling) last.textContent += " · Next check in " + Math.max(0, Math.ceil((current.nextCheckAt - Date.now()) / 1000)) + "s";
  const banner = document.getElementById("watchlistError");
  banner.hidden = !current.error;
  banner.querySelector("span").textContent = current.error || "";
  document.getElementById("resumeWatchlistAutoJoin").hidden = !current.autoJoin.suspended;
  document.getElementById("watchlistAutoJoinStatus").hidden = !current.autoJoin.suspended;
}
export async function renderWatchlist() {
  try { accept(await api().getSnapshot()); }
  catch (error) {
    const banner = document.getElementById("watchlistError");
    if (banner) { banner.hidden = false; banner.querySelector("span").textContent = "Unable to load Watchlist: " + error.message; }
  }
}
async function action(type, id) {
  try {
    if (type === "browse") { document.dispatchEvent(new CustomEvent("dzlinux:switch-tab", { detail: { tab: "browser" } })); return; }
    const entry = current?.entries.find((item) => item.id === id);
    if (!entry) return;
    if (type === "edit") { openWatchEditor(entry, entry); return; }
    if (type === "connect") { await connectToServer(entry.ip, entry.port, { serverContext: entry, forceModQuery: true }); return; }
    if (type === "copy") { copyToClipboard(entry.ip + ":" + entry.port); return; }
    if (type === "remove") {
      if (!await showConfirmModal("Remove the watch for " + (entry.name || entry.ip) + "?")) return;
      accept(await api().remove(id)); return;
    }
    if (type === "pause" || type === "resume") accept(await api().setEnabled(id, type === "resume"));
    else if (["snooze", "wake", "rearm"].includes(type)) accept(await api()[type](id));
  } catch (error) { fail(error); }
}
async function addWatch(server) {
  try {
    const snapshot = await api().getSnapshot(); accept(snapshot);
    const entry = snapshot.entries.find((item) => item.ip.toLowerCase() === server.ip.toLowerCase() && Number(item.port) === Number(server.port));
    const watchPriority = Math.min(1000, Math.max(0, ...snapshot.entries.map((item) => item.priority)) + 1);
    openWatchEditor({ ...server, watchPriority }, entry);
  } catch (error) { fail(error); }
}
export async function initWatchlist() {
  if (initialized) return;
  initialized = true;
  view = createWatchlistView(document.getElementById("watchlistListBody"), (type, id) => { void action(type, id); });
  autoJoin = createAutoJoinController();
  subscriptions.push(api().onChanged(accept), api().onAlert((event) => {
    showToast((event.server.name || event.server.ip) + ": " + event.condition, "var(--accent)", "bell", () => {
      document.dispatchEvent(new CustomEvent("dzlinux:switch-tab", { detail: { tab: "watchlist" } }));
      if (current?.autoJoin.offer?.eventId === event.eventId) void autoJoin.offer(event);
    });
  }), api().onAutoJoinOffer((offer) => { void autoJoin.offer(offer); }), api().onOpen((event) => {
    document.dispatchEvent(new CustomEvent("dzlinux:switch-tab", { detail: { tab: "watchlist" } }));
    if (current?.autoJoin.offer?.eventId === event.eventId) void autoJoin.offer(event);
  }));
  document.getElementById("refreshWatchlistBtn").addEventListener("click", async () => {
    const button = document.getElementById("refreshWatchlistBtn"); button.disabled = true;
    try {
      const result = await api().refresh();
      document.getElementById("watchlistAnnouncement").textContent = "Checked " + result.checked + " servers" + (result.unreachable ? "; " + result.unreachable + " unreachable" : "");
      if (result.unreachable) showToast(result.unreachable + " watched servers could not be reached", "var(--accent)", "alert");
      await renderWatchlist();
    } catch (error) { fail(error); }
    finally { button.disabled = Boolean(current?.refreshing) || !current?.enabled || !current?.entries.length; }
  });
  document.getElementById("retryWatchlistBtn").addEventListener("click", () => { void renderWatchlist(); });
  document.getElementById("resumeWatchlistAutoJoin").addEventListener("click", () => { void api().resumeAutoJoin().catch(fail); });
  document.addEventListener("dzlinux:edit-watch", async (event) => {
    try {
      const snapshot = await api().getSnapshot(); accept(snapshot);
      const entry = snapshot.entries.find((item) => item.id === event.detail?.id);
      if (entry) openWatchEditor(entry, entry);
      else throw new Error("Watch no longer exists");
    } catch (error) { fail(error); }
  });
  document.addEventListener("dzlinux:watch-server", (event) => { if (event.detail?.server) void addWatch(event.detail.server); });
  document.addEventListener("dzlinux:tab-changed", (event) => {
    visible = event.detail?.tab === "watchlist";
    clearInterval(relativeTimer); relativeTimer = null;
    if (visible) { update(); relativeTimer = setInterval(update, 1000); }
    else view.closeMenu();
  });
  window.addEventListener("beforeunload", () => { clearInterval(relativeTimer); view.destroy(); autoJoin.destroy(); for (const off of subscriptions) off(); }, { once: true });
  await renderWatchlist();
  // A fresh unclaimed offer may arrive before the renderer finished initializing.
  if (current?.autoJoin.offer && current.autoJoin.offer.owner === null) void autoJoin.offer(current.autoJoin.offer);
}
