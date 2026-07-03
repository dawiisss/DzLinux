const fs = require("node:fs");
const path = require("node:path");

async function configureDxvk(settings, compatDataPath, env) {
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
      const dirExists = await fs.promises.access(dxvkConfDir).then(() => true).catch(() => false);
      if (!dirExists) {
        await fs.promises.mkdir(dxvkConfDir, { recursive: true });
      }
      await fs.promises.writeFile(dxvkConfPath, dxvkCfg.join("\n"), "utf8");
    } catch (e) {
      console.error("Failed to write dxvk.conf", e.message);
    }
  }
}

module.exports = {
  configureDxvk,
};
