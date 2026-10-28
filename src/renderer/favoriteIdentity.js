import { isValidIpOrHost, isValidPort } from "./utils.js";

export function canonicalHost(input) {
  const raw = typeof input === "string" ? input.trim().toLowerCase() : "";
  const host =
    raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
  if (!isValidIpOrHost(host)) throw new Error("Enter a valid IP address or hostname");
  return host.includes(":") ? new URL(`http://[${host}]/`).hostname.slice(1, -1) : host;
}
export function favoriteKey(ip, port) {
  try { return `${canonicalHost(ip)}:${Number(port)}`; }
  catch { return `${String(ip).toLowerCase()}:${Number(port)}`; }
}
export function formatAddress(ip, port) { return `${ip.includes(":") ? `[${ip}]` : ip}:${port}`; }
export function parseServerAddress(input, fallbackPort = "2302", queryPort = "") {
  const raw = input.trim();
  let host; let port;
  if (raw.startsWith("[")) {
    const match = /^\[([^\]]+)\](?::(\d+))?$/.exec(raw);
    if (!match) throw new Error("Use [IPv6 address]:port for an IPv6 server");
    host = match[1]; port = match[2] || fallbackPort;
  } else {
    const match = /^([^:\s]+)(?::(\d+))?$/.exec(raw);
    if (!match) throw new Error("Enter a host or IP:port. Put IPv6 addresses in brackets.");
    host = match[1]; port = match[2] || fallbackPort;
  }
  if (!/^[0-9]+$/.test(String(port)) || !isValidPort(port)) throw new Error("Game port must be from 1 to 65535");
  if (queryPort && (!/^[0-9]+$/.test(String(queryPort)) || !isValidPort(queryPort))) throw new Error("Query port must be from 1 to 65535");
  return { ip: canonicalHost(host), port: Number(port), queryPort: queryPort ? Number(queryPort) : null };
}
