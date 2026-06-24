const fs = require("fs");
const path = require("path");
const os = require("os");

function configureMangoHud(settings) {
  let mangoBackupPath = "";
  if (settings.mangoHudEnabled && settings.mangoHudConfig) {
    const mangoHudDir = path.join(os.homedir(), ".config", "MangoHud");
    const mangoHudPath = path.join(mangoHudDir, "MangoHud.conf");
    mangoBackupPath = path.join(mangoHudDir, "MangoHud.conf.dzlinux-bak");
    try {
      if (!fs.existsSync(mangoHudDir))
        fs.mkdirSync(mangoHudDir, { recursive: true });
      if (fs.existsSync(mangoHudPath)) {
        fs.copyFileSync(mangoHudPath, mangoBackupPath);
      }
      const preset = settings.mangoHudConfig
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const mangoConfig = preset.map((key) => `${key}`).join("\n");
      fs.writeFileSync(mangoHudPath, mangoConfig);
    } catch (e) {
      console.error("Failed to write MangoHud config", e.message);
    }
  }

  const restoreMangoConfig = () => {
    if (mangoBackupPath && fs.existsSync(mangoBackupPath)) {
      const mangoHudPath = path.join(
        os.homedir(),
        ".config",
        "MangoHud",
        "MangoHud.conf"
      );
      try {
        fs.copyFileSync(mangoBackupPath, mangoHudPath);
        fs.unlinkSync(mangoBackupPath);
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
