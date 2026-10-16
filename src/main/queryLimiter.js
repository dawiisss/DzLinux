// Keep slots until the actual UDP query settles, even if its caller cancels.
function createQueryLimiter(initialLimit = 150) {
  let limit = initialLimit;
  let active = 0;
  const waiting = new Set();

  function drain() {
    while (active < limit && waiting.size > 0) {
      const entry = waiting.values().next().value;
      waiting.delete(entry);
      entry.signal?.removeEventListener("abort", entry.cancel);
      if (entry.signal?.aborted) {
        entry.resolve(null);
        continue;
      }
      active++;
      Promise.resolve().then(() => entry.signal?.aborted ? null : entry.operation())
        .then(entry.resolve, entry.reject)
        .finally(() => {
          active--;
          drain();
        });
    }
  }

  return {
    setLimit(value) {
      if (Number.isInteger(value) && value > 0) limit = value;
      drain();
    },
    run(operation, signal) {
      if (signal?.aborted) return Promise.resolve(null);
      return new Promise((resolve, reject) => {
        const entry = { operation, signal, resolve, reject };
        entry.cancel = () => {
          waiting.delete(entry);
          resolve(null);
        };
        signal?.addEventListener("abort", entry.cancel, { once: true });
        waiting.add(entry);
        drain();
      });
    },
  };
}

module.exports = { createQueryLimiter };
