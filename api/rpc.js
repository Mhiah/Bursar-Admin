// Vercel function: passes read-only Arc RPC calls from the admin page to Arc, behind the admin password.
// Settings on Vercel: ADMIN_PASSWORD (required), ARC_RPC_URL (default https://rpc.mainnet.arc.io).
import { timingSafeEqual } from "node:crypto";

// The password is switched off for now. To bring it back, set this to true here and PASSWORD_ON to true in index.html.
const PASSWORD_ON = false;
const RPC = process.env.ARC_RPC_URL || "https://rpc.mainnet.arc.io";
const READ_ONLY = new Set(["eth_blockNumber", "eth_getLogs", "eth_getBlockByNumber"]);

function passwordOk(given) {
  const want = process.env.ADMIN_PASSWORD || "";
  if (!want || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (PASSWORD_ON) {
    if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: "ADMIN_PASSWORD isn't set on Vercel yet." });
    if (!passwordOk(req.headers["x-admin-password"])) return res.status(401).json({ error: "Wrong password." });
  }
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  if (!body || !READ_ONLY.has(body.method)) return res.status(400).json({ error: "Not allowed." });
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: body.method, params: body.params ?? [] }),
  });
  res.setHeader("cache-control", "no-store");
  res.status(r.status).send(await r.text());
}
