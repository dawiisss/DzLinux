const { randomUUID } = require("node:crypto");
const { EventEmitter } = require("node:events");
const repository = require("./watchlist");
const { sanitizeConfig, eligible, conditionMatch, evaluate, describeCondition } = require("./watchlistModel");
const { WatchlistAutoJoin } = require("./watchlistAutoJoin");
const { createQueryLimiter } = require("./queryLimiter");

function createMonitor({ repo = repository, query = (ip, port, queryPort, signal) => require("./serverQuery").pingServer(ip, port, queryPort, signal, true), now = Date.now } = {}) {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const events = new EventEmitter();
  const observations = new Map();
  const runtimes = new Map();
  const requests = new Map();
  const auto = new WatchlistAutoJoin(now);
  const querySlots = createQueryLimiter(4);
  let settings = {};
  let entries = [];
  let timer = null;
  let cycle = null;
  let cycleManual = false;
  let manualCycle = null;
  let queuedCycle = null;
  let generation = 0;
  let monitoringSession = 0;
  let revision = 0;
  let stopped = false;
  let sleeping = false;
  let error = null;
  let lastCheckedAt = null;
  let nextCheckAt = null;
  let rotation = 0;
  const interval = () => Math.min(600, Math.max(5, Number(settings.watchlistRefreshTime) || 10)) * 1000;
  const enabled = () => !stopped && !sleeping && settings.enableWatchlist !== false && settings.showWatchlistTab !== false;
  const polling = () => enabled() && settings.watchlistRefreshEnabled !== false;
  const snapshot = () => {
    auto.expire();
    return clone({ revision, entries: entries.map((entry) => ({ ...entry, observation: observations.get(entry.id) || null, runtime: runtimes.get(entry.id) || {} })),
      enabled: enabled(), polling: polling(), intervalMs: interval(), refreshing: Boolean(cycle), lastCheckedAt, nextCheckAt, error,
      autoJoin: { suspended: auto.suspended, offer: auto.offer, busy: Boolean(auto.connection) } });
  };
  const publish = () => { revision++; events.emit("changed", snapshot()); };
  async function load() {
    try { entries = (await repo.loadDocument()).entries; error = null; }
    catch (failure) { error = failure.message; throw failure; }
  }
  function cancelConnection() {
    if (auto.connection) events.emit("connection-cancelled", { id: auto.connection.id, owner: auto.connection.owner });
    auto.connection = null;
  }
  function invalidate(id = null) {
    if (id === null) generation++;
    for (const [key, request] of requests) if (id === null || key === id) request.controller.abort();
    if (id === null || auto.offer?.watchId === id) auto.offer = null;
    if (auto.connection?.automatic && (id === null || auto.connection.watchId === id)) cancelConnection();
    if (id === null) { monitoringSession++; runtimes.clear(); }
    else runtimes.delete(id);
  }
  function schedule() {
    clearTimeout(timer);
    nextCheckAt = null;
    if (!enabled()) return;
    const expiry = entries.filter((e) => e.enabled && e.snoozedUntil > now()).map((e) => e.snoozedUntil);
    // Snooze expiry still needs a fresh check when routine polling is disabled.
    const delays = [...(polling() ? [interval()] : []), ...expiry.map((time) => Math.max(1, time - now()))];
    if (!delays.length) return;
    nextCheckAt = now() + Math.min(...delays);
    timer = setTimeout(() => { void refresh(false).catch(report); }, Math.min(2147483647, ...delays));
  }
  const report = (failure) => { error = failure.message; console.error("Watchlist:", failure); publish(); };
  async function observe(entry, epoch, finalCheck = false) {
    if (requests.has(entry.id)) return requests.get(entry.id).promise;
    const controller = new AbortController();
    const attemptedAt = now();
    const old = observations.get(entry.id) || {};
    observations.set(entry.id, { ...old, checking: true, attemptedAt });
    const request = { controller, promise: null, finalCheck };
    request.promise = (async () => {
      let timedOut = false;
      let deadline;
      try {
        const result = await querySlots.run(() => Promise.race([
          Promise.resolve().then(() => query(entry.ip, entry.port, entry.queryPort, controller.signal)),
          new Promise((resolve) => { deadline = setTimeout(() => { timedOut = true; controller.abort(); resolve(null); }, 8000); }),
          new Promise((resolve) => controller.signal.addEventListener("abort", () => resolve(null), { once: true })),
        ]), controller.signal).catch(() => null);
        const current = entries.find((item) => item.id === entry.id);
        if ((!finalCheck && epoch !== generation) || !current || current.configRevision !== entry.configRevision || (controller.signal.aborted && !timedOut)) return null;
        const online = result?.status === "online";
        const observation = {
          status: online ? "online" : "unreachable", checking: false, attemptedAt, completedAt: now(),
          lastSuccessAt: online ? now() : old.lastSuccessAt ?? null,
          players: online ? result.reportedPlayers ?? null : null,
          capacity: online ? result.reportedCapacity ?? null : null,
          ping: online && Number.isFinite(result.ping) && result.ping >= 0 ? result.ping : null,
          lastKnownPlayers: online ? result.reportedPlayers ?? null : old.lastKnownPlayers ?? old.players ?? null,
          lastKnownCapacity: online ? result.reportedCapacity ?? null : old.lastKnownCapacity ?? old.capacity ?? null,
          queryPort: result?.queryPort ?? entry.queryPort, map: result?.map || "", name: result?.name || entry.name,
        };
        observations.set(entry.id, observation);
        return observation;
      } finally {
        clearTimeout(deadline);
        if (requests.get(entry.id) === request) requests.delete(entry.id);
        const observation = observations.get(entry.id);
        if (observation?.attemptedAt === attemptedAt) observation.checking = false;
      }
    })();
    requests.set(entry.id, request);
    return request.promise;
  }
  async function processResult(entry, observation, epoch) {
    if (!observation || epoch !== generation) return null;
    const current = entries.find((item) => item.id === entry.id);
    if (!current || current.configRevision !== entry.configRevision || !eligible(current, now())) return null;
    const transition = evaluate(current, observation, runtimes.get(entry.id), now(), interval(), monitoringSession);
    const patch = transition.patch;
    if (observation.queryPort && observation.queryPort !== current.queryPort) patch.queryPort = observation.queryPort;
    const changed = Object.keys(patch).some((key) => patch[key] !== current[key]);
    let committed = current;
    const eventId = transition.alert ? randomUUID() : null;
    if (changed || transition.alert) {
      committed = await repo.update(entry.id, (latest) => {
        if (epoch !== generation || latest.configRevision !== entry.configRevision || !eligible(latest, now())) throw new Error("Watch changed during check");
        Object.assign(latest, patch);
        if (eventId) latest.lastEventId = eventId;
      });
      await load();
    }
    if (epoch !== generation || !entries.some((e) => e.id === entry.id && e.configRevision === committed.configRevision)) return null;
    runtimes.set(entry.id, transition.runtime);
    if (!transition.alert) return null;
    return { eventId, watchId: entry.id, configRevision: committed.configRevision, autoJoin: committed.autoJoin, priority: committed.priority,
      condition: describeCondition(committed.condition), server: { ip: committed.ip, port: committed.port, queryPort: observation.queryPort, name: observation.name, map: observation.map } };
  }
  async function run(manual) {
    await load();
    if (!enabled()) return { checked: 0, unreachable: 0 };
    const epoch = generation;
    const ordered = entries.filter((entry) => manual || eligible(entry, now()))
      .sort((a, b) => Number(b.autoJoin) - Number(a.autoJoin) || a.priority - b.priority || a.id.localeCompare(b.id));
    const groups = new Map();
    for (const entry of ordered) {
      const key = `${entry.autoJoin}:${entry.priority}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }
    const targets = [...groups.values()].flatMap((group) => {
      const offset = rotation % group.length;
      return [...group.slice(offset), ...group.slice(0, offset)];
    });
    rotation++;
    let checked = 0;
    let unreachable = 0;
    for (let index = 0; index < targets.length && epoch === generation; index += 4) {
      const wave = targets.slice(index, index + 4);
      const results = await Promise.all(wave.map(async (entry) => ({ entry, observation: await observe(entry, epoch) })));
      const alerts = [];
      for (const { entry, observation } of results) {
        if (!observation) continue;
        checked++;
        if (observation.status === "unreachable") unreachable++;
        try { const alert = await processResult(entry, observation, epoch); if (alert) alerts.push(alert); }
        catch (failure) { if (epoch === generation) { error = failure.message; console.error("Watchlist update:", failure); } }
      }
      if (epoch !== generation) break;
      const offer = auto.select(alerts);
      publish();
      for (const alert of alerts) events.emit("alert", alert);
      if (offer) events.emit("offer", clone(offer));
    }
    if (epoch === generation) lastCheckedAt = now();
    return { checked, unreachable };
  }
  function refresh(manual = true) {
    if (cycle) {
      if (!manual || cycleManual) return cycle;
      if (!manualCycle) manualCycle = cycle.catch(() => {}).then(() => refresh(true)).finally(() => { manualCycle = null; });
      return manualCycle;
    }
    // Compare with the scheduled start, not an entry's position in the previous
    // cycle. Slow waves are normal; missed schedules/manual gaps break continuity.
    const expectedStart = polling() && nextCheckAt !== null ? nextCheckAt : lastCheckedAt;
    if (expectedStart !== null && now() - expectedStart > Math.max(60000, 3 * interval())) {
      monitoringSession++;
      runtimes.clear();
    }
    clearTimeout(timer);
    nextCheckAt = null;
    cycleManual = manual;
    cycle = run(manual).finally(() => { cycle = null; schedule(); publish(); });
    publish();
    return cycle;
  }
  function requestFreshCycle() {
    if (!cycle) return refresh(false);
    if (!queuedCycle) queuedCycle = cycle.catch(() => {}).then(() => refresh(false)).finally(() => { queuedCycle = null; });
    return queuedCycle;
  }
  async function command(action, args) {
    if (!Array.isArray(args)) throw new Error("Invalid watch command");
    const [id, value, expectedRevision] = args;
    if (action !== "add" && (typeof id !== "string" || id.length > 100)) throw new Error("Invalid watch ID");
    if (action === "add") await repo.add(id);
    else if (action === "remove") { invalidate(id); await repo.remove(id); observations.delete(id); }
    else if (action === "update") {
      const config = sanitizeConfig(value, true);
      // Server identity is immutable; edits cannot silently repoint a watch.
      if (["ip", "port"].some((key) => key in config)) throw new Error("Watch address cannot be edited");
      invalidate(id);
      await repo.update(id, (entry) => {
        if (entry.configRevision !== expectedRevision) throw new Error("This watch changed. Reopen it to edit the latest version.");
        if (config.condition && JSON.stringify(config.condition) !== JSON.stringify(entry.condition)) {
          entry.episodeLatched = false; entry.pendingEpisode = false;
        }
        Object.assign(entry, config);
        entry.configRevision++;
      });
    } else {
      if (!["setEnabled", "snooze", "wake", "rearm"].includes(action)) throw new Error("Unknown watch command");
      if (action === "setEnabled" && typeof value !== "boolean") throw new Error("Invalid enabled setting");
      if (action === "snooze" && value !== 900) throw new Error("Invalid snooze duration");
      invalidate(id);
      await repo.update(id, (entry) => {
        entry.configRevision++;
        if (action === "setEnabled") { entry.enabled = value; entry.pausedReason = value ? null : "user"; entry.snoozedUntil = null; }
        if (action === "snooze") {
          if (!entry.enabled && entry.pausedReason === "user") throw new Error("Resume this watch before snoozing");
          if (entry.pausedReason === "alerted") Object.assign(entry, { enabled: true, pausedReason: null, episodeLatched: false, pendingEpisode: false, lastAlertAt: null });
          entry.snoozedUntil = now() + value * 1000;
        }
        if (action === "wake") entry.snoozedUntil = null;
        if (action === "rearm") {
          Object.assign(entry, { enabled: true, pausedReason: null, snoozedUntil: null, episodeLatched: false, pendingEpisode: false });
          if (entry.alertPolicy === "once") entry.lastAlertAt = null;
        }
      });
    }
    await load();
    // Restart the query batch so newly enabled/edited watches are checked now,
    // without discarding other watches' outage continuity or countdowns.
    generation++;
    for (const request of requests.values()) if (!request.finalCheck) request.controller.abort();
    publish();
    schedule();
    // Fresh data after enabling/configuring; a UI failure never reverts a saved edit.
    void requestFreshCycle().catch(report);
    return snapshot();
  }
  async function configure(nextSettings) {
    const keys = ["enableWatchlist", "showWatchlistTab", "watchlistRefreshEnabled", "watchlistRefreshTime"];
    if (keys.every((key) => settings[key] === nextSettings[key])) return;
    settings = { ...nextSettings };
    stopped = false;
    invalidate();
    await load();
    publish();
    if (polling()) void requestFreshCycle().catch(report);
    else schedule();
  }
  function validOffer(offer) {
    const entry = entries.find((item) => item.id === offer?.watchId);
    return entry && enabled() && offer.configRevision === entry.configRevision && entry.lastEventId === offer.eventId &&
      entry.autoJoin && (!entry.snoozedUntil || entry.snoozedUntil <= now()) && (entry.enabled || entry.pausedReason === "alerted");
  }
  async function confirmAutoJoin(offerId, owner) {
    const offer = auto.offer;
    if (!offer || offer.offerId !== offerId || offer.owner !== owner || offer.confirming || !validOffer(offer) || now() > offer.expiresAt || now() - offer.deadline > 15000) throw new Error("Auto-join expired or was changed");
    offer.confirming = true;
    const entry = entries.find((item) => item.id === offer.watchId);
    // The final probe must start after confirmation, not reuse an earlier poll.
    if (requests.has(entry.id)) await requests.get(entry.id).promise;
    const observation = await observe(entry, generation, true);
    if (auto.offer !== offer || !validOffer(offer) || now() > offer.expiresAt || !observation || conditionMatch(entry, observation, {}, true) !== true) {
      auto.cancel(offerId, owner); publish(); throw new Error("Server no longer meets the watch condition. Connection cancelled.");
    }
    const { connection } = auto.begin(owner, offerId);
    publish();
    return { connectionId: connection.id, server: { ...offer.server, queryPort: observation.queryPort }, watchId: entry.id };
  }
  return {
    events, snapshot, refresh, command, configure,
    async getSnapshot() { await load(); if (!timer && !cycle) schedule(); return snapshot(); },
    claimAutoJoin(eventId, owner) {
      if (!validOffer(auto.offer)) throw new Error("Auto-join is no longer available");
      const offer = auto.claim(eventId, owner); publish(); return offer;
    },
    cancelAutoJoin(id, owner) {
      const previous = auto.offer;
      auto.cancel(id, owner);
      if (previous && auto.offer !== previous && requests.get(previous.watchId)?.finalCheck) requests.get(previous.watchId).controller.abort();
      publish();
    },
    confirmAutoJoin,
    beginConnection(owner) {
      if (requests.get(auto.offer?.watchId)?.finalCheck) requests.get(auto.offer.watchId).controller.abort();
      const { connection, previous } = auto.begin(owner);
      if (previous) events.emit("connection-cancelled", { id: previous.id, owner: previous.owner });
      publish(); return connection.id;
    },
    finishConnection(id, owner, launched = false) { auto.finish(id, owner, launched); publish(); },
    assertConnection(id, owner) {
      if (auto.connection?.id !== id || auto.connection.owner !== owner) throw new Error("Connection was cancelled");
      if (auto.connection.automatic) {
        const entry = entries.find((e) => e.id === auto.connection.watchId);
        if (!enabled() || !entry || entry.configRevision !== auto.connection.configRevision) throw new Error("Watch changed; connection cancelled");
      }
    },
    resumeAutoJoin() { auto.suspended = false; publish(); },
    releaseOwner(owner) {
      if (auto.offer?.owner === owner) auto.offer = null;
      if (auto.connection?.owner === owner) cancelConnection();
      publish();
    },
    async notificationClick(event, sender) {
      await load();
      if (sender.isDestroyed()) return;
      sender.send("watchlist:open", { watchId: event.watchId, eventId: event.eventId });
      if (enabled()) void refresh(true).catch(report);
    },
    sleep() { sleeping = true; invalidate(); clearTimeout(timer); nextCheckAt = null; publish(); },
    wake() { sleeping = false; invalidate(); if (polling()) void requestFreshCycle().catch(report); else schedule(); publish(); },
    async stop() { stopped = true; invalidate(); cancelConnection(); clearTimeout(timer); await cycle?.catch(() => {}); await repo.flush(); },
  };
}

const monitor = createMonitor();
module.exports = { monitor, createMonitor };
