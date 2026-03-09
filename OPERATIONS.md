# RetroPick Operations Guide

This document explains how to run and operate the full RetroPick stack and the admin panel from the root repo.

## 1. What You Are Operating

- `apps/front-end-v2`: user/admin web app (port `8080`)
- `apps/relayer`: off-chain trading + checkpoint APIs (port `8790`)
- `packages/contracts`: deployed contracts and ABIs (Fuji by default in frontend config)

## 2. Prerequisites

- Docker + Docker Compose
- Or local runtime: Node/Bun (if running apps without Docker)
- Wallet (MetaMask/Reown-supported) connected to Avalanche Fuji (`43113`)
- Testnet funds for gas
- Correct `.env` in repo root

Create env file:

```bash
cp .env.example .env
```

Minimum important variables:

- `RPC_URL`
- `CHANNEL_SETTLEMENT_ADDRESS`
- `OPERATOR_PRIVATE_KEY`
- `FINALIZER_PRIVATE_KEY`
- `VITE_RELAYER_URL` (normally `http://localhost:8790`)

## 3. Start the Stack

### Docker (recommended)

From repo root:

```bash
docker compose up --build
```

Access:

- Frontend: `http://localhost:8080`
- Relayer: `http://localhost:8790`

### Local (non-Docker)

From repo root:

```bash
bun install
bun run setup
bun run dev
```

Or run separately:

```bash
bun run dev:relayer
bun run dev:frontend
```

## 4. App Navigation

- Landing page: `/`
- Main app: `/app`
- Draft board: `/app/drafts`
- Admin panel: `/app/admin`
- Market detail: `/app/market/:id`
- Portfolio: `/app/portfolio`

## 5. Normal User Operation (Trading Flow)

1. Open `/app`.
2. Connect wallet.
3. Select market and place buy/sell/swap actions.
4. Observe position and balances in portfolio/activity views.

Relayer handles quote/trade/checkpoint API paths under `http://localhost:8790/api/*` and `http://localhost:8790/cre/*`.

## 6. Admin Panel Operation (`/app/admin`)

The admin page is ABI-driven and executes on-chain transactions directly.

### 6.1 Required On-Chain Permissions

- `AI_ORACLE_ROLE` on `MarketDraftBoard` for draft creation
- Approved publish receiver on `MarketFactory` (`approvedPublishReceivers[wallet] == true`) for direct `createFromDraft`
- If your wallet is `MarketFactory.owner`, you can grant/revoke publish receiver for yourself from the admin UI

### 6.2 Network Requirement

- Wallet must be on Avalanche Fuji (`chainId = 43113`)

### 6.3 Admin Actions Available

- `Create Draft`
- `Create Draft + Publish Instantly`
- `Approve My Wallet As Publish Receiver` (owner-only)
- `Revoke My Wallet` (owner-only)
- `Refresh Status`

### 6.4 Field Meaning (Form)

- `question`: market question text
- `marketType`: `0` Binary, `1` Categorical, `2` Timeline
- `outcomesText`: one outcome per line
- `timelineWindowsText`: required for timeline markets; one UNIX timestamp per line
- `tradingOpen`, `tradingClose`, `resolveTime`: must satisfy `open < close <= resolve`
- `minSeed`: required minimum seed (6-decimal token units for USDC-like assets)
- `seedAmount`: actual amount used in instant flow claim-and-seed
- `settlementAsset`: ERC20 token address used by claim-and-seed
- `creator`: creator address passed to `MarketFactory.createFromDraft`
- `resolveSpec`, `questionURI`, `outcomesURI`: metadata and resolution descriptors

### 6.5 Create Draft Only

1. Fill form.
2. Click `Create Draft`.
3. Confirm wallet transaction (`MarketDraftBoard.proposeDraft`).
4. On success, use `/app/drafts` to inspect/claim/publish lifecycle.

### 6.6 Create Draft + Publish Instantly

This executes:

1. `MarketDraftBoard.proposeDraft`
2. ERC20 `approve` to `DraftClaimManager`
3. EIP-712 sign `ClaimAndSeed`
4. `DraftClaimManager.claimAndSeed`
5. `MarketFactory.createFromDraft`

Use when you want a single admin-driven flow from draft creation to live market creation.

## 7. Draft Board Operation (`/app/drafts`)

Use this page for lifecycle review and manual interventions:

- list drafts
- claim & seed proposed drafts
- unlock seed shares when eligible

## 8. Operational Checks

When stack is up:

```bash
docker compose ps
```

Expected:

- `frontend` container healthy/running on `0.0.0.0:8080->80`
- `relayer` container running on `0.0.0.0:8790->8790`

Relayer logs:

```bash
docker compose logs -f relayer
```

Frontend logs:

```bash
docker compose logs -f frontend
```

## 9. Common Issues and Fixes

### Docker TLS timeout pulling base images

If you see `TLS handshake timeout` while pulling `node:20-alpine` or `nginx:alpine`:

```bash
docker pull node:20-alpine
docker pull nginx:alpine
docker compose up --build
```

### Wrong network in wallet

- Switch wallet to Fuji (`43113`)
- Refresh page

### Missing admin permissions

- `AI_ORACLE_ROLE` missing: ask contract admin to grant role on `MarketDraftBoard`
- publish receiver not approved: MarketFactory owner must call `setPublishReceiverApproved(wallet, true)`

### Instant flow fails at claim-and-seed

- Ensure `settlementAsset` is not zero address
- Ensure wallet has enough token balance and gas
- Ensure `seedAmount >= minSeed` and matches token decimals expectations (USDC-like 6 decimals)

### Relayer not reachable from frontend

- Verify `VITE_RELAYER_URL` in root `.env`
- Confirm relayer container is running on `8790`

## 10. Stop / Rebuild

Stop:

```bash
docker compose down
```

Rebuild from scratch:

```bash
docker compose down
docker compose build --no-cache
docker compose up
```
