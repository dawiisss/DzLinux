const { fork } = require("node:child_process");
const path = require("node:path");

let worker = null;
let msgIdCounter = 0;
const pendingRequests = new Map();
let cachedProfileName = null;

let isLockedForLaunch = false;

function lockForLaunch() {
  isLockedForLaunch = true;
  return shutdown();
}

function unlockForLaunch() {
  isLockedForLaunch = false;
}

const STEAMWORKS_LAUNCH_LOCK_MS = 1500;
const STEAMWORKS_LAUNCH_TIMEOUT_MS = 15000;

async function lockAndDelayForLaunch(onTimeout) {
  await lockForLaunch();
  await new Promise((r) => setTimeout(r, STEAMWORKS_LAUNCH_LOCK_MS));
  setTimeout(async () => {
    unlockForLaunch();
    if (typeof onTimeout === "function") {
      try {
        await onTimeout();
      } catch (err) {
        console.error("Error in lockAndDelayForLaunch timeout callback:", err);
      }
    }
  }, STEAMWORKS_LAUNCH_TIMEOUT_MS);
}

function init() {
  if (isLockedForLaunch) return false;
  if (worker) return true;
  try {
    worker = fork(path.join(__dirname, "steamworksWorker.js"));
    worker.on("message", (msg) => {
      const { id, error, result } = msg;
      if (pendingRequests.has(id)) {
        const { resolve, reject } = pendingRequests.get(id);
        pendingRequests.delete(id);
        if (error) reject(new Error(error));
        else resolve(result);
      }
    });
    worker.on("exit", () => {
      worker = null;
      // Reject any pending requests
      for (const { reject } of pendingRequests.values()) {
        reject(new Error("Steamworks worker exited"));
      }
      pendingRequests.clear();
    });
    return true;
  } catch (e) {
    console.error("Failed to spawn steamworks worker", e);
    return false;
  }
}

function shutdown() {
  return new Promise((resolve) => {
    if (worker) {
      const forceKill = setTimeout(() => {
        if (worker) {
          worker.kill("SIGKILL");
          worker = null;
          resolve();
        }
      }, 2000);
      worker.once("exit", () => {
        clearTimeout(forceKill);
        worker = null;
        resolve();
      });
      worker.kill("SIGTERM");
    } else {
      resolve();
    }
  });
}

const REQUEST_TIMEOUT = 30000; // 30 seconds

async function sendRequest(type, payload) {
  if (!init()) throw new Error("Worker not initialized");
  return new Promise((resolve, reject) => {
    const id = msgIdCounter++;
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Request ${type} timed out after ${REQUEST_TIMEOUT}ms`));
    }, REQUEST_TIMEOUT);
    pendingRequests.set(id, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });
    worker.send({ id, type, payload });
  });
}

async function getUserProfile() {
  if (cachedProfileName) return { name: cachedProfileName };
  try {
    const result = await sendRequest("getUserProfile");
    if (result && result.name) {
      cachedProfileName = result.name;
    }
    return result;
  } catch {
    return null;
  }
}

async function subscribeMod(modId) {
  try {
    return await sendRequest("subscribeMod", modId);
  } catch (e) {
    console.error(`Failed to subscribe to mod ${modId}:`, e);
    return false;
  }
}

async function unsubscribeMod(modId) {
  try {
    return await sendRequest("unsubscribeMod", modId);
  } catch (e) {
    console.error(`Failed to unsubscribe to mod ${modId}:`, e);
    return false;
  }
}

async function getDownloadProgress(modId) {
  try {
    return await sendRequest("getDownloadProgress", modId);
  } catch {
    return null;
  }
}

async function getModState(modId) {
  try {
    return await sendRequest("getModState", modId);
  } catch {
    return null;
  }
}

async function getSubscribedMods() {
  try {
    return await sendRequest("getSubscribedMods");
  } catch (e) {
    console.warn(
      "Steamworks unavailable, skipping subscription filter:",
      e.message,
    );
    return null;
  }
}

module.exports = {
  init,
  shutdown,
  lockForLaunch,
  unlockForLaunch,
  lockAndDelayForLaunch,
  getUserProfile,
  subscribeMod,
  unsubscribeMod,
  getDownloadProgress,
  getModState,
  getSubscribedMods,
};
