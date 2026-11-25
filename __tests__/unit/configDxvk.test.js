const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { configureDxvk } = require("../../src/main/game/configDxvk");

test("uses custom DXVK config lines and ignores blank lines", () => {
  const env = {};
  configureDxvk({ dxvkConfig: "dxvk.enableAsync = True\n\ndxvk.numCompilerThreads = 4\n   \n" }, env);
  expect(env.DXVK_CONFIG).toBe("dxvk.enableAsync = True; dxvk.numCompilerThreads = 4");
});

test("builds launch options from the async toggle and thread count", () => {
  const env = {};
  configureDxvk({ dxvkAsyncEnabled: true, dxvkThreads: "8" }, env);
  expect(env.DXVK_CONFIG).toBe("dxvk.enableAsync = True; dxvk.numCompilerThreads = 8");
});

test("leaves an inherited DXVK setting alone when no launcher options apply", () => {
  const env = { DXVK_CONFIG: "dxgi.maxFrameLatency = 2" };
  configureDxvk({ dxvkAsyncEnabled: false, dxvkThreads: "-3" }, env);
  expect(env.DXVK_CONFIG).toBe("dxgi.maxFrameLatency = 2");
});

test("writes settings to the child environment and leaves the prefix config intact", async () => {
  const prefix = await fs.mkdtemp(path.join(os.tmpdir(), "dzlinux-dxvk-"));
  const conf = path.join(prefix, "pfx", "dxvk.conf");
  try {
    await fs.mkdir(path.dirname(conf));
    await fs.writeFile(conf, "dxgi.maxFrameLatency = 2");
    const env = { STEAM_COMPAT_DATA_PATH: prefix };
    configureDxvk({ dxvkThreads: "4" }, env);
    expect(env.DXVK_CONFIG).toBe("dxvk.numCompilerThreads = 4");
    expect(await fs.readFile(conf, "utf8")).toBe("dxgi.maxFrameLatency = 2");
  } finally {
    await fs.rm(prefix, { recursive: true, force: true });
  }
});
