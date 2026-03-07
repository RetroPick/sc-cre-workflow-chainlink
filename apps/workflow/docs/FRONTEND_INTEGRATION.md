# Frontend Integration Guide

This document describes how to integrate the frontend with the CRE Chainlink Workflow and Relayer. Use this checklist when wiring the frontend to the workflow/relayer stack.

---

## 1. Relayer API Contract

The workflow expects the relayer to expose these endpoints. The frontend interacts with the relayer for checkpoint signing; the workflow calls the relayer for checkpoint lifecycle.

| Method | Endpoint | Workflow | Frontend |
|--------|----------|----------|----------|
| GET | /health | Pre-flight | — |
| GET | /cre/checkpoints | List sessions | — |
| GET | /cre/checkpoints/:sessionId | — | **Get digest, users for signing** |
| GET | /cre/checkpoints/:sessionId/sigs | Optional check | — |
| POST | /cre/checkpoints/:sessionId/sigs | — | **Store userSigs before CRE cron** |
| POST | /cre/checkpoints/:sessionId | Build payload (empty body) | Alternative: send userSigs in body |
| POST | /cre/finalize/:sessionId | Trigger finalize tx | — |
| POST | /cre/cancel/:sessionId | Trigger cancel tx | — |

### Critical: Signature Storage Flow

The workflow POSTs to `/cre/checkpoints/:sessionId` with **empty body** and expects the relayer to use **stored** user signatures. Therefore:

- **Option A (recommended):** Frontend POSTs to `POST /cre/checkpoints/:sessionId/sigs` with `{ userSigs: { "0xAddr": "0x..." } }` before the CRE cron runs. Workflow then POSTs with empty body; relayer uses stored sigs.
- **Option B:** If the relayer supports it, frontend can POST to `/cre/checkpoints/:sessionId` with `{ userSigs }` in the body. The relayer must either store those sigs for the workflow’s later empty-body POST, or the workflow must be adapted.

**Verify** that your relayer implementation supports the workflow’s expected flow (empty-body POST using stored sigs).

---

## 2. Frontend Checklist

### 2.1 Relayer URL

- [ ] Use a **configurable** `relayerUrl` (e.g. from `.env` or config), not hardcoded `localhost`.
- [ ] Example: `VITE_RELAYER_URL` or `NEXT_PUBLIC_RELAYER_URL` for Vite/Next.js.

### 2.2 Checkpoint Signing Flow

1. [ ] After trades, fetch checkpoint spec: `GET /cre/checkpoints/:sessionId`.
2. [ ] Prompt users to sign the EIP-712 digest.
3. [ ] POST user signatures: `POST /cre/checkpoints/:sessionId/sigs` with `{ userSigs: { [address]: "0x..." } }` **before** the CRE cron runs.
4. [ ] Ensure the relayer stores sigs with sufficient TTL (e.g. 10 min) so the workflow can pick them up.

### 2.3 Publish-from-Draft (Curated Path)

If using the curated drafting pipeline:

- [ ] Send HTTP payload to the workflow’s HTTP trigger with:
  ```json
  {
    "draftId": "0x...",
    "creator": "0x...",
    "params": {
      "question": "...",
      "marketType": 0,
      "outcomes": ["Yes", "No"],
      "resolveTime": 1735689600,
      "timelineWindows": [],
      "tradingOpen": 0,
      "tradingClose": 1735689600
    },
    "claimerSig": "0x..."
  }
  ```
- [ ] Handle responses: `{ ok: true, txHash: "0x..." }` or `{ ok: false, error: "..." }`.

### 2.4 Create Market (HTTP Trigger)

- [ ] For **orchestration** path: send `question`, `resolveTime`, `category`, `requestedBy`, optional `preview`.
- [ ] For **direct** path: send `question`, `requestedBy` (or rely on `creatorAddress` in config).
- [ ] Expect JSON responses: `{ ok, message?, policy?, draft?, error? }`.

---

## 3. Workflow Configuration Requirements

For the workflow to operate correctly with the frontend/relayer:

| Config | Required | Purpose |
|--------|----------|---------|
| `relayerUrl` | Yes | Relayer base URL for checkpoint jobs |
| `creReceiverAddress` | Yes | CREReceiver for resolution and checkpoint |
| `evms[0].chainSelectorName` | Yes | Chain (e.g. `ethereum-testnet-sepolia`) |
| `evms[0].gasLimit` | Yes | Gas limit for writeReport |
| `creatorAddress` | For feeds | Default creator for feed-driven creation |
| `marketFactoryAddress` | For create | Market creation target |
| `curatedPath.crePublishReceiverAddress` | For publish-from-draft | CREPublishReceiver address |

---

## 4. Known Limitations (MVP)

| Component | Current State | Notes |
|-----------|---------------|-------|
| Draft persistence | In-memory | Acceptable for MVP; Firestore/DB planned |
| Resolution plan store | In-memory | Same |
| Risk enforcement | NoopEnforcementApplier | Logs only; on-chain PAUSE/DELIST planned |

---

## 5. Integration Readiness Summary

| Requirement | Status |
|-------------|--------|
| Config validation (relayerUrl, evms, etc.) | ✓ |
| Checkpoint submit/finalize/cancel handlers | ✓ |
| Publish-from-draft HTTP route | ✓ |
| Create market (orchestration + direct) HTTP route | ✓ |
| Resolution (log + schedule) | ✓ |
| Direct create returns JSON | ✓ |
| Relayer sig storage flow | Verify with relayer |

---

## 6. Detailed Integration Docs

For step-by-step guides, API schemas, and troubleshooting, see [integration/frontend/](../integration/frontend/README.md).

---

## 7. Related Docs

- [RelayerIntegration.md](RelayerIntegration.md) — Workflow ↔ Relayer API contract
- [CheckpointFlow.md](CheckpointFlow.md) — Checkpoint lifecycle
- [DOCUMENTATION.md](DOCUMENTATION.md) — Full workflow documentation
