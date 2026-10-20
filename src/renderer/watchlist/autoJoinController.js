import { createDialog, element, button } from "./dialog.js";
import { showToast } from "../feedback.js";
import { connectToServer } from "../serverBrowser/serverBrowserTable.js";

export function createAutoJoinController() {
  let active = null;
  let claiming = false;
  async function offer(event) {
    if (active || claiming) return;
    claiming = true;
    try {
      const claim = await window.api.watchlist.claimAutoJoin(event.eventId);
      if (active) return;
      const state = { claim, timer: null, busy: false, consumed: false, lastTick: Date.now() };
      const dialog = createDialog("Watchlist auto-join", () => {
        clearInterval(state.timer);
        if (active === state) active = null;
        if (!state.consumed) void window.api.watchlist.cancelAutoJoin(claim.offerId).catch(() => {});
      });
      state.dialog = dialog;
      active = state;
      dialog.append(element("p", "watch-target", claim.server.name || claim.server.ip), element("p", "watch-help", `${claim.server.ip}:${claim.server.port}`), element("p", "watch-preview", claim.condition));
      const countdown = element("p", "watch-countdown", "5"); countdown.setAttribute("aria-label", "Auto-join countdown");
      const explanation = element("p", "watch-help", "The condition will be checked again before connecting.");
      dialog.append(countdown, explanation);
      const actions = element("div", "watch-dialog-actions");
      const cancel = button("Cancel", () => dialog.close());
      const snooze = button("Snooze 15 minutes", async () => {
        dialog.close();
        try { await window.api.watchlist.snooze(claim.watchId); }
        catch (failure) { showToast(failure.message, "var(--accent-red)", "alert"); }
      });
      const join = button("Join now", () => { void execute(); }, "btn");
      actions.append(cancel, snooze, join); dialog.append(actions);
      async function execute() {
        if (state.busy || active !== state) return;
        state.busy = true; clearInterval(state.timer); join.disabled = true; snooze.disabled = true;
        countdown.textContent = "Checking…";
        try {
          const result = await window.api.watchlist.confirmAutoJoin(claim.offerId);
          if (active !== state) {
            await window.api.connection.finish(result.connectionId, false);
            return;
          }
          state.consumed = true; dialog.close();
          await connectToServer(result.server.ip, result.server.port, {
            serverContext: result.server, forceModQuery: true, automaticConnectionId: result.connectionId,
          });
        } catch (failure) {
          dialog.close(); showToast(failure.message || "Auto-join cancelled", "var(--accent-red)", "alert");
        }
      }
      state.timer = setInterval(() => {
        const now = Date.now();
        // Do not launch a countdown that slept or was throttled for a long gap.
        if (now - state.lastTick > 3000 || now > claim.expiresAt) {
          dialog.close(); showToast("Auto-join expired. Check the watch before joining.", "var(--accent)", "clock"); return;
        }
        state.lastTick = now;
        countdown.textContent = String(Math.max(0, Math.ceil((claim.deadline - now) / 1000)));
        if (now >= claim.deadline) void execute();
      }, 250);
      dialog.showModal(); cancel.focus();
    } catch (failure) { console.info("Watchlist offer unavailable:", failure.message); }
    finally { claiming = false; }
  }
  return {
    offer,
    update(snapshot) { if (active && snapshot.autoJoin.offer?.offerId !== active.claim.offerId && !active.busy) active.dialog.close(); },
    destroy() { active?.dialog.close(); },
  };
}
