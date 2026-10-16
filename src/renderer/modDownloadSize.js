function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unit = 0;
  while (bytes >= 1000 && unit < units.length - 1) {
    bytes /= 1000;
    unit++;
  }
  return `${unit === 0 ? bytes : bytes.toFixed(2)} ${units[unit]}`;
}

export function createModSizeLabel(server) {
  const label = document.createElement("span");
  label.className = "mod-download-size";
  label.setAttribute("role", "status");
  const explanation = "Steam-reported size of all required mods, including installed mods. " +
    "Actual download size depends on installed mods, updates and Steam compression.";
  label.title = explanation;

  const ids = [...new Set((server.mods || []).map(mod => String(mod.id || "")))];
  if (ids.length === 0) {
    const knownEmpty = !server.modded || (server.hasQueriedMods && !server.modQueryFailed);
    label.textContent = `Total mod size: ${knownEmpty ? "0 B" : "—"}`;
    if (!knownEmpty) label.title = "Available after the server's mod list has loaded.";
    return label;
  }

  label.textContent = "Total mod size: Loading…";
  // Only expanded cards request sizes; update this label without rebuilding the card.
  Promise.resolve().then(() => window.api.mods.getDownloadSizes(ids)).then(sizes => {
    const byId = new Map(sizes.map(mod => [String(mod.id), mod.sizeBytes]));
    let total = 0;
    let known = 0;
    for (const id of ids) {
      const size = byId.get(id);
      if (Number.isSafeInteger(size) && size >= 0 && Number.isSafeInteger(total + size)) {
        total += size;
        known++;
      }
    }
    if (known === ids.length) {
      label.textContent = `Total mod size: ${formatBytes(total)}`;
    } else if (known > 0) {
      label.textContent = `Total mod size: ≥ ${formatBytes(total)} (partial)`;
      label.title = `Sizes available for ${known} of ${ids.length} mods. ${explanation}`;
    } else {
      label.textContent = "Total mod size: Unavailable";
      label.title = "Steam did not provide sizes for these mods. Try Refresh again later.";
    }
  }).catch(() => {
    label.textContent = "Total mod size: Unavailable";
    label.title = "Unable to retrieve mod sizes from Steam. Try Refresh again later.";
  });

  return label;
}
