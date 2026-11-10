# Bursar Admin

A small private website that counts every vault made on Bursar.

It reads the `VaultCreated` events of the Bursar vault factory on Arc mainnet
(`0x1d872C07C1935fe5E3a28a9df0690C2caf7B5709`, live since 14 Oct 2026) and shows vaults made,
different owners, vaults made this week and in the last 30 days, a weekly chart and every vault
with explorer links. It checks Arc again every 5 minutes while open.

- `index.html`: the page. It reads Arc in the browser and remembers what it found, so after the first visit it only reads new blocks.
- `api/rpc.js`: a Vercel function that passes read-only Arc calls to Arc, only with the right password.

## Put it on Vercel

1. Add New → Project → import this repo. No build settings needed.
2. In Settings → Environment Variables add `ADMIN_PASSWORD` (any password you choose), then redeploy.
3. Open the site and enter the password.

Optional: `ARC_RPC_URL` (default `https://rpc.mainnet.arc.io`).
