const {
  runSystemCheck,
  checkSteamStatus,
  checkProtonStatus,
  checkDiskSpaceAndPermissions,
  checkGameModeStatus,
  checkMangoHudStatus,
  checkVulkanStatus,
} = require("../../src/main/systemCheck");

jest.mock("../../src/main/steamPaths", () => ({
  getSteamInstallPathAsync: jest.fn().mockResolvedValue("/home/test/.steam/steam"),
}));

jest.mock("../../src/main/settings", () => ({
  loadSettingsAsync: jest.fn().mockResolvedValue({
    modDirectory: "/tmp/test-workshop-content",
  }),
}));

jest.mock("../../src/main/game/launchProton", () => ({
  scanProtonVersions: jest.fn().mockResolvedValue([
    { name: "Proton Experimental", path: "/path/to/proton" },
  ]),
}));

jest.mock("../../src/main/game/prepareEnv", () => ({
  checkGameMode: jest.fn().mockResolvedValue(true),
}));

describe("System Compatibility Checker", () => {
  test("runSystemCheck returns results for all 6 check categories", async () => {
    const results = await runSystemCheck();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(6);

    const ids = results.map((r) => r.id);
    expect(ids).toContain("steam");
    expect(ids).toContain("proton");
    expect(ids).toContain("storage");
    expect(ids).toContain("gamemode");
    expect(ids).toContain("mangohud");
    expect(ids).toContain("vulkan");
  });

  test("checkSteamStatus returns valid status object", async () => {
    const status = await checkSteamStatus();
    expect(status.id).toBe("steam");
    expect(status.category).toBe("Steam Environment");
    expect(["pass", "warn", "error"]).toContain(status.status);
    expect(typeof status.details).toBe("string");
  });

  test("checkProtonStatus returns pass when Proton versions are found", async () => {
    const status = await checkProtonStatus();
    expect(status.id).toBe("proton");
    expect(status.status).toBe("pass");
    expect(status.details).toContain("Proton Experimental");
  });

  test("checkDiskSpaceAndPermissions returns valid status object", async () => {
    const status = await checkDiskSpaceAndPermissions();
    expect(status.id).toBe("storage");
    expect(["pass", "warn", "error"]).toContain(status.status);
  });

  test("checkGameModeStatus returns pass when GameMode is available", async () => {
    const status = await checkGameModeStatus();
    expect(status.id).toBe("gamemode");
    expect(status.status).toBe("pass");
  });

  test("checkMangoHudStatus returns valid status object", async () => {
    const status = await checkMangoHudStatus();
    expect(status.id).toBe("mangohud");
    expect(["pass", "warn"]).toContain(status.status);
  });

  test("checkVulkanStatus returns valid status object", async () => {
    const status = await checkVulkanStatus();
    expect(status.id).toBe("vulkan");
    expect(["pass", "warn"]).toContain(status.status);
  });
});
