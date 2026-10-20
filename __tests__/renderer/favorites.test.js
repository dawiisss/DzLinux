/** @jest-environment jsdom */
const { state, addFavorite, removeFavorite } = require("../../src/renderer/state.js");
let commitAdd;
beforeEach(() => {
  state.favorites = []; state.favoritesSet = new Set(); state.favoriteGroups = []; state.favoriteDataRevision = 0; state.settings = {};
  let records = []; let revision = 0;
  const snapshot = () => ({ revision, dataRevision: revision, entries: records.map((entry) => ({ ...entry })), groups: [], observations: {} });
  commitAdd = (input) => {
    records.push({ ...input, id: "favorite-" + (revision + 1), name: input.fallbackName, label: "", pinned: false, groupId: null, addedOrder: records.length, revision: 1 });
    revision++; return Promise.resolve(snapshot());
  };
  window.api = { favorites: { add: jest.fn(commitAdd), remove: jest.fn((id) => { records = records.filter((entry) => entry.id !== id); revision++; return Promise.resolve(snapshot()); }) } };
});
test("concurrent additions persist both favorites and keep the lookup in sync", async () => {
  let finish;
  window.api.favorites.add.mockImplementationOnce((input) => new Promise((resolve) => { finish = () => resolve(commitAdd(input)); }));
  const first = addFavorite("1.2.3.4", 2302, null, "A");
  const second = addFavorite("2.3.4.5", 2302, null, "B");
  await Promise.resolve(); expect(window.api.favorites.add).toHaveBeenCalledTimes(1);
  finish(); await Promise.all([first, second]);
  expect(state.favorites.map((entry) => entry.name)).toEqual(["A", "B"]);
  expect([...state.favoritesSet]).toEqual(["1.2.3.4:2302", "2.3.4.5:2302"]);
  expect(window.api.favorites.add.mock.lastCall[0]).toMatchObject({ ip: "2.3.4.5", port: 2302, fallbackName: "B" });
});
test("a queued remove observes an earlier add", async () => {
  await Promise.all([addFavorite("1.2.3.4", 2302, null, "A"), removeFavorite("1.2.3.4", 2302)]);
  expect(state.favorites).toEqual([]); expect(state.favoritesSet.size).toBe(0);
  expect(window.api.favorites.remove).toHaveBeenCalledWith("favorite-1");
});
test("a failed save leaves state intact and the next operation still succeeds", async () => {
  window.api.favorites.add.mockRejectedValueOnce(new Error("Could not save favorite"));
  const failed = addFavorite("1.2.3.4", 2302, null, "A"); const next = addFavorite("2.3.4.5", 2302, null, "B");
  await expect(failed).rejects.toThrow("Could not save favorite"); await next;
  expect(state.favorites.map((entry) => entry.name)).toEqual(["B"]);
  expect([...state.favoritesSet]).toEqual(["2.3.4.5:2302"]);
});
