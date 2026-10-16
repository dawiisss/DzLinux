jest.mock("electron", () => ({ app: { getPath: () => "/tmp/dzlinux-sweep-model" } }), { virtual: true });
jest.mock("node:fs", () => ({ promises: { readFile: jest.fn().mockResolvedValue('{"entries":{}}') } }));
jest.mock("../../src/main/fileUtils", () => ({ writeJsonAtomically: jest.fn() }));
jest.mock("../../src/main/settings", () => ({ loadSettingsAsync: jest.fn().mockResolvedValue({ queryConcurrency: 150 }) }));
jest.mock("gamedig", () => ({ GameDig: { query: jest.fn() } }));

const { GameDig } = require("gamedig");
const { pingServer } = require("../../src/main/serverQuery");

test("15,000 offline known-port servers use bounded short attempts without fallback amplification", async () => {
  // Virtual network model: each attempt consumes its configured timeout.
  // Resolve one concurrent wave at a time, with no real network traffic or delay.
  const pending = [];
  let active = 0;
  let peak = 0;
  let elapsedMs = 0;
  GameDig.query.mockImplementation(options => {
    active++;
    peak = Math.max(peak, active);
    return new Promise((_, reject) => pending.push({ duration: options.attemptTimeout, reject }))
      .finally(() => { active--; });
  });
  let finished = false;
  const results = Promise.all(Array.from({ length: 15000 }, (_, index) =>
    pingServer(`server${index}.example.com`, 2302, 2303),
  )).then(values => { finished = true; return values; });

  while (!finished) {
    await new Promise(resolve => setImmediate(resolve));
    if (finished) break;
    const wave = pending.splice(0);
    expect(wave.length).toBeGreaterThan(0);
    elapsedMs += Math.max(...wave.map(attempt => attempt.duration));
    wave.forEach(attempt => attempt.reject(new Error("timeout")));
  }

  expect((await results).every(value => value === null)).toBe(true);
  expect(GameDig.query).toHaveBeenCalledTimes(15000);
  expect(peak).toBe(150);
  expect(elapsedMs).toBe(200000); // 100 waves × 2 seconds, versus 1,000 seconds at 10s.
});
