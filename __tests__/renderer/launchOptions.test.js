/** @jest-environment jsdom */

const { updateLaunchOptionAvailability } = require("../../src/renderer/launchOptions.js");

beforeEach(() => {
  document.body.innerHTML = '<input id="enableGameMode" type="checkbox" checked><input id="flagMangoHud" type="checkbox" checked><input id="noEsync"><input id="dxvkConfig"><input id="mallocTrim"><input id="nativeWayland"><p id="launchModeHint"></p>';
});

test("Steam mode disables unsupported options while preserving their saved values", () => {
  updateLaunchOptionAvailability("default");
  for (const id of ["enableGameMode", "flagMangoHud", "noEsync", "dxvkConfig", "mallocTrim"]) {
    expect(document.getElementById(id).disabled).toBe(true);
  }
  expect(document.getElementById("flagMangoHud").checked).toBe(true);
  expect(document.getElementById("nativeWayland").disabled).toBe(false);
  expect(document.getElementById("launchModeHint").textContent).toContain("Steam Launch Options");
});

test("custom Proton restores controls but respects missing GameMode", () => {
  updateLaunchOptionAvailability("default");
  updateLaunchOptionAvailability("/proton/proton", false);
  expect(document.getElementById("enableGameMode").disabled).toBe(true);
  expect(document.getElementById("flagMangoHud").disabled).toBe(false);
  updateLaunchOptionAvailability("/proton/proton", true);
  expect(document.getElementById("enableGameMode").disabled).toBe(false);
});
