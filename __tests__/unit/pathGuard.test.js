const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");

let mockHome;
let tempDir;

let pathGuard;
let settingsManager;

beforeEach(async () => {
  jest.resetModules();
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dzlinux-pathguard-test-"));
  mockHome = path.join(tempDir, "home");
  await fs.mkdir(mockHome);

  jest.doMock(
    "electron",
    () => {
      return {
        app: {
          getPath: jest.fn((name) => name === "home" ? mockHome : tempDir),
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

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
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

  describe("resolveAllowedPath", () => {
    test.each(["Documents", ".steam/steam/steamapps", ".local/share/Steam/steamapps"])(
      "allows an existing directory under %s",
      async (relative) => {
        const target = path.join(mockHome, relative);
        await fs.mkdir(target, { recursive: true });
        expect(await pathGuard.resolveAllowedPath(target)).toBe(await fs.realpath(target));
      },
    );

    test.each([null, undefined, 42, {}, [], ""])("rejects invalid path %p", async (input) => {
      expect(await pathGuard.resolveAllowedPath(input)).toBeNull();
    });

    test("rejects missing paths", async () => {
      expect(await pathGuard.resolveAllowedPath(path.join(mockHome, "missing"))).toBeNull();
    });

    test("uses the canonical target when resolving dot segments", async () => {
      const target = path.join(mockHome, "Documents");
      await fs.mkdir(target);
      expect(await pathGuard.resolveAllowedPath(`${mockHome}/Documents/../Documents`)).toBe(await fs.realpath(target));
    });

    test("requires a full path segment match for a sibling directory", async () => {
      const sibling = mockHome + "-other";
      await fs.mkdir(sibling);
      expect(await pathGuard.resolveAllowedPath(sibling)).toBeNull();
    });

    test("authorizes the symlink target using the configured roots", async () => {
      const otherLibrary = path.join(tempDir, "other-library");
      const link = path.join(mockHome, "workshop");
      await fs.mkdir(otherLibrary);
      await fs.symlink(otherLibrary, link, "dir");

      expect(await pathGuard.resolveAllowedPath(link)).toBeNull();
      settingsManager.loadSettingsAsync.mockResolvedValue({ modDirectory: link });
      expect(await pathGuard.resolveAllowedPath(link)).toBe(await fs.realpath(otherLibrary));
    });

    test("still validates home paths when settings fail to load", async () => {
      settingsManager.loadSettingsAsync.mockRejectedValueOnce(new Error("Corrupted settings"));
      expect(await pathGuard.resolveAllowedPath(mockHome)).toBe(await fs.realpath(mockHome));
    });
  });
});
