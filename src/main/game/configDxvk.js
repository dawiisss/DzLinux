const fs = require("fs");
const path = require("path");

function configureDxvk(settings, compatDataPath, env) {
  let dxvkCfg = [];
  if (settings.dxvkConfig && settings.dxvkConfig.trim()) {
    dxvkCfg = settings.dxvkConfig.split("\n").filter((l) => l.trim());
  } else {
    if (settings.dxvkAsyncEnabled) dxvkCfg.push("dxvk.enableAsync = True");
    if (settings.dxvkThreads !== "0")
      dxvkCfg.push(`dxvk.numCompilerThreads = ${settings.dxvkThreads}`);
  }

  if (dxvkCfg.length > 0) {
    env.DXVK_CONFIG = dxvkCfg.join("; ");
    const dxvkConfPath = path.join(compatDataPath, "pfx", "dxvk.conf");
    try {
      const dxvkConfDir = path.dirname(dxvkConfPath);
      if (!fs.existsSync(dxvkConfDir))
        fs.mkdirSync(dxvkConfDir, { recursive: true });
      fs.writeFileSync(dxvkConfPath, dxvkCfg.join("\n"));
    } catch (e) {
      console.error("Failed to write dxvk.conf", e.message);
    }
  }
}

module.exports = {
  configureDxvk,
};
