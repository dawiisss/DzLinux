const ADMIN_MODS = [
  "cftools",
  "vppadmintools",
  "community-online-tools",
  "zomberry admin tools",
];

const KNOWN_COMMUNITIES = [
  "dayone",
  "karmakrew",
  "zero",
  "spaggie",
  "rearmed",
  "titan",
  "aftermath",
  "savior",
  "northmen",
  "sunnyvale",
  "the lab",
  "endzone",
  "blackout",
  "basically vanilla",
  "downbad",
  "struggle bus",
  "ground zero"
];

/**
 * Calculates a Trust Score for a DayZ server.
 * @param {Object} server The server object returned by A2S/serverQuery.
 * @returns {Object} { score: Number, level: String ('high', 'med', 'low'), reasons: Array<String> }
 */
export function calculateTrustScore(server) {
  let score = 0;
  const reasons = [];

  // 1. Password Protection (Highest Trust)
  if (server.password) {
    score += 50;
    reasons.push("Whitelisted / Password Protected");
  }

  // 2. Admin Tools Detection
  let hasAdminTools = false;
  if (server.mods && Array.isArray(server.mods)) {
    for (const mod of server.mods) {
      const modNameLower = typeof mod === "string" ? mod.toLowerCase() : (mod.name || "").toLowerCase();
      if (ADMIN_MODS.some((adminMod) => modNameLower.includes(adminMod))) {
        hasAdminTools = true;
        break;
      }
    }
  }

  if (hasAdminTools) {
    score += 40;
    reasons.push("Active Moderation Tools Detected");
  }

  // 3. Verified Community IP or Name Match
  const serverNameLower = (server.name || "").toLowerCase();
  
  if (server.verifiedCommunity) {
    score += 40;
    reasons.push(`Verified Community Server: ${server.verifiedCommunity}`);
  } else if (KNOWN_COMMUNITIES.some((community) => serverNameLower.includes(community))) {
    score += 30;
    reasons.push("Claimed Community Server");
  }

  // 4. High Population Heuristic (e.g. > 40 players on a 60+ cap server)
  const maxPlayers = parseInt(server.maxPlayers, 10) || 0;
  const currentPlayers = parseInt(server.players, 10) || 0;
  if (maxPlayers >= 60 && currentPlayers > 40) {
    score += 20;
    reasons.push("High Population Community");
  }

  // 5. General Modded Server (No admin tools detected, but has mods)
  if (!hasAdminTools && server.mods && server.mods.length > 0) {
    score += 10;
  }

  // Final tier calculation
  let level = "low";
  if (score >= 40) {
    level = "high";
  } else if (score >= 20) {
    level = "med";
  }

  // Official / Vanilla Fallback
  if (score === 0) {
    reasons.push("Unmoderated / Official Server");
  } else if (reasons.length === 0) {
    reasons.push("Modded Server");
  }

  return { score, level, reasons };
}
