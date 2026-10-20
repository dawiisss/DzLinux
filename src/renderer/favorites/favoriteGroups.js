import { createDialog, element, button } from "../dialog.js";

export function openFavoriteGroups(getGroups, onSaved) {
  let busy = false;
  const dialog = createDialog("Manage favorite groups");
  dialog.classList.add("favorite-groups-dialog");
  dialog.append(element("p", "watch-help", "Groups organize favorites. Deleting a group moves its servers to Ungrouped."));
  const error = element("p", "watch-error"); error.setAttribute("role", "alert");
  const list = element("div", "favorite-group-list"); dialog.append(list);
  const form = element("form", "favorite-group-create");
  const label = element("label", "watch-field", "New group"); const input = element("input", "form-input"); input.required = true; input.maxLength = 40; label.append(input);
  const create = element("button", "btn", "Create group"); create.type = "submit"; form.append(label, create);
  const actions = element("div", "watch-dialog-actions favorite-group-actions");
  actions.append(button("Done", () => dialog.close()));
  dialog.append(form, error, actions);
  async function change(action, id, name) {
    if (busy) return;
    busy = true; error.textContent = "";
    for (const control of dialog.querySelectorAll("button, input")) control.disabled = true;
    try {
      onSaved(await window.api.favorites.group(action, id, name)); render();
      if (action === "create") { input.value = ""; input.focus(); }
      else list.querySelector(`[data-group-id="${id}"] input`)?.focus();
    } catch (failure) { error.textContent = failure.message; }
    finally {
      busy = false; for (const control of dialog.querySelectorAll("button, input")) control.disabled = false;
      (list.querySelector(`[data-group-id="${id}"] input`) || input).focus();
    }
  }
  function render() {
    list.replaceChildren();
    for (const group of getGroups()) {
      const row = element("div", "favorite-group-row"); row.dataset.groupId = group.id;
      const name = element("input", "form-input"); name.value = group.name; name.maxLength = 40; name.setAttribute("aria-label", "Name for group " + group.name);
      row.append(name, button("Rename", () => { if (name.value.trim()) void change("rename", group.id, name.value); }), button("Delete", async () => {
        // Use an inline native confirmation so the top-layer group dialog does not
        // hide the application's existing overlay confirmation.
        if (busy) return;
        const confirm = createDialog("Delete group?");
        confirm.classList.add("favorite-groups-dialog");
        const confirmActions = element("div", "watch-dialog-actions favorite-group-actions");
        confirmActions.append(button("Cancel", () => confirm.close()), button("Delete group", () => { confirm.close(); void change("delete", group.id); }));
        confirm.append(element("p", "watch-help", `Delete “${group.name}”? Its favorites will move to Ungrouped.`), confirmActions);
        confirm.showModal();
      }));
      list.append(row);
    }
    if (!getGroups().length) list.append(element("p", "watch-help", "No groups yet. Favorites work without groups."));
  }
  form.addEventListener("submit", (event) => { event.preventDefault(); if (form.reportValidity()) void change("create", null, input.value); });
  dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
  render(); dialog.showModal(); input.focus();
}
