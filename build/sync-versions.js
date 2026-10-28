const fs = require("node:fs/promises");
const path = require("node:path");

async function syncVersions(rootDir = path.resolve(__dirname, "..")) {
  // 1. Read package.json version
  const pkgPath = path.join(rootDir, "package.json");
  const pkgContent = await fs.readFile(pkgPath, "utf8");
  const { version } = JSON.parse(pkgContent);
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid version in package.json: ${String(version)}`);
  }
  console.log(`Syncing build configs to version: ${version}`);

  // 2. Sync PKGBUILD
  const pkgbuildPath = path.join(rootDir, "build", "PKGBUILD");
  const pkgbuildContent = await fs.readFile(pkgbuildPath, "utf8");
  const pkgverRegex = /^pkgver=.+$/m;
  if (!pkgverRegex.test(pkgbuildContent)) {
    throw new Error("Expected pkgver= entry not found in build/PKGBUILD");
  }
  const updatedPkgbuild = pkgbuildContent.replace(pkgverRegex, `pkgver=${version}`);
  if (updatedPkgbuild !== pkgbuildContent) {
    await fs.writeFile(pkgbuildPath, updatedPkgbuild, "utf8");
    console.log("Updated build/PKGBUILD");
  } else {
    console.log("build/PKGBUILD is already up to date");
  }

  // 3. Sync Flatpak manifest
  const flatpakPath = path.join(rootDir, "build", "com.dawiisss.dzlinux.yml");
  const flatpakContent = await fs.readFile(flatpakPath, "utf8");
  const flatpakUrlRegex =
    /url:\s+https:\/\/github\.com\/dawiisss\/DzLinux\/releases\/download\/v[^/]+\/(?:DzLinux-[^/]+-linux-x64|dzlinux-[^/]+)\.tar\.gz/g;
  if (!flatpakUrlRegex.test(flatpakContent)) {
    throw new Error("Expected release download URL not found in build/com.dawiisss.dzlinux.yml");
  }
  flatpakUrlRegex.lastIndex = 0;
  const updatedFlatpak = flatpakContent.replace(
    flatpakUrlRegex,
    `url: https://github.com/dawiisss/DzLinux/releases/download/v${version}/dzlinux-${version}.tar.gz`,
  );
  if (updatedFlatpak !== flatpakContent) {
    await fs.writeFile(flatpakPath, updatedFlatpak, "utf8");
    console.log("Updated build/com.dawiisss.dzlinux.yml");
  } else {
    console.log("build/com.dawiisss.dzlinux.yml is already up to date");
  }

  console.log("Version synchronization completed successfully.");
}

if (require.main === module) {
  syncVersions().catch((err) => {
    console.error("Failed to sync versions:", err.message);
    process.exit(1);
  });
}

module.exports = { syncVersions };
