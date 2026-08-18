const fs = require("fs");
const path = require("path");
const os = require("os");

describe("steamPaths", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dzlinux-steampaths-"));
    jest.resetModules();
    jest.spyOn(os, "homedir").mockReturnValue(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  test("getSteamInstallPath returns first matched candidate", () => {
    const targetDir = path.join(tmpDir, ".steam", "steam");
    fs.mkdirSync(targetDir, { recursive: true });

    const { getSteamInstallPath, _clearCache } = require("../../src/main/steamPaths");
    _clearCache();

    expect(getSteamInstallPath()).toBe(targetDir);
  });

  test("getSteamInstallPath returns fallback if no matches", () => {
    const { getSteamInstallPath, _clearCache } = require("../../src/main/steamPaths");
    _clearCache();

    const expectedFallback = path.join(tmpDir, ".local", "share", "Steam");
    expect(getSteamInstallPath()).toBe(expectedFallback);
  });

  test("findDayzWorkshopFolder parses libraryfolders.vdf", () => {
    const steamDir = path.join(tmpDir, ".local", "share", "Steam");
    fs.mkdirSync(steamDir, { recursive: true });

    // Create a fake libraryfolders.vdf
    const vdfPath = path.join(steamDir, "steamapps", "libraryfolders.vdf");
    fs.mkdirSync(path.dirname(vdfPath), { recursive: true });
    
    const fakeLibraryFolders = `
      "libraryfolders"
      {
        "0"
        {
          "path"    "${tmpDir.replace(/\\/g, '\\\\')}/CustomLibrary"
        }
      }
    `;
    fs.writeFileSync(vdfPath, fakeLibraryFolders, "utf8");

    const customWorkshop = path.join(tmpDir, "CustomLibrary", "steamapps", "workshop", "content", "221100");
    fs.mkdirSync(customWorkshop, { recursive: true });

    const { findDayzWorkshopFolder, _clearCache } = require("../../src/main/steamPaths");
    _clearCache();

    expect(findDayzWorkshopFolder()).toBe(customWorkshop);
  });

  test("findDayzWorkshopFolder falls back to main workshop folder", () => {
    const steamDir = path.join(tmpDir, ".local", "share", "Steam");
    const mainWorkshop = path.join(steamDir, "steamapps", "workshop", "content", "221100");
    fs.mkdirSync(mainWorkshop, { recursive: true });

    const { findDayzWorkshopFolder, _clearCache } = require("../../src/main/steamPaths");
    _clearCache();

    expect(findDayzWorkshopFolder()).toBe(mainWorkshop);
  });

  test("findDayzWorkshopFolder returns empty string if not found", () => {
    const { findDayzWorkshopFolder, _clearCache } = require("../../src/main/steamPaths");
    _clearCache();

    expect(findDayzWorkshopFolder()).toBe("");
  });

  test("getDayzLogsCandidatePaths returns candidate paths for all steam dirs", () => {
    const { getDayzLogsCandidatePaths } = require("../../src/main/steamPaths");
    const candidates = getDayzLogsCandidatePaths();
    expect(candidates.length).toBe(3);
    expect(candidates[0]).toContain("steamapps/compatdata/221100");
  });

  describe("async steamPaths methods", () => {
    test("getSteamInstallPathAsync returns first matched candidate", async () => {
      const targetDir = path.join(tmpDir, ".steam", "steam");
      fs.mkdirSync(targetDir, { recursive: true });

      const { getSteamInstallPathAsync, _clearCache } = require("../../src/main/steamPaths");
      _clearCache();

      const result = await getSteamInstallPathAsync();
      expect(result).toBe(targetDir);
    });

    test("getSteamInstallPathAsync returns fallback if no matches", async () => {
      const { getSteamInstallPathAsync, _clearCache } = require("../../src/main/steamPaths");
      _clearCache();

      const expectedFallback = path.join(tmpDir, ".local", "share", "Steam");
      const result = await getSteamInstallPathAsync();
      expect(result).toBe(expectedFallback);
    });

    test("findDayzWorkshopFolderAsync parses libraryfolders.vdf", async () => {
      const steamDir = path.join(tmpDir, ".local", "share", "Steam");
      fs.mkdirSync(steamDir, { recursive: true });

      const vdfPath = path.join(steamDir, "steamapps", "libraryfolders.vdf");
      fs.mkdirSync(path.dirname(vdfPath), { recursive: true });

      const fakeLibraryFolders = `
        "libraryfolders"
        {
          "0"
          {
            "path"    "${tmpDir.replace(/\\/g, "\\\\")}/AsyncCustomLibrary"
          }
        }
      `;
      fs.writeFileSync(vdfPath, fakeLibraryFolders, "utf8");

      const customWorkshop = path.join(tmpDir, "AsyncCustomLibrary", "steamapps", "workshop", "content", "221100");
      fs.mkdirSync(customWorkshop, { recursive: true });

      const { findDayzWorkshopFolderAsync, _clearCache } = require("../../src/main/steamPaths");
      _clearCache();

      const result = await findDayzWorkshopFolderAsync();
      expect(result).toBe(customWorkshop);
    });

    test("findDayzWorkshopFolderAsync falls back to main workshop folder", async () => {
      const steamDir = path.join(tmpDir, ".local", "share", "Steam");
      const mainWorkshop = path.join(steamDir, "steamapps", "workshop", "content", "221100");
      fs.mkdirSync(mainWorkshop, { recursive: true });

      const { findDayzWorkshopFolderAsync, _clearCache } = require("../../src/main/steamPaths");
      _clearCache();

      const result = await findDayzWorkshopFolderAsync();
      expect(result).toBe(mainWorkshop);
    });

    test("findDayzWorkshopFolderAsync returns empty string if not found", async () => {
      const { findDayzWorkshopFolderAsync, _clearCache } = require("../../src/main/steamPaths");
      _clearCache();

      const result = await findDayzWorkshopFolderAsync();
      expect(result).toBe("");
    });
  });
});
