import { createDialog, element, button } from "./dialog.js";

let currentDialog = null;

export function describeCondition(condition) {
  if (condition.type === "server-back-online") return "Server back online";
  if (condition.type === "free-slots") return `At least ${condition.value} free slot${condition.value === 1 ? "" : "s"}`;
  if (condition.type === "legacy-player-at-most") return `At most ${condition.value} players`;
  return `At least ${condition.value} players`;
}

export function openWatchEditor(server, entry = null, onSave = () => {}) {
  currentDialog?.close();
  const dialog = createDialog(entry ? "Edit watch" : "Watch server", () => { currentDialog = null; });
  currentDialog = dialog;
  dialog.append(element("p", "watch-help", `${server.name || "Server"} · ${server.ip}:${server.port}`));
  const form = element("form", "watch-editor");
  const field = (labelText, control) => {
    const label = element("label", "watch-field", labelText);
    label.append(control);
    form.append(label);
    return label;
  };
  const select = (options, selected) => {
    const node = element("select", "form-input");
    for (const [value, label] of options) {
      const option = element("option", "", label);
      option.value = value;
      node.append(option);
    }
    node.value = selected;
    return node;
  };
  const types = [["free-slots", "Space available"], ["population-at-least", "Population reached"], ["server-back-online", "Server back online"]];
  if (entry?.condition.type === "legacy-player-at-most") types.push(["legacy-player-at-most", "At most N players (existing rule)"]);
  const type = select(types, entry?.condition.type || "free-slots");
  field("Condition", type);
  const amount = element("input", "form-input");
  amount.type = "number"; amount.step = "1"; amount.max = "10000";
  amount.value = String(entry?.condition.value ?? 1);
  const amountField = field("Required amount", amount);
  const amountLabel = element("span");
  amountField.firstChild.replaceWith(amountLabel);
  const help = element("p", "watch-help");
  form.append(help);
  const policy = select([["once", "Alert once, then pause"], ["repeat", "Keep watching"]], entry?.alertPolicy || "once");
  field("Alert behavior", policy);
  const cooldown = select([["60", "1 minute"], ["300", "5 minutes"], ["900", "15 minutes"]], String(entry?.cooldownSeconds ?? 300));
  const cooldownField = field("Minimum time between alerts", cooldown);
  const auto = element("input");
  auto.type = "checkbox"; auto.checked = entry?.autoJoin ?? false;
  field("Auto-join with a five-second countdown", auto).classList.add("watch-check-field");
  const priority = element("input", "form-input");
  priority.type = "number"; priority.min = "1"; priority.max = "1000"; priority.step = "1";
  priority.value = String(entry?.priority ?? server.watchPriority ?? 1);
  const priorityField = field("Auto-join priority (1 is highest)", priority);
  const preview = element("p", "watch-preview");
  const error = element("p", "watch-error"); error.setAttribute("role", "alert");
  form.append(preview, error);
  const actions = element("div", "watch-dialog-actions");
  const cancel = button("Cancel", () => dialog.close());
  const save = element("button", "btn", "Save watch"); save.type = "submit";
  actions.append(cancel, save); form.append(actions); dialog.append(form);
  const update = () => {
    const isReturn = type.value === "server-back-online";
    amountField.hidden = isReturn; amount.required = !isReturn; amount.disabled = isReturn;
    amount.min = type.value === "free-slots" ? "1" : "0";
    amountLabel.textContent = type.value === "free-slots" ? "Minimum free slots" : type.value === "legacy-player-at-most" ? "Maximum players" : "Minimum players";
    cooldownField.hidden = policy.value !== "repeat";
    priorityField.hidden = !auto.checked; priority.disabled = !auto.checked;
    help.textContent = isReturn ? "Alerts after two failed checks followed by a successful response while monitoring. An already-online server will not alert immediately." : type.value === "free-slots" ? "Uses the server’s reported population and capacity. Slots are not reserved and a game queue may still apply." : "Alerts when a fresh query meets this condition. Unknown counts never count as zero.";
    preview.textContent = describeCondition({ type: type.value, value: Number(amount.value) }) + " · " + (policy.value === "once" ? "Alert once" : "Keep watching") + (auto.checked ? " · Auto-join on" : "");
  };
  form.addEventListener("input", update); form.addEventListener("change", update); update();
  type.addEventListener("change", () => {
    amount.value = String(type.value === "population-at-least" ? 40 : type.value === "legacy-player-at-most" ? entry?.condition.value ?? 50 : 1);
    update();
  });
  dialog.addEventListener("cancel", (event) => { if (save.disabled) event.preventDefault(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    save.disabled = true; cancel.disabled = true; error.textContent = "";
    try {
      const config = {
        condition: type.value === "server-back-online" ? { type: type.value } : { type: type.value, value: Number(amount.value) },
        alertPolicy: policy.value, cooldownSeconds: Number(cooldown.value), autoJoin: auto.checked,
        ...(auto.checked ? { priority: Number(priority.value) } : {}),
      };
      if (entry) await window.api.watchlist.update(entry.id, config, entry.configRevision);
      else await window.api.watchlist.add({ ip: server.ip, port: server.port, queryPort: server.queryPort ?? null, name: (server.name || "").slice(0, 200), ...config });
      onSave(); dialog.close();
    } catch (failure) { error.textContent = failure.message || "Could not save this watch. Your changes are still here."; }
    finally { save.disabled = false; cancel.disabled = false; }
  });
  dialog.showModal();
  type.focus();
}
