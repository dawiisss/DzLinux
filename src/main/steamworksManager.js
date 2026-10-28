const { fork } = require("node:child_process");
const path = require("node:path");

let worker = null;
let msgIdCounter = 0;
const pendingRequests = new Map();
const shutdownPromises = new WeakMap();
let cachedProfileName = null;

let isLockedForLaunch = false;

function rejectWorkerRequests(targetWorker, reason = "Steamworks worker exited") {
  for (const [id, entry] of pendingRequests.entries()) {
    if (entry.worker === targetWorker) {
      pendingRequests.delete(id);
      entry.reject(new Error(reason));
    }
  }
}

function lockForLaunch() {
  isLockedForLaunch = true;
  return shutdown();
}

function unlockForLaunch() {
  isLockedForLaunch = false;
}

const STEAMWORKS_LAUNCH_LOCK_MS = 1500;

async function lockAndDelayForLaunch() {
  await lockForLaunch();
  await new Promise((r) => setTimeout(r, STEAMWORKS_LAUNCH_LOCK_MS));
}

function init() {
  if (isLockedForLaunch) return false;
  if (worker) return true;
  try {
    const child = fork(path.join(__dirname, "steamworksWorker.js"));
    worker = child;
    child.on("message", (msg) => {
      if (!msg || typeof msg !== "object") return;
      const { id, error, result } = msg;
      const entry = pendingRequests.get(id);
      if (entry && entry.worker === child) {
        pendingRequests.delete(id);
        if (error) entry.reject(new Error(error));
        else entry.resolve(result);
      }
    });
    child.on("exit", () => {
      if (worker === child) {
        worker = null;
      }
      rejectWorkerRequests(child, "Steamworks worker exited");
    });
    return true;
  } catch (e) {
    console.error("Failed to spawn steamworks worker", e);
    return false;
  }
}

function shutdown() {
  if (!worker) {
    return Promise.resolve();
  }
  const targetWorker = worker;
  if (shutdownPromises.has(targetWorker)) {
    return shutdownPromises.get(targetWorker);
  }
  const promise = new Promise((resolve) => {
    let settled = false;
    let forceKill = null;

    const finalize = () => {
      if (settled) return;
      settled = true;
      if (forceKill !== null) {
        clearTimeout(forceKill);
        forceKill = null;
      }
      if (typeof targetWorker.removeListener === "function") {
        targetWorker.removeListener("exit", onExit);
      } else if (typeof targetWorker.off === "function") {
        targetWorker.off("exit", onExit);
      }
      if (worker === targetWorker) {
        worker = null;
      }
      rejectWorkerRequests(targetWorker, "Steamworks worker exited");
      shutdownPromises.delete(targetWorker);
      resolve();
    };

    const onExit = () => {
      finalize();
    };

    forceKill = setTimeout(() => {
      forceKill = null;
      try {
        targetWorker.kill("SIGKILL");
      } catch {}
      finalize();
    }, 2000);

    targetWorker.once("exit", onExit);
    try {
      targetWorker.kill("SIGTERM");
    } catch {
      finalize();
    }
  });
  shutdownPromises.set(targetWorker, promise);
  return promise;
}

const REQUEST_TIMEOUT = 30000; // 30 seconds

async function sendRequest(type, payload) {
  if (!init() || !worker) throw new Error("Worker not initialized");
  const activeWorker = worker;
  return new Promise((resolve, reject) => {
    const id = msgIdCounter++;
    const timeout = setTimeout(() => {
      const current = pendingRequests.get(id);
      if (current && current.worker === activeWorker) {
        pendingRequests.delete(id);
      }
      reject(new Error(`Request ${type} timed out after ${REQUEST_TIMEOUT}ms`));
    }, REQUEST_TIMEOUT);
    pendingRequests.set(id, {
      worker: activeWorker,
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });
    activeWorker.send({ id, type, payload });
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
    console.error(`Failed to unsubscribe from mod ${modId}:`, e);
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
