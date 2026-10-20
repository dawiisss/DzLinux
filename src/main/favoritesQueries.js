const { EventEmitter } = require("node:events");
const { randomUUID } = require("node:crypto");
const repository = require("./favorites");
const { address, key } = require("./favoritesModel");
const { createQueryLimiter } = require("./queryLimiter");

const events = new EventEmitter();
const limiter = createQueryLimiter(8);
const observations = new Map();
const batches = new Map();
const previews = new Map();
const tokens = new Map();
const inFlight = new Map();
let data = { dataRevision: 0, entries: [], groups: [] };
let revision = 0;
let publication = null;
let stopping = false;
const clone = (value) => JSON.parse(JSON.stringify(value));
const snapshot = () => clone({ ...data, revision, observations: Object.fromEntries(observations) });
const cancelled = (controller) => controller.cancelled || (controller.signal.aborted && !controller.timedOut);
const abort = (controller) => { controller.cancelled = true; controller.abort(); };
function publish() {
  if (stopping) return;
  revision++;
  // A refresh wave can finish several queries and metadata writes together.
  // Send one current snapshot rather than queueing a full table for each result.
  if (publication === null) publication = setTimeout(() => {
    publication = null;
    if (!stopping) events.emit("changed", snapshot());
  }, 50);
}
repository.events.on("changed", (next) => {
  data = next;
  const ids = new Set(next.entries.map((entry) => entry.id));
  for (const id of observations.keys()) if (!ids.has(id)) observations.delete(id);
  for (const [id, request] of inFlight) if (!ids.has(id)) abort(request.controller);
  publish();
});
async function getSnapshot() { const next = await repository.getSnapshot(); if (next.dataRevision >= data.dataRevision) data = next; return snapshot(); }
function requestId(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 100) throw new Error("Invalid Favorites request ID");
  return value;
}
async function query(identity, controller) {
  return limiter.run(async () => {
    let timeout;
    try {
      return await Promise.race([
        require("./serverQuery").pingServer(identity.ip, identity.port, identity.queryPort, controller.signal, true),
        new Promise((resolve) => { timeout = setTimeout(() => { controller.timedOut = true; controller.abort(); resolve(null); }, 8000); }),
        new Promise((resolve) => controller.signal.addEventListener("abort", () => resolve(null), { once: true })),
      ]).catch(() => null);
    } finally { clearTimeout(timeout); }
  }, controller.signal);
}
function pruneTokens() {
  for (const [token, record] of tokens) if (record.expiresAt < Date.now()) tokens.delete(token);
  while (tokens.size > 100) tokens.delete(tokens.keys().next().value);
}
async function preview(owner, input, id) {
  requestId(id); const identity = address(input); const requestKey = `${owner}:${id}`;
  if (previews.has(requestKey)) abort(previews.get(requestKey));
  if (previews.size >= 100) throw new Error("Too many active previews");
  const controller = new AbortController(); previews.set(requestKey, controller);
  try {
    const result = await query(identity, controller);
    if (previews.get(requestKey) !== controller || cancelled(controller)) return { status: "unreachable", cancelled: true };
    if (!result || result.status !== "online") return { status: "unreachable" };
    pruneTokens();
    const token = randomUUID(); const completedAt = Date.now();
    tokens.set(token, { owner, requestId: id, identity, result, expiresAt: completedAt + 120000 });
    return { status: "online", token, name: result.name || "", map: result.map || "", players: result.reportedPlayers ?? null,
      capacity: result.reportedCapacity ?? null, ping: result.ping ?? null, completedAt };
  } finally { if (previews.get(requestKey) === controller) previews.delete(requestKey); }
}
async function add(owner, input, token) {
  let verified = null;
  if (token != null) {
    pruneTokens(); const record = tokens.get(token);
    if (!record || record.owner !== owner || key(record.identity) !== key(address(input)) || record.identity.queryPort !== address(input).queryPort) throw new Error("Preview expired or address changed. Check the server again.");
    verified = record.result;
  }
  await repository.add(input, verified);
  if (token) tokens.delete(token);
  return snapshot();
}
async function observe(entry, owner) {
  let request = inFlight.get(entry.id);
  if (request) { request.owners.add(owner); return request.promise; }
  const controller = new AbortController(); const old = observations.get(entry.id); const attemptedAt = Date.now();
  observations.set(entry.id, { ...old, checking: true, attemptedAt });
  request = { controller, owners: new Set([owner]), promise: null };
  request.promise = (async () => {
    const result = await query(entry, controller);
    if (cancelled(controller)) return null;
    const current = (await repository.getSnapshot()).entries.find((item) => item.id === entry.id && key(item) === key(entry));
    if (!current || cancelled(controller)) return null;
    const online = result?.status === "online";
    const observation = { status: online ? "online" : "unreachable", checking: false, attemptedAt, completedAt: Date.now(),
      lastSuccessAt: online ? Date.now() : old?.lastSuccessAt ?? null,
      name: online ? result.name || entry.name : old?.name || entry.name, map: online ? result.map || entry.map : old?.map || entry.map, queryPort: online ? result.queryPort || entry.queryPort : entry.queryPort,
      players: online ? result.reportedPlayers ?? null : old?.players ?? null,
      capacity: online ? result.reportedCapacity ?? null : old?.capacity ?? null,
      ping: online && Number.isFinite(result.ping) && result.ping >= 0 ? result.ping : online ? null : old?.ping ?? null };
    observations.set(entry.id, observation);
    if (online && !cancelled(controller)) {
      try { await repository.learn(entry.id, entry, result, () => !cancelled(controller)); }
      catch (error) { observation.error = "Could not save server details: " + error.message; }
    }
    if (!cancelled(controller)) publish();
    return observation;
  })().finally(() => {
    if (inFlight.get(entry.id) === request) inFlight.delete(entry.id);
    const observation = observations.get(entry.id); if (observation) observation.checking = false;
  });
  inFlight.set(entry.id, request);
  return request.promise;
}
function refresh(owner, ids, id) {
  requestId(id);
  if (ids !== null && (!Array.isArray(ids) || ids.length > 1000 || ids.some((value) => typeof value !== "string"))) throw new Error("Invalid Favorites selection");
  if (batches.has(owner)) return batches.get(owner).promise;
  const batch = { id, cancelled: false, promise: null };
  batches.set(owner, batch);
  batch.promise = (async () => {
    const document = await repository.getSnapshot();
    if (document.dataRevision >= data.dataRevision) data = document;
    const targets = document.entries.filter((entry) => ids === null || ids.includes(entry.id));
    let checked = 0; let unreachable = 0; let next = 0;
    const progress = () => events.emit("progress", { owner, requestId: id, checked, unreachable, total: targets.length, cancelled: batch.cancelled });
    progress();
    await Promise.all(Array.from({ length: Math.min(8, targets.length) }, async () => {
      while (!batch.cancelled && next < targets.length) {
        const entry = targets[next++];
        if (!data.entries.some((item) => item.id === entry.id)) continue;
        const pending = observe(entry, owner); publish();
        const result = await pending;
        if (batch.cancelled) return;
        if (result) { checked++; if (result.status === "unreachable") unreachable++; }
        progress();
      }
    }));
    return { checked, unreachable, cancelled: batch.cancelled, total: targets.length };
  })().finally(() => { if (batches.get(owner) === batch) batches.delete(owner); publish(); });
  return batch.promise;
}

function cancel(owner, id = null) {
  if (id !== null) requestId(id);
  const batch = batches.get(owner);
  if (batch && (id === null || batch.id === id)) {
    batch.cancelled = true;
    for (const request of inFlight.values()) {
      request.owners.delete(owner);
      if (!request.owners.size) abort(request.controller);
    }
  }
  for (const [requestKey, controller] of previews) if (requestKey.startsWith(`${owner}:`) && (id === null || requestKey === `${owner}:${id}`)) {
    abort(controller); previews.delete(requestKey);
  }
  for (const [token, record] of tokens) if (record.owner === owner && (id === null || record.requestId === id)) tokens.delete(token);
  if (batch && (id === null || batch.id === id)) publish();
}
async function stopQueries() {
  stopping = true; clearTimeout(publication); publication = null;
  const pendingBatches = [...batches.values()].map((batch) => batch.promise);
  for (const owner of batches.keys()) cancel(owner);
  for (const controller of previews.values()) abort(controller);
  previews.clear(); tokens.clear();
  await Promise.allSettled(pendingBatches);
  await repository.flush();
}
module.exports = { events, getSnapshot, snapshot, preview, add, refresh, cancel, stop: stopQueries };
