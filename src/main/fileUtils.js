const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const writeQueues = new Map();

/**
 * Writes JSON without exposing a partially-written final file if the process
 * exits while the serialization or filesystem operation is in progress.
 */
function writeJsonAtomically(filePath, value) {
  // Snapshot at invocation time, before any caller can mutate the value.
  let json;
  try {
    json = JSON.stringify(value, null, 2);
  } catch (error) {
    return Promise.reject(error);
  }
  const target = path.resolve(filePath);
  const previous = writeQueues.get(target) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => writeJsonFile(target, json));
  writeQueues.set(target, next);
  const cleanup = () => {
    if (writeQueues.get(target) === next) writeQueues.delete(target);
  };
  next.then(cleanup, cleanup);
  return next;
}

async function writeJsonFile(filePath, json) {
  const directory = path.dirname(filePath);
  const tempPath = `${filePath}.${randomUUID()}.tmp`;

  try {
    await fs.promises.mkdir(directory, { recursive: true });
    await fs.promises.writeFile(
      tempPath,
      json,
      { encoding: "utf8", flag: "wx" },
    );
    await fs.promises.rename(tempPath, filePath);
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    throw error;
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
