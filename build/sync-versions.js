const fs = require("node:fs/promises");
const { createReadStream } = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");

async function syncVersions(rootDir = path.resolve(__dirname, ".."), archivePath) {
  // 1. Read package.json version
  const pkgPath = path.join(rootDir, "package.json");
  const pkgContent = await fs.readFile(pkgPath, "utf8");
  const { version } = JSON.parse(pkgContent);
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid version in package.json: ${String(version)}`);
  }
  console.log(`Syncing build configs to version: ${version}`);

  const flatpakPath = path.join(rootDir, "build", "com.dawiisss.dzlinux.yml");
  const flatpakContent = await fs.readFile(flatpakPath, "utf8");
  const flatpakSource = /url: https:\/\/github\.com\/dawiisss\/DzLinux\/releases\/download\/v([^/]+)\/[^/\n]+\.tar\.gz\n(\s*)sha256: [0-9a-fA-F]{64}/;
  const currentSource = flatpakContent.match(flatpakSource);
  if (!currentSource) throw new Error("Expected a versioned release URL and SHA-256 checksum in the Flatpak manifest");

  const pkgbuildPath = path.join(rootDir, "build", "PKGBUILD");
  const pkgbuildContent = await fs.readFile(pkgbuildPath, "utf8");
  const pkgverRegex = /^pkgver=(.+)$/m;
  const pkgbuildChecksumRegex = /^sha256sums=\('[0-9a-fA-F]{64}'\)$/m;
  const currentPkgver = pkgbuildContent.match(pkgverRegex);
  if (!currentPkgver) {
    throw new Error("Expected pkgver= entry not found in build/PKGBUILD");
  }
  if (!pkgbuildChecksumRegex.test(pkgbuildContent)) {
    throw new Error("Expected a pinned SHA-256 checksum in build/PKGBUILD");
  }

  let updatedFlatpak = flatpakContent;
  let updatedPkgbuild = pkgbuildContent;
  if (archivePath) {
    const archiveName = `dzlinux-${version}.tar.gz`;
    if (path.basename(archivePath) !== archiveName) throw new Error(`Expected release archive ${archiveName}`);
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(archivePath)) digest.update(chunk);
    const sha256 = digest.digest("hex");
    updatedFlatpak = flatpakContent.replace(flatpakSource, (_source, _version, indent) =>
      `url: https://github.com/dawiisss/DzLinux/releases/download/v${version}/${archiveName}\n${indent}sha256: ${sha256}`,
    );
    updatedPkgbuild = pkgbuildContent
      .replace(pkgverRegex, `pkgver=${version}`)
      .replace(pkgbuildChecksumRegex, `sha256sums=('${sha256}')`);
  } else {
    if (currentSource[1] !== version) {
      console.log(`Flatpak remains pinned to v${currentSource[1]}. Pass the published release archive to update its URL and checksum together.`);
    }
    if (currentPkgver[1] !== version) {
      console.log(`PKGBUILD remains pinned to v${currentPkgver[1]}. Pass the published release archive to update its version and checksum together.`);
    }
  }

  if (updatedPkgbuild !== pkgbuildContent) {
    await fs.writeFile(pkgbuildPath, updatedPkgbuild, "utf8");
    console.log("Updated build/PKGBUILD");
  } else if (currentPkgver[1] === version) {
    console.log("build/PKGBUILD is already up to date");
  }

  if (updatedFlatpak !== flatpakContent) {
    await fs.writeFile(flatpakPath, updatedFlatpak, "utf8");
    console.log("Updated build/com.dawiisss.dzlinux.yml");
  }

  console.log("Version synchronization completed successfully.");
}

if (require.main === module) {
  syncVersions(undefined, process.argv[2]).catch((err) => {
    console.error("Failed to sync versions:", err.message);
    process.exit(1);
  });
}

module.exports = { syncVersions };
