const { isValidIpOrHost, isValidPort } = require("./validation");

const CONDITIONS = new Set(["free-slots", "population-at-least", "server-back-online", "legacy-player-at-most"]);
const CONFIG_FIELDS = new Set(["ip", "port", "queryPort", "name", "condition", "alertPolicy", "cooldownSeconds", "autoJoin", "priority"]);
const identity = (entry) => `${entry.ip.toLowerCase()}:${Number(entry.port)}`;
const validCount = (value) => Number.isInteger(value) && value >= 0 && value <= 10000;

function sanitizeConfig(input, partial = false) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => !CONFIG_FIELDS.has(key))) throw new Error("Invalid watch configuration");
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "ip") {
      if (!isValidIpOrHost(value)) throw new Error("Invalid server address");
      output.ip = value.toLowerCase();
    } else if (key === "port" || key === "queryPort") {
      if (key === "queryPort" && value === null) output[key] = null;
      else {
        if (!["string", "number"].includes(typeof value) || !isValidPort(value)) throw new Error("Invalid server port");
        output[key] = Number(value);
      }
    } else if (key === "name") {
      if (typeof value !== "string" || value.length > 200) throw new Error("Server name is too long");
      output.name = value;
    } else if (key === "condition") {
      if (!value || !CONDITIONS.has(value.type) || Object.keys(value).some((k) => !["type", "value"].includes(k)) ||
          (value.type !== "server-back-online" && (!validCount(value.value) || (value.type === "free-slots" && value.value < 1)))) throw new Error("Invalid watch condition");
      output.condition = value.type === "server-back-online" ? { type: value.type } : { type: value.type, value: value.value };
    } else if (key === "alertPolicy") {
      if (!["once", "repeat"].includes(value)) throw new Error("Invalid alert behavior");
      output[key] = value;
    } else if (key === "cooldownSeconds") {
      if (![60, 300, 900].includes(value)) throw new Error("Invalid alert cooldown");
      output[key] = value;
    } else if (key === "autoJoin") {
      if (typeof value !== "boolean") throw new Error("Invalid auto-join setting");
      output[key] = value;
    } else if (key === "priority") {
      if (!Number.isInteger(value) || value < 1 || value > 1000) throw new Error("Priority must be between 1 and 1000");
      output[key] = value;
    }
  }
  if (!partial && (!output.ip || !output.port || !output.condition)) throw new Error("Server and condition are required");
  return output;
}

function eligible(entry, now) {
  return entry.enabled && (!entry.snoozedUntil || entry.snoozedUntil <= now);
}

function conditionMatch(entry, observation, runtime = {}, finalCheck = false) {
  if (observation?.status !== "online") return null;
  const { type, value } = entry.condition;
  if (type === "server-back-online") return finalCheck || runtime.outageArmed === true;
  if (!validCount(observation.players)) return null;
  if (type === "population-at-least") return observation.players >= value;
  if (type === "legacy-player-at-most") return observation.players <= value;
  if (!validCount(observation.capacity) || observation.capacity < 1) return null;
  return Math.max(0, observation.capacity - observation.players) >= value;
}

// Pure transition: persist the returned state before delivering an alert.
function evaluate(entry, observation, previous = {}, now = Date.now(), intervalMs = 10000, monitoringSession = null) {
  const runtime = { ...previous };
  // The monitor tracks interruptions separately from the duration of a large
  // query cycle. Keep time-based behavior for callers without session context.
  const continuityLost = monitoringSession === null
    ? !runtime.completedAt || now - runtime.completedAt > Math.max(60000, 3 * intervalMs)
    : runtime.monitoringSession !== monitoringSession;
  if (continuityLost) {
    runtime.failures = 0;
    runtime.outageArmed = false;
  }
  runtime.completedAt = now;
  if (monitoringSession !== null) runtime.monitoringSession = monitoringSession;
  if (!eligible(entry, now) || observation.status === "cancelled") return { runtime, patch: {}, alert: false };
  const patch = continuityLost && entry.condition.type === "server-back-online" ? { pendingEpisode: false } : {};
  if (observation.status !== "online") {
    runtime.failures = (runtime.failures || 0) + 1;
    if (runtime.failures >= 2) runtime.outageArmed = true;
    return { runtime, patch, alert: false };
  }
  const match = conditionMatch(entry, observation, runtime);
  runtime.failures = 0;
  runtime.match = match;
  if (entry.condition.type === "server-back-online") {
    runtime.outageArmed = false;
    if (match) patch.pendingEpisode = true;
  } else if (match === false) {
    patch.episodeLatched = false;
    patch.pendingEpisode = false;
  } else if (match && !entry.episodeLatched) patch.pendingEpisode = true;
  const pending = patch.pendingEpisode ?? entry.pendingEpisode;
  const candidate = entry.condition.type === "server-back-online" ? pending : match && !entry.episodeLatched;
  const cooldownReady = !entry.lastAlertAt || now - entry.lastAlertAt >= entry.cooldownSeconds * 1000;
  const alert = Boolean(candidate && cooldownReady);
  if (alert) {
    Object.assign(patch, { episodeLatched: true, pendingEpisode: false, lastAlertAt: now });
    if (entry.alertPolicy === "once") Object.assign(patch, { enabled: false, pausedReason: "alerted" });
  }
  return { runtime, patch, alert };
}

function describeCondition(condition) {
  if (condition.type === "server-back-online") return "Server back online";
  if (condition.type === "free-slots") return `At least ${condition.value} free slot${condition.value === 1 ? "" : "s"}`;
  if (condition.type === "legacy-player-at-most") return `At most ${condition.value} players`;
  return `At least ${condition.value} players`;
}

module.exports = { identity, sanitizeConfig, eligible, conditionMatch, evaluate, describeCondition };
