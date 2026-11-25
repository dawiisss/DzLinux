const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { syncVersions } = require("../../build/sync-versions");

describe("syncVersions", () => {
  let tmpDir;
  const oldHash = "a".repeat(64);

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dzlinux-sync-versions-"));
    await fs.mkdir(path.join(tmpDir, "build"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ version: "2.1.3" }),
      "utf8",
    );
    await fs.writeFile(
      path.join(tmpDir, "build", "com.dawiisss.dzlinux.yml"),
      `modules:\n  - name: dzlinux\n    sources:\n      - type: archive\n        url: https://github.com/dawiisss/DzLinux/releases/download/v2.1.2/dzlinux-2.1.2.tar.gz\n        sha256: ${oldHash}\n`,
      "utf8",
    );
    await fs.writeFile(
      path.join(tmpDir, "build", "PKGBUILD"),
      `pkgname=dzlinux-bin\npkgver=2.1.2\npkgrel=1\nsource=("https://github.com/dawiisss/DzLinux/releases/download/v\${pkgver}/dzlinux-\${pkgver}.tar.gz")\nsha256sums=('${oldHash}')\n`,
      "utf8",
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("keeps both Flatpak and PKGBUILD pinned when no release archive is provided", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      await syncVersions(tmpDir);
      const flatpak = await fs.readFile(path.join(tmpDir, "build", "com.dawiisss.dzlinux.yml"), "utf8");
      const pkgbuild = await fs.readFile(path.join(tmpDir, "build", "PKGBUILD"), "utf8");

      expect(flatpak).toContain(`v2.1.2/dzlinux-2.1.2.tar.gz`);
      expect(flatpak).toContain(`sha256: ${oldHash}`);
      expect(pkgbuild).toContain("pkgver=2.1.2");
      expect(pkgbuild).toContain(`sha256sums=('${oldHash}')`);
    } finally {
      logSpy.mockRestore();
    }
  });

  test("updates both Flatpak and PKGBUILD version and SHA-256 together when given the release archive", async () => {
    const archivePath = path.join(tmpDir, "dzlinux-2.1.3.tar.gz");
    const content = Buffer.from("release archive payload");
    await fs.writeFile(archivePath, content);
    const expectedHash = createHash("sha256").update(content).digest("hex");

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      await syncVersions(tmpDir, archivePath);
      const flatpak = await fs.readFile(path.join(tmpDir, "build", "com.dawiisss.dzlinux.yml"), "utf8");
      const pkgbuild = await fs.readFile(path.join(tmpDir, "build", "PKGBUILD"), "utf8");

      expect(flatpak).toContain("v2.1.3/dzlinux-2.1.3.tar.gz");
      expect(flatpak).toContain(`sha256: ${expectedHash}`);
      expect(pkgbuild).toContain("pkgver=2.1.3");
      expect(pkgbuild).toContain(`sha256sums=('${expectedHash}')`);
    } finally {
      logSpy.mockRestore();
    }
  });

  test("rejects PKGBUILD with SKIP checksum", async () => {
    await fs.writeFile(
      path.join(tmpDir, "build", "PKGBUILD"),
      `pkgname=dzlinux-bin\npkgver=2.1.2\nsha256sums=('SKIP')\n`,
      "utf8",
    );
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      await expect(syncVersions(tmpDir)).rejects.toThrow("pinned SHA-256 checksum");
    } finally {
      logSpy.mockRestore();
    }
  });
});
