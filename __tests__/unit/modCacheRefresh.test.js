const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

describe("server mod-cache refresh", () => {
  let directory;
  let servers;
  let query;
  let cacheFile;
  const key = "1.2.3.4:2302";
  const oldEntry = { timestamp: Date.now(), mods: [{ id: "123", name: "Mod" }], country: "GB" };

  beforeEach(async () => {
    jest.resetModules();
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "dzlinux-mod-cache-"));
    cacheFile = path.join(directory, "mods_metadata_cache.json");
    await fs.writeFile(cacheFile, JSON.stringify({ entries: { [key]: oldEntry } }));
    jest.doMock("electron", () => ({ app: { getPath: () => directory } }), { virtual: true });
    query = jest.fn();
    jest.doMock("../../src/main/serverQuery", () => ({ queryServerGameDig: query }));
    servers = require("../../src/main/servers");
  });
  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  test.each([null, { mods: null }])("an incomplete query %j preserves the previous cache bytes", async result => {
    const before = await fs.readFile(cacheFile, "utf8");
    query.mockResolvedValue(result);
    expect(await servers.refreshServerModCache("1.2.3.4", 2302)).toBeNull();
    expect(await fs.readFile(cacheFile, "utf8")).toBe(before);
  });

  test("a successful vanilla response keeps its actual metadata", async () => {
    query.mockResolvedValue({ mods: [], map: "enoch", thirdPerson: false, password: true, time: "12:34", modded: false });
    expect(await servers.refreshServerModCache("1.2.3.4", 2302)).toMatchObject({
      mods: [], map: "enoch", thirdPerson: false, password: true, time: "12:34", modded: false, country: "GB",
    });
  });

  test("simultaneous refreshes preserve both servers", async () => {
    query.mockImplementation(async ip => ({ mods: [{ id: ip === "1.2.3.4" ? "111" : "222" }] }));
    await Promise.all([
      servers.refreshServerModCache("1.2.3.4", 2302),
      servers.refreshServerModCache("2.3.4.5", 2302),
    ]);
    const cache = JSON.parse(await fs.readFile(cacheFile, "utf8"));
    expect(cache.entries[key].mods).toEqual([{ id: "111" }]);
    expect(cache.entries["2.3.4.5:2302"].mods).toEqual([{ id: "222" }]);
  });
});
