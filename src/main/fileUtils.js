const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const writeQueues = new Map();

/**
 * Writes JSON without exposing a partially-written final file if the process
 * exits while the serialization or filesystem operation is in progress.
 */
function writeJsonAtomically(filePath, value, options = {}) {
  // Snapshot at invocation time, before any caller can mutate the value.
  let json;
  try {
    json = JSON.stringify(value, null, 2);
  } catch (error) {
    return Promise.reject(error);
  }
  const target = path.resolve(filePath);
  const previous = writeQueues.get(target) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => writeJsonFile(target, json, options));
  writeQueues.set(target, next);
  const cleanup = () => {
    if (writeQueues.get(target) === next) writeQueues.delete(target);
  };
  next.then(cleanup, cleanup);
  return next;
}

async function writeJsonFile(filePath, json, { mode = 0o644 } = {}) {
  const directory = path.dirname(filePath);
  const tempPath = `${filePath}.${randomUUID()}.tmp`;

  try {
    await fs.promises.mkdir(directory, { recursive: true });
    const handle = await fs.promises.open(tempPath, "wx", mode);
    try {
      await handle.writeFile(json, "utf8");
      // Flush before the rename so a crash or power loss cannot leave the
      // final file pointing at data that never reached the disk.
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.promises.rename(tempPath, filePath);
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  await syncDirectory(directory);
}

// Persists the rename itself. Best effort: some filesystems reject fsync on
// directories, and the data file is already durable at this point.
async function syncDirectory(directory) {
  let handle;
  try {
    handle = await fs.promises.open(directory, "r");
    await handle.sync();
  } catch {
    // ignore
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function existsAsync(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

module.exports = { writeJsonAtomically, existsAsync };
