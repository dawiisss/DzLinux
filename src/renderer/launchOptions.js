export function updateLaunchOptionAvailability(protonPath, gameModeAvailable = true) {
  const directProton = Boolean(protonPath && protonPath !== "default");
  const controls = [
    "enableGameMode", "flagMangoHud", "mangoHudConfig", "noEsync",
    "dxvkAsyncEnabled", "dxvkThreads", "dxvkConfig", "disableProtonLogs", "mallocTrim",
  ];
  for (const id of controls) {
    const control = document.getElementById(id);
    if (!control) continue;
    const missingGameMode = id === "enableGameMode" && !gameModeAvailable;
    control.disabled = !directProton || missingGameMode;
    control.title = missingGameMode
      ? "Install GameMode to use this option."
      : directProton ? "" : "Select a custom Proton version to apply this option.";
  }
  const hint = document.getElementById("launchModeHint");
  if (hint) {
    hint.textContent = directProton
      ? "Proton performance options apply to this launch. Native Wayland also enables Wayland for the game."
      : "Steam launch uses DayZ's Steam Launch Options for GameMode, MangoHud, DXVK and Proton environment settings. Select a custom Proton version to manage them here. Native Wayland still applies to this app after restart.";
  }
}
