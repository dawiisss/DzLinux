jest.mock("axios", () => ({ post: jest.fn() }));
const axios = require("axios");
const { getModDownloadSizes, resolveDependencies, _clearCache } = require("../../src/main/steamDependencyResolver");

const response = details => ({ data: { response: { publishedfiledetails: details } } });
const item = (id, size) => ({ publishedfileid: id, result: 1, file_size: size, title: `Mod ${id}` });

beforeEach(() => {
  _clearCache();
  axios.post.mockReset();
});
afterEach(() => jest.restoreAllMocks());

test("batch sizes deduplicate IDs and reuse metadata across dependency and size lookups", async () => {
  axios.post.mockResolvedValue(response([item("1", "538560"), item("2", 5_000_000_000)]));
  expect(await getModDownloadSizes(["1", 2, "1"])).toEqual([
    { id: "1", sizeBytes: 538560 }, { id: "2", sizeBytes: 5_000_000_000 },
  ]);
  await getModDownloadSizes(["2", "1"]);
  await resolveDependencies("1");
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(new URLSearchParams(axios.post.mock.calls[0][1]).get("itemcount")).toBe("2");
});

test("overlapping cards share in-flight Workshop requests", async () => {
  let finish;
  axios.post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const first = getModDownloadSizes(["1", "2"]);
  const second = getModDownloadSizes(["2"]);
  finish(response([item("1", 100), item("2", 200)]));
  expect(await first).toHaveLength(2);
  expect(await second).toEqual([{ id: "2", sizeBytes: 200 }]);
  expect(axios.post).toHaveBeenCalledTimes(1);
});

test("missing, private and malformed sizes stay unknown instead of becoming zero", async () => {
  const invalid = [undefined, null, "", "-1", -1, "NaN", "1.5", {}, true, "9007199254740992"];
  const details = invalid.map((size, i) => item(String(i + 1), size));
  details.push({ publishedfileid: "11", result: 9 }, item("12", "0"));
  axios.post.mockResolvedValue(response(details));
  const sizes = await getModDownloadSizes(Array.from({ length: 13 }, (_, i) => String(i + 1)));
  expect(sizes.filter(mod => mod.id !== "12").every(mod => mod.sizeBytes === null)).toBe(true);
  expect(sizes.find(mod => mod.id === "12").sizeBytes).toBe(0);
});

test("requests split at 50 items and failed chunks return unknown sizes", async () => {
  const ids = Array.from({ length: 51 }, (_, i) => String(i + 1));
  axios.post.mockResolvedValueOnce(response(ids.slice(0, 50).map(id => item(id, 100))))
    .mockRejectedValueOnce(new Error("Offline"));
  const sizes = await getModDownloadSizes(ids);
  expect(sizes.slice(0, 50).every(mod => mod.sizeBytes === 100)).toBe(true);
  expect(sizes[50]).toEqual({ id: "51", sizeBytes: null });
  expect(axios.post).toHaveBeenCalledTimes(2);
});

test("expired sizes refresh and are not reported as current after a failed refresh", async () => {
  const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  axios.post.mockResolvedValueOnce(response([item("1", "100")]));
  await getModDownloadSizes(["1"]);
  now.mockReturnValue(1_000_000 + 60 * 60 * 1000);
  axios.post.mockRejectedValueOnce(new Error("Offline"));
  expect(await getModDownloadSizes(["1"])).toEqual([{ id: "1", sizeBytes: null }]);
});
