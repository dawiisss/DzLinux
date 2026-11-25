function configureDxvk(settings, env) {
  let dxvkCfg = [];
  if (settings.dxvkConfig && settings.dxvkConfig.trim()) {
    dxvkCfg = settings.dxvkConfig.split("\n").filter((l) => l.trim());
  } else {
    if (settings.dxvkAsyncEnabled) dxvkCfg.push("dxvk.enableAsync = True");
    const threads = parseInt(settings.dxvkThreads, 10);
    if (!isNaN(threads) && threads > 0) {
      dxvkCfg.push(`dxvk.numCompilerThreads = ${threads}`);
    }
  }

  if (dxvkCfg.length > 0) {
    env.DXVK_CONFIG = dxvkCfg.join("; ");
  }
}

module.exports = {
  configureDxvk,
};
