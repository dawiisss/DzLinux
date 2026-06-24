const steamworks = require("steamworks.js");
let client = null;

process.on("SIGTERM", () => {
  if (client) {
    try {
      client.localplayer.disconnect();
    } catch {}
  }
  process.exit(0);
});

function init() {
  if (client) return true;
  try {
    client = steamworks.init(221100);
    return true;
  } catch {
    return false;
  }
}

function safeBigInt(val) {
  try {
    return BigInt(val);
  } catch {
    return null;
  }
}

process.on("message", async (msg) => {
  const { id, type, payload } = msg;

  if (type === "init") {
    const success = init();
    process.send({
      id,
      result: success,
      error: success ? undefined : "Failed to init steamworks",
    });
    return;
  }

  if (!init()) {
    process.send({ id, error: "Failed to init steamworks" });
    return;
  }

  try {
    if (type === "getUserProfile") {
      const name = client.localplayer.getName();
      process.send({ id, result: { name } });
    } else if (type === "subscribeMod") {
      const bigId = safeBigInt(payload);
      if (!bigId) {
        process.send({ id, error: "Invalid mod ID" });
        return;
      }
      await client.workshop.subscribe(bigId);
      await client.workshop.download(bigId, true);
      process.send({ id, result: true });
    } else if (type === "unsubscribeMod") {
      const bigId = safeBigInt(payload);
      if (!bigId) {
        process.send({ id, error: "Invalid mod ID" });
        return;
      }
      await client.workshop.unsubscribe(bigId);
      process.send({ id, result: true });
    } else if (type === "getModState") {
      const bigId = safeBigInt(payload);
      if (!bigId) {
        process.send({ id, error: "Invalid mod ID" });
        return;
      }
      const state = client.workshop.state(bigId);
      process.send({ id, result: state });
    } else if (type === "getDownloadProgress") {
      const bigId = safeBigInt(payload);
      if (!bigId) {
        process.send({ id, result: null });
        return;
      }
      const info = client.workshop.downloadInfo(bigId);
      if (info && info.total > 0n) {
        process.send({
          id,
          result: {
            progress: Number(info.current) / Number(info.total),
            current: Number(info.current),
            total: Number(info.total),
          },
        });
      } else {
        process.send({ id, result: null });
      }
    } else if (type === "getSubscribedMods") {
      const MAX_SUBSCRIBED = 5000;
      const items = client.workshop.getSubscribedItems();
      if (items.length > MAX_SUBSCRIBED) {
        console.warn(
          `Subscribed mods list truncated: ${items.length} items found, capped at ${MAX_SUBSCRIBED}`,
        );
      }
      const result = items.slice(0, MAX_SUBSCRIBED).map((i) => i.toString());
      process.send({ id, result });
    } else {
      process.send({ id, error: `Unknown message type: ${type}` });
    }
  } catch (e) {
    process.send({ id, error: e.message });
  }
});
