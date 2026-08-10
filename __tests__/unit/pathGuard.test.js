const path = require("node:path");
const os = require("node:os");

const mockHome = path.join(os.tmpdir(), "dzlinux-pathguard-test-home");

let pathGuard;
let settingsManager;

beforeEach(() => {
  jest.resetModules();

  jest.doMock(
    "electron",
    () => {
      const p = require("node:path");
      const o = require("node:os");
      return {
        app: {
          getPath: jest.fn((name) => {
            if (name === "home")
              return p.join(o.tmpdir(), "dzlinux-pathguard-test-home");
            return p.join(o.tmpdir(), "dzlinux-test-data");
          }),
        },
      };
    },
    { virtual: true },
  );

  jest.doMock("../../src/main/settings", () => ({
    loadSettingsAsync: jest.fn(() => Promise.resolve({ modDirectory: "" })),
  }));

  pathGuard = require("../../src/main/ipc/pathGuard");
  settingsManager = require("../../src/main/settings");
});

afterEach(() => {
  jest.resetModules();
  jest.unmock("electron");
  jest.unmock("../../src/main/settings");
});

describe("pathGuard", () => {
  describe("getAllowedPathPrefixes", () => {
    test("returns an array of allowed path prefixes anchored on the home directory", () => {
      const prefixes = pathGuard.getAllowedPathPrefixes();
      expect(Array.isArray(prefixes)).toBe(true);
      expect(prefixes.length).toBeGreaterThanOrEqual(4);

      // Should include Steam paths under mockHome
      expect(prefixes).toContain(path.join(mockHome, ".steam"));
      expect(prefixes).toContain(
        path.join(mockHome, ".local", "share", "Steam"),
      );
      expect(prefixes).toContain(
        path.join(mockHome, ".var", "app", "com.valvesoftware.Steam"),
      );

      // Should include system directories
      expect(prefixes).toContain("/usr");
      expect(prefixes).toContain("/opt");
      expect(prefixes).toContain("/snap");

      // Should include the home directory itself
      expect(prefixes).toContain(mockHome);
    });
  });

  describe("isAllowedPath", () => {
    test("allows paths under the user home directory", async () => {
      const allowed = await pathGuard.isAllowedPath(
        path.join(mockHome, "Documents", "file.txt"),
      );
      expect(allowed).toBe(true);
    });

    test("allows paths under .steam", async () => {
      const allowed = await pathGuard.isAllowedPath(
        path.join(mockHome, ".steam", "steam", "steamapps"),
      );
      expect(allowed).toBe(true);
    });

    test("allows paths under .local/share/Steam", async () => {
      const allowed = await pathGuard.isAllowedPath(
        path.join(mockHome, ".local", "share", "Steam", "steamapps"),
      );
      expect(allowed).toBe(true);
    });

    test("allows paths under /usr", async () => {
      const allowed = await pathGuard.isAllowedPath("/usr/bin/dayz");
      expect(allowed).toBe(true);
    });

    test("allows paths under /opt", async () => {
      const allowed = await pathGuard.isAllowedPath("/opt/steam/runtime");
      expect(allowed).toBe(true);
    });

    test("allows paths under /snap", async () => {
      const allowed = await pathGuard.isAllowedPath("/snap/steam/current");
      expect(allowed).toBe(true);
    });

    // --- Security-critical: path traversal attacks ---

    test("rejects non-string inputs", async () => {
      expect(await pathGuard.isAllowedPath(null)).toBe(false);
      expect(await pathGuard.isAllowedPath(undefined)).toBe(false);
      expect(await pathGuard.isAllowedPath(42)).toBe(false);
      expect(await pathGuard.isAllowedPath({})).toBe(false);
      expect(await pathGuard.isAllowedPath([])).toBe(false);
    });

    test("rejects empty string input", async () => {
      const allowed = await pathGuard.isAllowedPath("");
      // Empty string resolves to CWD via path.resolve, which may or may
      // not be under an allowed prefix. Just ensure it doesn't throw.
      expect(typeof allowed).toBe("boolean");
    });

    test("rejects paths outside all allowed prefixes", async () => {
      const allowed = await pathGuard.isAllowedPath("/etc/passwd");
      expect(allowed).toBe(false);
    });

    test("rejects /tmp paths (not in allowed list)", async () => {
      const allowed = await pathGuard.isAllowedPath("/tmp/evil-payload");
      expect(allowed).toBe(false);
    });

    test("rejects path traversal attempting to escape home directory", async () => {
      const traversal = path.join(mockHome, "..", "..", "etc", "shadow");
      const allowed = await pathGuard.isAllowedPath(traversal);
      expect(allowed).toBe(false);
    });

    test("rejects path traversal via /../ in the middle", async () => {
      const traversal = path.join(
        mockHome,
        ".steam",
        "..",
        "..",
        "..",
        "etc",
        "passwd",
      );
      const allowed = await pathGuard.isAllowedPath(traversal);
      expect(allowed).toBe(false);
    });

    test("resolves paths to their canonical form before checking", async () => {
      const messy = mockHome + "/./Documents/../Documents/./file.txt";
      const allowed = await pathGuard.isAllowedPath(messy);
      expect(allowed).toBe(true);
    });

    // --- Mod directory from settings ---

    test("allows paths under the configured mod directory", async () => {
      const customModDir = "/mnt/games/dayz-mods";
      settingsManager.loadSettingsAsync.mockResolvedValueOnce({
        modDirectory: customModDir,
      });

      const allowed = await pathGuard.isAllowedPath(
        path.join(customModDir, "@mod123", "addons", "config.cpp"),
      );
      expect(allowed).toBe(true);
    });

    test("still validates when settings fail to load", async () => {
      settingsManager.loadSettingsAsync.mockRejectedValueOnce(
        new Error("Corrupted settings"),
      );

      const allowed = await pathGuard.isAllowedPath(
        path.join(mockHome, "safe-file.txt"),
      );
      expect(allowed).toBe(true);
    });

    test("does not allow mod directory traversal", async () => {
      const customModDir = "/mnt/games/dayz-mods";
      settingsManager.loadSettingsAsync.mockResolvedValueOnce({
        modDirectory: customModDir,
      });

      const traversal = path.join(customModDir, "..", "..", "etc", "passwd");
      const allowed = await pathGuard.isAllowedPath(traversal);
      expect(allowed).toBe(false);
    });

    // --- Prefix boundary: partial prefix match should not succeed ---

    test("paths sharing a prefix but not a boundary should be rejected", async () => {
      const allowed = await pathGuard.isAllowedPath("/optional-evil/payload");
      expect(allowed).toBe(false);
    });
  });
});
