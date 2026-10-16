const { createQueryLimiter } = require("../../src/main/queryLimiter");

test("cancelled callers keep active slots until their underlying queries settle", async () => {
  const limiter = createQueryLimiter(1);
  let finish;
  const controller = new AbortController();
  const active = limiter.run(() => new Promise(resolve => { finish = resolve; }), controller.signal);
  await Promise.resolve();
  controller.abort();
  const nextOperation = jest.fn().mockResolvedValue("next");
  const next = limiter.run(nextOperation);
  await Promise.resolve();
  expect(nextOperation).not.toHaveBeenCalled();
  finish("done");
  await active;
  expect(await next).toBe("next");
});

test("cancelled queued queries are removed and never execute", async () => {
  const limiter = createQueryLimiter(1);
  let finish;
  const active = limiter.run(() => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve();
  const controller = new AbortController();
  const staleOperation = jest.fn();
  const cancelled = limiter.run(staleOperation, controller.signal);
  controller.abort();
  expect(await cancelled).toBeNull();
  finish();
  await active;
  expect(staleOperation).not.toHaveBeenCalled();
});

test("all callers share the configured concurrency limit", async () => {
  const limiter = createQueryLimiter(3);
  let active = 0;
  let peak = 0;
  const queries = Array.from({ length: 25 }, () => limiter.run(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
  }));
  await Promise.all(queries);
  expect(peak).toBe(3);
});
