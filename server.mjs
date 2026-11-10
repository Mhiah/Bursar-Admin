// Bursar Admin: a small private website that counts the vaults made from the Bursar vault factory on Arc.
// No dependencies. Run: node server.mjs   (Railway: deploy this repo; it starts with `npm start`)
//
// Settings (environment variables):
//   STATS_PASSWORD       required: the password for the page (the user name can be anything)
//   ARC_RPC_URL          default https://rpc.mainnet.arc.io
//   FACTORY_ADDRESS      default the current mainnet BursarFactory
//   FACTORY_START_BLOCK  optional: the block the factory was deployed in (found by itself if not set)
//   EXPLORER_URL         default https://explorer.arc.io
//   STATS_DATA_DIR       where the found vaults are kept between restarts (default ./data; use a volume)
//   PORT                 default 8080
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";

const RPC = process.env.ARC_RPC_URL || "https://rpc.mainnet.arc.io";
const FACTORY = (process.env.FACTORY_ADDRESS || "0x1d872C07C1935fe5E3a28a9df0690C2caf7B5709").toLowerCase();
const EXPLORER = (process.env.EXPLORER_URL || "https://explorer.arc.io").replace(/\/$/, "");
const PASSWORD = process.env.STATS_PASSWORD || "";
const PORT = Number(process.env.PORT || 8080);
const DATA = process.env.STATS_DATA_DIR || join(process.cwd(), "data");
const FILE = join(DATA, `vaults-${FACTORY}.json`);
// keccak256("VaultCreated(address,address,address)")
const VAULT_CREATED = "0x897c133dfbfe1f6239e98b4ffd7e4f6c86a62350a131a7a37790419f58af02f9";
const CHUNK = 10_000;

if (!PASSWORD) console.warn("STATS_PASSWORD is not set: the page will refuse every visitor until it is.");

// ------------------------------------------------------------------ chain reading
let rpcId = 0;
async function rpc(method, params) {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) });
  const out = await res.json();
  if (out.error) throw new Error(`${method}: ${out.error.message}`);
  return out.result;
}
const hex = (n) => "0x" + n.toString(16);
const addr = (topic) => "0x" + topic.slice(26);

async function factoryStart(latest) {
  if (process.env.FACTORY_START_BLOCK) return Number(process.env.FACTORY_START_BLOCK);
  let lo = 0;
  let hi = latest;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const code = await rpc("eth_getCode", [FACTORY, hex(mid)]);
    if (code && code !== "0x") hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

// state: { scanned: last block read, vaults: [{ vault, owner, block, time }] }
let state = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : { scanned: null, vaults: [] };
let status = { caughtUp: false, error: null, checkedAt: null };
const save = () => {
  mkdirSync(DATA, { recursive: true });
  writeFileSync(FILE, JSON.stringify(state));
};

let scanning = false;
async function scan() {
  if (scanning) return;
  scanning = true;
  try {
    const latest = Number(await rpc("eth_blockNumber", []));
    let from = state.scanned == null ? await factoryStart(latest) : state.scanned + 1;
    while (from <= latest) {
      const to = Math.min(from + CHUNK - 1, latest);
      const logs = await rpc("eth_getLogs", [{ address: FACTORY, topics: [VAULT_CREATED], fromBlock: hex(from), toBlock: hex(to) }]);
      for (const l of logs) {
        const vault = addr(l.topics[2]);
        if (state.vaults.some((v) => v.vault === vault)) continue;
        const block = await rpc("eth_getBlockByNumber", [l.blockNumber, false]);
        state.vaults.push({ vault, owner: addr(l.topics[1]), block: Number(l.blockNumber), time: Number(block.timestamp) * 1000 });
      }
      state.scanned = to;
      from = to + 1;
      save();
    }
    status = { caughtUp: true, error: null, checkedAt: Date.now() };
  } catch (e) {
    status = { ...status, error: e.message, checkedAt: Date.now() };
    console.error("Scan failed:", e.message);
  } finally {
    scanning = false;
  }
}
scan();
setInterval(scan, 5 * 60_000);

// ------------------------------------------------------------------ the page
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const DAY = 86_400_000;
const mondayOf = (t) => {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.getTime();
};
const fmt = (t, o) => new Date(t).toLocaleDateString("en-GB", { timeZone: "UTC", ...o });

function page() {
  const vaults = [...state.vaults].sort((a, b) => b.time - a.time);
  const now = Date.now();
  const owners = new Set(vaults.map((v) => v.owner)).size;
  const thisWeek = vaults.filter((v) => v.time >= mondayOf(now)).length;
  const last30 = vaults.filter((v) => v.time >= now - 30 * DAY).length;
  const first = mondayOf(now) - 11 * 7 * DAY;
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const start = first + i * 7 * DAY;
    return { start, n: vaults.filter((v) => v.time >= start && v.time < start + 7 * DAY).length };
  });
  const top = Math.max(1, ...weeks.map((w) => w.n));
  const tiles = [["Vaults made", vaults.length], ["Different owners", owners], ["Made this week", thisWeek], ["Last 30 days", last30]];
  const note = !status.caughtUp
    ? status.error
      ? `<p class="note bad">Couldn't read Arc: ${esc(status.error)}. It tries again every 5 minutes.</p>`
      : `<p class="note">Reading Arc for vaults made so far. Refresh in a minute.</p>`
    : status.error
      ? `<p class="note bad">Last update failed: ${esc(status.error)}. Showing what was found before.</p>`
      : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bursar Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
<style>
:root{--blue:#0066FF;--navy:#0A1128;--soft:#EAF6FF;--line:#D9E4F0;--bad:#C62828}
*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--navy);font-family:Inter,system-ui,sans-serif}
main{max-width:1000px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:40px;font-weight:800;margin:0}h2{font-size:20px;font-weight:800;margin:0 0 16px}
.sub{margin:8px 0 28px}.note{background:var(--soft);border-radius:10px;padding:12px 14px}.note.bad{color:var(--bad)}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px}
.card{border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:24px}.tiles .card{margin:0}
.label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:0}.num{font-size:34px;font-weight:800;margin:6px 0 0}
.chart{display:flex;align-items:flex-end;gap:6px;height:170px}
.bar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:4px;font-size:11px}
.bar i{display:block;width:100%;background:var(--blue);border-radius:4px 4px 0 0}
.wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;font-size:12px;letter-spacing:.08em;text-transform:uppercase;padding:8px 10px;border-bottom:1px solid var(--line)}
td{padding:10px;border-bottom:1px solid var(--line);white-space:nowrap}a{color:var(--blue);text-decoration:none}
.foot{font-size:12px}
@media(max-width:640px){.tiles{grid-template-columns:repeat(2,1fr)}h1{font-size:32px}.bar span.d{writing-mode:vertical-rl;transform:rotate(180deg)}}
</style></head><body><main>
<h1>Bursar Admin</h1>
<p class="sub">Everyone using Bursar, counted by the vaults made from the vault factory on Arc.</p>
${note}
<div class="tiles">${tiles.map(([l, n]) => `<div class="card"><p class="label">${l}</p><p class="num">${n}</p></div>`).join("")}</div>
<div class="card"><h2>Vaults made each week</h2><div class="chart">${weeks
    .map((w) => `<div class="bar"><span>${w.n || ""}</span><i style="height:${(w.n / top) * 100}%"></i><span class="d">${fmt(w.start, { day: "numeric", month: "short" })}</span></div>`)
    .join("")}</div></div>
<div class="card"><h2>Every vault</h2><div class="wrap"><table><thead><tr><th>Made</th><th>Owner</th><th>Vault</th></tr></thead><tbody>${
    vaults.length
      ? vaults
          .map((v) => `<tr><td>${fmt(v.time, { day: "numeric", month: "short", year: "numeric" })}</td><td><a href="${EXPLORER}/address/${v.owner}" target="_blank" rel="noopener">${short(v.owner)}</a></td><td><a href="${EXPLORER}/address/${v.vault}" target="_blank" rel="noopener">${short(v.vault)}</a></td></tr>`)
          .join("")
      : `<tr><td colspan="3">No vaults found yet.</td></tr>`
  }</tbody></table></div></div>
<p class="foot">Factory <a href="${EXPLORER}/address/${FACTORY}" target="_blank" rel="noopener">${short(FACTORY)}</a> · read up to block ${state.scanned ?? "…"}${status.checkedAt ? ` · checked ${new Date(status.checkedAt).toUTCString()}` : ""} · updates every 5 minutes</p>
</main></body></html>`;
}

// ------------------------------------------------------------------ server, behind a password
function allowed(req) {
  if (!PASSWORD) return false;
  const m = /^Basic (.+)$/.exec(req.headers.authorization || "");
  if (!m) return false;
  const pass = Buffer.from(m[1], "base64").toString().split(":").slice(1).join(":");
  const a = Buffer.from(pass);
  const b = Buffer.from(PASSWORD);
  return a.length === b.length && timingSafeEqual(a, b);
}

createServer((req, res) => {
  if (req.url === "/health") return res.end("ok");
  if (!allowed(req)) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Bursar Admin"', "content-type": "text/plain" });
    return res.end("Password needed.");
  }
  if (req.url === "/vaults.json") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify({ ...status, scanned: state.scanned, vaults: state.vaults }));
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" });
  res.end(page());
}).listen(PORT, () => console.log(`Bursar Admin on port ${PORT}`));
