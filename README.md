# Bursar Admin

This is how I track traction on Bursar. It shows me how many businesses are using the main Bursar app, how many vaults have been made, how much money has moved through them, and how that grows week by week, so I can check progress.

It counts every vault made from the Bursar vault factory on Arc mainnet
(`0x1d872C07C1935fe5E3a28a9df0690C2caf7B5709`, live since 14 Oct 2026). Every business that uses Bursar
makes its vault there, so the count comes straight from the chain. It shows businesses, vaults made,
vaults made this week and in the last 30 days, a weekly chart and every vault with explorer links.
It also shows the total volume: all USDC paid into the vaults (money in), all USDC sent out of them
(money out), and the two added together, read from USDC transfers on Arc.
It updates each time I open it, and every 6 hours while it stays open.

- `index.html`: the page. It reads Arc in the browser and remembers what it found, so after the first visit it only reads new blocks.
- `api/rpc.js`: a Vercel function that passes read-only Arc calls to Arc, only with the right password.

## Put it on Vercel

1. Add New → Project → import this repo. No build settings needed.
2. In Settings → Environment Variables add `ADMIN_PASSWORD` (any password you choose), then redeploy.
3. Open the site and enter the password.

Optional: `ARC_RPC_URL` (default `https://rpc.mainnet.arc.io`).
