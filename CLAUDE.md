# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A minimal Node/Express HTTP bridge that sits between a trading bot (hosted on Netlify) and a local
IB Gateway / IBKR Client Portal API instance. The bridge is deployed to Railway (public, reachable
URL) and forwards requests to IB Gateway, which typically runs on the user's own machine and is
exposed via ngrok (or similar) since it's not otherwise reachable from the internet.

Everything lives in a single file, `server.js` — there is no build step, test suite, or framework
beyond Express.

## Commands

```bash
npm install     # install dependencies (express, cors)
npm start       # node server.js — runs the bridge
```

There is no lint, build, or test tooling configured in this repo.

Local run example, pointing at an IB Gateway reachable via ngrok:

```bash
IBKR_HOST=your-ngrok-subdomain.ngrok-free.app IBKR_PORT=443 PORT=3000 npm start
```

## Configuration (environment variables)

- `IBKR_HOST` — host/IP of IB Gateway (default: `localhost`). If it contains `ngrok`, `.app`, or
  `.dev`, the bridge treats it as remote/tunneled and switches to HTTPS on port 443 regardless of
  `IBKR_PORT`.
- `IBKR_PORT` — port of the local IB Gateway API (default: `4001`). Ignored when `IBKR_HOST` looks
  like an ngrok/tunnel host (see above).
- `PORT` — port the bridge itself listens on (default: `3000`; set automatically by Railway in
  production).
- `DCA_ENABLED` / `DCA_ACCOUNT_ID` / `DCA_ALLOCATIONS` / `DCA_SCHEDULE` — see DCA section below.
  Disabled by default; all four must be set correctly for scheduled buys to place real orders.

## Architecture

- `proxyRequest(path, method, body)` is the single chokepoint all routes go through. It:
  - Decides HTTP vs HTTPS and the target port based on whether `IBKR_HOST` looks like a tunnel
    (ngrok/`.app`/`.dev`) or a plain local host — see Configuration above.
  - Prefixes every request path with `/v1/api` (the IBKR Client Portal Web API base path).
  - Sets `rejectUnauthorized: false` (IB Gateway's local cert is self-signed) and a 15s timeout.
  - Adds `ngrok-skip-browser-warning` so tunneled requests don't get an HTML interstitial instead of
    JSON.
  - Parses the response as JSON, falling back to `{ raw, status }` if the body isn't valid JSON.
  - New endpoints should call `proxyRequest` rather than making their own HTTP calls, to keep this
    behavior consistent.

- Route handlers (`/health`, `/test`, `/auth`, `/tickle`, `/accounts`, `/search/:symbol`,
  `/bars/:conid`, `/order`, `/positions/:accountId`) are thin wrappers that call `proxyRequest`
  against the corresponding IBKR Client Portal API endpoint and return the result as JSON. Errors
  from `proxyRequest` are caught per-route and returned as `{ error: message }` with a 500 (except
  `/test`, which reports `{ connected: false, error }` with a 200 so callers can poll it safely).

- `POST /order` has an extra step beyond a plain proxy: IBKR's order endpoint may respond with a
  confirmation/question object (`data[0].id`) instead of placing the order outright (e.g. order
  value or risk warnings). The handler detects this and automatically replies with
  `{ confirmed: true }` via `/iserver/reply/:id` so orders complete without a manual confirmation
  round-trip. Keep this in mind if IBKR's confirmation shape changes or more confirmation types
  need handling.

- A `setInterval` keep-alive loop calls `/tickle` every 50 seconds after the server starts, because
  IB Gateway's brokerage session expires without periodic activity. This must keep running for any
  long-lived deployment — don't remove it when refactoring startup logic.

- **DCA (Dollar-Cost Averaging)**: a separate feature from the active-trading routes above, meant
  for long-term buy-and-hold investing instead of trading. `runDca(accountId)` reads
  `DCA_ALLOCATIONS` (JSON `{ "SYMBOL": monthlyUsdAmount }`), resolves each symbol to a conid via
  `/iserver/secdef/search`, fetches the last price via `/iserver/marketdata/snapshot`, computes a
  whole-share quantity (`floor(usdAmount / price)` — no fractional shares), and places a market BUY
  through the same order + confirmation-reply flow as `/order`. Every attempt (bought, skipped for
  insufficient funds, or errored) is appended to `dca-history.json` on disk via `appendDcaHistory`.
  - `POST /dca/run/:accountId` triggers one purchase round manually (useful for testing config
    before automating it).
  - `GET /dca/history` / `GET /dca/config` are read-only introspection endpoints.
  - A `node-cron` job in `app.listen` runs `runDca` on `DCA_SCHEDULE` (default: `0 9 1 * *`, the 1st
    of each month at 9:00 UTC) — but **only** if `DCA_ENABLED=true` and `DCA_ACCOUNT_ID` are both
    set; this is an intentional safety gate so the bridge doesn't place real orders by default.
  - `dca-history.json` is plain local disk storage — on Railway without an attached persistent
    volume, it's wiped on every redeploy/restart. Don't treat it as a durable audit trail unless a
    volume is mounted.

## Deployment

Deployed on Railway (`railway.json`: Nixpacks builder, `node server.js` start command, restarts
`ON_FAILURE`). Deploy flow per the README: push this repo to GitHub, connect it in railway.app, and
set the `IBKR_HOST` env var to the public address of the machine/tunnel running IB Gateway.

## Notes

- `ibkr-bridge.zip` in the repo root is a stale, older snapshot of the same four files (out of sync
  with `server.js`) — treat the top-level files as the source of truth, not the archive.
- README and code comments are in Spanish; keep that convention when editing them.
