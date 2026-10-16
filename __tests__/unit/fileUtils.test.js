const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { writeJsonAtomically } = require("../../src/main/fileUtils");

describe("atomic JSON persistence", () => {
  let directory;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "dzlinux-writes-"));
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
  });

  test("same-millisecond concurrent saves preserve the latest snapshot", async () => {
    jest.spyOn(Date, "now").mockReturnValue(123456789);
    const file = path.join(directory, "settings.json");
    const writes = Array.from({ length: 30 }, (_, index) => writeJsonAtomically(file, { index }));
    await Promise.all(writes);
    expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual({ index: 29 });
    expect(await fs.readdir(directory)).toEqual(["settings.json"]);
  });

  test("snapshots values before queued writes start", async () => {
    const file = path.join(directory, "settings.json");
    const value = { favorites: ["original"] };
    const write = writeJsonAtomically(file, value);
    value.favorites.push("later");
    await write;
    expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual({ favorites: ["original"] });
  });

  test("a failed save leaves the old file intact and does not block later saves", async () => {
    const file = path.join(directory, "settings.json");
    await writeJsonAtomically(file, { index: 0 });
    jest.spyOn(fs, "rename").mockRejectedValueOnce(new Error("Disk full"));
    await expect(writeJsonAtomically(file, { index: 1 })).rejects.toThrow("Disk full");
    expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual({ index: 0 });
    await writeJsonAtomically(file, { index: 2 });
    expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual({ index: 2 });
    expect(await fs.readdir(directory)).toEqual(["settings.json"]);
  });
});
