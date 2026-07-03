const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

async function configureMangoHud(settings) {
  let mangoBackupPath = "";
  const existsAsync = async (p) =>
    fs.promises
      .access(p)
      .then(() => true)
      .catch(() => false);

  if (settings.mangoHudEnabled && settings.mangoHudConfig) {
    const mangoHudDir = path.join(os.homedir(), ".config", "MangoHud");
    const mangoHudPath = path.join(mangoHudDir, "MangoHud.conf");
    mangoBackupPath = path.join(mangoHudDir, "MangoHud.conf.dzlinux-bak");
    try {
      if (!(await existsAsync(mangoHudDir)))
        await fs.promises.mkdir(mangoHudDir, { recursive: true });
      if (await existsAsync(mangoHudPath)) {
        await fs.promises.copyFile(mangoHudPath, mangoBackupPath);
      }
      const preset = settings.mangoHudConfig
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const mangoConfig = preset.map((key) => `${key}`).join("\n");
      await fs.promises.writeFile(mangoHudPath, mangoConfig, "utf8");
    } catch (e) {
      console.error("Failed to write MangoHud config", e.message);
    }
  }

  const restoreMangoConfig = async () => {
    if (mangoBackupPath && (await existsAsync(mangoBackupPath))) {
      const mangoHudPath = path.join(
        os.homedir(),
        ".config",
        "MangoHud",
        "MangoHud.conf"
      );
      try {
        await fs.promises.copyFile(mangoBackupPath, mangoHudPath);
        await fs.promises.unlink(mangoBackupPath);
      } catch (e) {
        console.error("Failed to restore MangoHud config:", e.message);
      }
    }
  };

  return {
    mangoBackupPath,
    restoreMangoConfig,
  };
}

module.exports = {
  configureMangoHud,
};
