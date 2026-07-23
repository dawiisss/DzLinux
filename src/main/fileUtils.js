const fs = require("node:fs");
const path = require("node:path");

/**
 * Writes JSON without exposing a partially-written final file if the process
 * exits while the serialization or filesystem operation is in progress.
 */
async function writeJsonAtomically(filePath, value) {
  const directory = path.dirname(filePath);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await fs.promises.mkdir(directory, { recursive: true });
    await fs.promises.writeFile(
      tempPath,
      JSON.stringify(value, null, 2),
      "utf8",
    );
    await fs.promises.rename(tempPath, filePath);
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

module.exports = { writeJsonAtomically };