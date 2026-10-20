import { createDialog, element, button } from "../dialog.js";
import { parseServerAddress, formatAddress, favoriteKey } from "../favoriteIdentity.js";
import { mapName } from "./favoritesModel.js";

let current = null;
let sequence = 0;
export function openFavoriteEditor({ entry = null, groups = [], entries = [], onSaved, onView }) {
  current?.close();
  const requestId = "favorite-preview-" + (++sequence);
  let generation = 0; let preview = null; let identity = null; let closed = false; let saving = false;
  const dialog = createDialog(entry ? "Edit favorite" : "Add server", () => {
    closed = true; generation++;
    void window.api.favorites.cancel(requestId).catch(() => {});
    if (current === dialog) current = null;
  });
  current = dialog;
  const form = element("form", "watch-editor"); dialog.append(form);
  const field = (labelText, control) => {
    const label = element("label", "watch-field", labelText); label.append(control); form.append(label); return label;
  };
  let addressInput; let portInput; let queryInput; let check;
  if (!entry) {
    addressInput = element("input", "form-input"); addressInput.placeholder = "51.38.89.140:2302"; addressInput.required = true; addressInput.maxLength = 280;
    addressInput.autocomplete = "off"; addressInput.spellcheck = false; field("Server address", addressInput);
    portInput = element("input", "form-input"); portInput.type = "number"; portInput.min = "1"; portInput.max = "65535"; portInput.step = "1"; portInput.value = "2302";
    field("Game port (used when the address has no port)", portInput);
    const advanced = element("details", "favorite-advanced"); advanced.append(element("summary", "", "Advanced query port"));
    queryInput = element("input", "form-input"); queryInput.type = "number"; queryInput.min = "1"; queryInput.max = "65535"; queryInput.step = "1";
    const queryLabel = element("label", "watch-field", "Query port (optional)"); queryLabel.append(queryInput); advanced.append(queryLabel, element("p", "watch-help", "The game port is used to connect. The query port is used to check server details; leave it empty for automatic discovery.")); form.append(advanced);
  } else form.append(element("p", "watch-help", formatAddress(entry.ip, entry.port)), element("p", "watch-help", "Server name: " + (entry.name || "Not checked yet")));
  const label = element("input", "form-input"); label.maxLength = 80; label.value = entry?.label || ""; label.placeholder = "e.g. Main survival server";
  field("Personal label (optional)", label);
  if ((entry?.legacyName || entry?.name) && !entry.label) form.append(button("Use previous saved name as label", () => { label.value = (entry.legacyName || entry.name).slice(0, 80); }));
  const group = element("select", "form-input");
  const ungrouped = element("option", "", "Ungrouped"); ungrouped.value = ""; group.append(ungrouped);
  for (const item of groups) { const option = element("option", "", item.name); option.value = item.id; group.append(option); }
  group.value = entry?.groupId || ""; field("Group", group);
  const result = element("div", "favorite-preview"); result.setAttribute("role", "status"); form.append(result);
  const error = element("p", "watch-error"); error.setAttribute("role", "alert"); form.append(error);
  const actions = element("div", "watch-dialog-actions");
  const cancel = button("Cancel", () => dialog.close()); actions.append(cancel);
  const viewExisting = button("Edit existing favorite", () => { dialog.close(); onView?.(identity); }); viewExisting.hidden = true;
  actions.append(viewExisting);
  const saveAnyway = button("Save anyway", () => { void save(true); }); saveAnyway.hidden = true; actions.append(saveAnyway);
  const saveButton = element("button", "btn", entry ? "Save changes" : "Save favorite"); saveButton.type = "submit"; saveButton.disabled = !entry;
  if (!entry) { check = button("Check server", () => { void checkServer(); }); actions.append(check); }
  actions.append(saveButton); form.append(actions);
  function invalidate() {
    if (saving) return;
    generation++; preview = null; identity = null; saveButton.disabled = true; saveAnyway.hidden = true; viewExisting.hidden = true;
    result.replaceChildren(); error.textContent = ""; check.disabled = false; check.textContent = "Check server";
    void window.api.favorites.cancel(requestId).catch(() => {});
  }
  if (!entry) for (const input of [addressInput, portInput, queryInput]) input.addEventListener("input", invalidate);
  async function checkServer() {
    if (saving) return;
    const epoch = ++generation;
    try {
      identity = parseServerAddress(addressInput.value, portInput.value, queryInput.value);
      portInput.value = String(identity.port);
      const duplicate = entries.find((item) => favoriteKey(item.ip, item.port) === favoriteKey(identity.ip, identity.port));
      if (duplicate) { result.textContent = "This server is already saved. View it or edit its existing label and group."; viewExisting.hidden = false; return; }
      error.textContent = ""; saveButton.disabled = true; saveAnyway.hidden = true; check.disabled = true; check.textContent = "Checking…";
      result.textContent = "Querying server details…";
      preview = await window.api.favorites.preview(identity, requestId);
      if (closed || epoch !== generation) return;
      if (preview.cancelled) { result.textContent = "Check cancelled. Try again or save without a server response."; saveAnyway.hidden = false; }
      else if (preview.status === "online") {
        result.replaceChildren(element("strong", "", preview.name || "Server responded"), element("p", "watch-help", `${preview.players ?? "—"}/${preview.capacity ?? "—"} players · ${preview.ping ?? "—"} ms · ${mapName(preview.map)}`));
        saveButton.disabled = false;
      } else { result.textContent = "Could not reach this server. Check the address, retry, or save it with unknown availability."; saveAnyway.hidden = false; }
    } catch (failure) { if (!closed && epoch === generation) error.textContent = failure.message; }
    finally { if (!closed && epoch === generation) { check.disabled = false; check.textContent = "Check server"; } }
  }
  async function save(anyway = false) {
    if (saving || (!entry && !identity)) return;
    if (!form.reportValidity()) return;
    saving = true; saveButton.disabled = true; cancel.disabled = true; saveAnyway.disabled = true; if (check) check.disabled = true; error.textContent = "";
    try {
      const config = { label: label.value.trim(), groupId: group.value || null };
      const snapshot = entry ? await window.api.favorites.update(entry.id, config, entry.revision)
        : await window.api.favorites.add({ ...identity, ...config }, anyway ? null : preview?.token);
      onSaved(snapshot); dialog.close();
    } catch (failure) { error.textContent = failure.message; if (/already a favorite/i.test(failure.message)) viewExisting.hidden = false; }
    finally { saving = false; saveButton.disabled = !entry && !preview?.token; cancel.disabled = false; saveAnyway.disabled = false; if (check) check.disabled = false; }
  }
  form.addEventListener("submit", (event) => { event.preventDefault(); if (entry || preview?.token) void save(); else void checkServer(); });
  dialog.addEventListener("cancel", (event) => { if (saving) event.preventDefault(); });
  dialog.showModal(); (addressInput || label).focus();
}
