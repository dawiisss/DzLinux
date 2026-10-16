/** @jest-environment jsdom */

const { state, addFavorite, removeFavorite } = require("../../src/renderer/state.js");

beforeEach(() => {
  state.favorites = [];
  state.favoritesSet = new Set();
  state.settings = {};
  window.api = { settings: { saveFavorites: jest.fn().mockResolvedValue(true) } };
});

test("concurrent additions persist both favorites and keep the lookup in sync", async () => {
  let finish;
  window.api.settings.saveFavorites.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const first = addFavorite("1.2.3.4", 2302, null, "A");
  const second = addFavorite("2.3.4.5", 2302, null, "B");
  await Promise.resolve();
  expect(window.api.settings.saveFavorites).toHaveBeenCalledTimes(1);
  finish(true);
  await Promise.all([first, second]);
  expect(state.favorites.map(f => f.name)).toEqual(["A", "B"]);
  expect([...state.favoritesSet]).toEqual(["1.2.3.4:2302", "2.3.4.5:2302"]);
  expect(window.api.settings.saveFavorites.mock.lastCall[0].favorites).toEqual(state.favorites);
});

test("a queued remove observes an earlier add", async () => {
  await Promise.all([
    addFavorite("1.2.3.4", 2302, null, "A"),
    removeFavorite("1.2.3.4", 2302),
  ]);
  expect(state.favorites).toEqual([]);
  expect(state.favoritesSet.size).toBe(0);
  expect(window.api.settings.saveFavorites.mock.lastCall[0]).toEqual({ favorites: [] });
});

test("a failed save leaves state intact and the next operation still succeeds", async () => {
  window.api.settings.saveFavorites.mockResolvedValueOnce(false);
  const failed = addFavorite("1.2.3.4", 2302, null, "A");
  const next = addFavorite("2.3.4.5", 2302, null, "B");
  await expect(failed).rejects.toThrow("Failed to persist favorites");
  await next;
  expect(state.favorites.map(f => f.name)).toEqual(["B"]);
  expect([...state.favoritesSet]).toEqual(["2.3.4.5:2302"]);
});
