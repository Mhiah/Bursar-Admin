# Bursar Admin

A small private website that counts every vault made on Bursar.

It reads the `VaultCreated` events of the Bursar vault factory on Arc mainnet
(`0x1d872C07C1935fe5E3a28a9df0690C2caf7B5709`) and shows vaults made, different owners,
vaults made this week and in the last 30 days, a weekly chart and every vault with explorer links.
It checks Arc again every 5 minutes. No dependencies: Node 20 or newer only.

## Run

```
STATS_PASSWORD=choose-one node server.mjs
```

Open http://localhost:8080 and enter the password (any user name).

## Settings

| Variable | Default |
| --- | --- |
| `STATS_PASSWORD` | required |
| `ARC_RPC_URL` | `https://rpc.mainnet.arc.io` |
| `FACTORY_ADDRESS` | the mainnet BursarFactory above |
| `FACTORY_START_BLOCK` | found by itself |
| `EXPLORER_URL` | `https://explorer.arc.io` |
| `STATS_DATA_DIR` | `./data` |
| `PORT` | `8080` |
