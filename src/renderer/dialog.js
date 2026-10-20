export function createDialog(title, onClose = () => {}) {
  const dialog = document.createElement("dialog");
  dialog.className = "app-dialog";
  const heading = document.createElement("h2");
  heading.id = "app-dialog-" + Math.random().toString(36).slice(2);
  heading.textContent = title;
  dialog.setAttribute("aria-labelledby", heading.id);
  dialog.append(heading);
  const previousFocus = document.activeElement;
  dialog.addEventListener("close", () => {
    onClose();
    dialog.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
  }, { once: true });
  document.body.append(dialog);
  return dialog;
}

export function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export function button(label, action, className = "btn btn-outline") {
  const node = element("button", className, label);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}
