// Vercel function: passes read-only Arc RPC calls from the admin page to Arc, behind the admin password.
// Settings on Vercel: ADMIN_PASSWORD (required when the password is on), ARC_RPC_URL (optional, tried first).
// If one Arc server is down, slow or busy, the call moves on to the next one in the list.
import { timingSafeEqual } from "node:crypto";

// The password is switched off for now. To bring it back, set this to true here and PASSWORD_ON to true in index.html.
const PASSWORD_ON = false;
// Arc mainnet's public servers, from docs.arc.io (RPC endpoints) and dRPC.
const PUBLIC = [
  "https://rpc.mainnet.arc.io",
  "https://rpc.drpc.mainnet.arc.io",
  "https://rpc.blockdaemon.mainnet.arc.io",
  "https://rpc.quicknode.mainnet.arc.io",
  "https://arc.drpc.org",
];
const READ_ONLY = new Set(["eth_blockNumber", "eth_getLogs", "eth_getBlockByNumber"]);
const TIMEOUT = 8000;
const BUDGET = 40000;
export const config = { maxDuration: 60 };

function passwordOk(given) {
  const want = process.env.ADMIN_PASSWORD || "";
  if (!want || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function call(url, method, params) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const out = await r.json().catch(() => null);
  if (!r.ok || !out) throw new Error(`HTTP ${r.status}`);
  if (out.error) throw new Error(out.error.message || "Arc error");
  return out.result;
}

// Highest block each server has, remembered for a few seconds, so a server that is behind
// is never asked for blocks it doesn't have yet (it would answer "no vaults" and they'd be missed).
const heads = new Map();
async function hasBlock(url, block) {
  const h = heads.get(url);
  if (h && h.n >= block) return true;
  if (h && Date.now() - h.at < 3000) return false;
  const n = Number(await call(url, "eth_blockNumber", []));
  heads.set(url, { n, at: Date.now() });
  return n >= block;
}
const blockOf = (v) => (typeof v === "string" && v.startsWith("0x") ? Number(v) : null);

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (PASSWORD_ON) {
    if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: "ADMIN_PASSWORD isn't set on Vercel yet." });
    if (!passwordOk(req.headers["x-admin-password"])) return res.status(401).json({ error: "Wrong password." });
  }
  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; } catch { body = null; }
  if (!body || !READ_ONLY.has(body.method)) return res.status(400).json({ error: "Not allowed." });
  const params = body.params ?? [];
  const need =
    body.method === "eth_getLogs" ? blockOf(params[0]?.toBlock) :
    body.method === "eth_getBlockByNumber" ? blockOf(params[0]) : null;

  const started = Date.now();
  let last = "no Arc server answered";
  // Start from a different server each time so the load is shared and one busy server doesn't hold everything up.
  // A server set in ARC_RPC_URL is always asked first.
  const first = Math.floor(Math.random() * 2);
  const order = [...new Set([process.env.ARC_RPC_URL, ...PUBLIC.slice(first), ...PUBLIC.slice(0, first)].filter(Boolean))];
  for (const url of order) {
    if (Date.now() - started > BUDGET) break;
    try {
      if (need != null && !(await hasBlock(url, need))) { last = "Arc servers are still catching up"; continue; }
      const result = await call(url, body.method, params);
      if (body.method === "eth_blockNumber") heads.set(url, { n: Number(result), at: Date.now() });
      return res.status(200).json({ jsonrpc: "2.0", id: 1, result });
    } catch (e) {
      last = e.name === "TimeoutError" ? "Arc took too long to answer" : e.message;
    }
  }
  res.status(503).json({ error: `busy, ${last}` });
}
