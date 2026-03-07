# Troubleshooting Frontend Integration

Common issues when integrating the frontend with the CRE workflow and relayer, plus a verification checklist.

---

## 1. Relayer Issues

### Relayer Unhealthy / Unreachable

**Symptom:** `GET /health` fails or returns `{ ok: false }`. CRE workflow returns early with "Relayer unhealthy" or "Relayer unreachable".

**Causes:**
- Relayer not running
- Wrong `VITE_RELAYER_URL` (e.g. still `localhost` when deployed)
- CORS or network firewall blocking requests
- Relayer crashed or overloaded

**Fix:**
1. Verify relayer is running: `curl {relayerUrl}/health`
2. Use configurable `VITE_RELAYER_URL` from env, not hardcoded `localhost`
3. For production, use the deployed relayer URL (e.g. `https://backend-relayer-production.up.railway.app`)
4. Check relayer logs for startup errors (missing `CHANNEL_SETTLEMENT_ADDRESS`, `OPERATOR_PRIVATE_KEY`, `RPC_URL`)

---

## 2. Checkpoint Issues

### No Stored Sigs When CRE Runs

**Symptom:** CRE cron runs but skips sessions; relayer returns 400 or invalid payload when workflow POSTs with empty body.

**Causes:**
- Frontend never POSTed user sigs to `POST /cre/checkpoints/:sessionId/sigs`
- Sigs expired (TTL 10 min) before CRE cron ran
- Frontend used `POST /cre/checkpoints/:sessionId` with userSigs but relayer did not store them for workflow's later empty-body POST
- CRE cron runs too infrequently (e.g. every 30 min) — sigs may expire

**Fix:**
1. **Option A (recommended):** Frontend POSTs to `POST /cre/checkpoints/:sessionId/sigs` immediately after users sign. Ensure CRE cron runs at least every 10 min (e.g. `*/10 * * * *`).
2. **Option B:** If using `POST /cre/checkpoints/:sessionId` with userSigs in body, verify relayer stores those sigs for workflow's later empty-body POST.
3. Align cron schedule: `cronSchedule` in workflow config should run frequently enough to pick up sigs before TTL expires.

### Checkpoint 400 / 404

**Symptom:** `GET /cre/checkpoints/:sessionId` returns 400 or 404.

**Causes:**
- 404: Session not found (wrong sessionId or session never created)
- 400: No deltas to checkpoint; state already finalized on chain; no new trades
- 503: `CHANNEL_SETTLEMENT_ADDRESS` or `RPC_URL` not configured on relayer

**Fix:**
1. Verify session exists: `GET /api/session/:sessionId`
2. Ensure trades have occurred; checkpoint requires deltas
3. Check relayer env: `CHANNEL_SETTLEMENT_ADDRESS`, `RPC_URL`, `OPERATOR_PRIVATE_KEY`

---

## 3. Publish-from-Draft Issues

### Draft Not Found

**Symptom:** `{ ok: false, error: "Draft not found" }`

**Causes:**
- Draft never created (orchestration with `draftingPipeline` creates DraftRecord)
- Wrong `draftId` (must match bytes32 from draft creation)
- Draft persistence is in-memory (MVP) — workflow restart loses drafts

**Fix:**
1. Create draft first via orchestration HTTP create with `draftingPipeline` enabled
2. Use exact `draftId` from create response
3. For MVP: avoid workflow restarts between draft creation and publish

### Revalidation Failed

**Symptom:** `{ ok: false, error: "..." }` (revalidation reason)

**Causes:**
- Draft expired
- Params mismatch (question, outcomes, resolveTime, etc.)
- Unresolved check failed
- Draft already published

**Fix:**
1. Ensure `params` match the original draft exactly
2. Check draft has not expired (default 7 days)
3. Verify draft status is PENDING_CLAIM, not PUBLISHED

### Eligibility Denied

**Symptom:** `{ ok: false, error: "<reasonCode>" }` when `privacy.enabled` and draft has `COMPLIANCE_GATED` profile.

**Causes:**
- Eligibility provider denied the creator (e.g. restricted jurisdiction, KYC)

**Fix:**
1. Check eligibility provider config
2. Verify creator wallet passes policy (e.g. `RETROPICK_RESTRICTED_MARKET_V1`)

---

## 4. Create Market Issues

### creatorAddress / requestedBy Required

**Symptom:** `"Error: creatorAddress or requestedBy required"`

**Causes:**
- Payload missing `requestedBy` and workflow config has no `creatorAddress`
- `requestedBy` is zero address

**Fix:**
1. Include `requestedBy: "0x..."` in HTTP payload, or
2. Set `creatorAddress` in workflow config

### marketFactoryAddress Required

**Symptom:** `"Error: marketFactoryAddress required"`

**Causes:**
- Workflow config missing `marketFactoryAddress` for direct create path

**Fix:**
1. Add `marketFactoryAddress` to workflow config (e.g. Fuji: `0x2f70602034854C14CBfD1F94C713f833d344d748`)

### Question Required

**Symptom:** `"Error: Question is required"` or `"Error: title or question required"`

**Causes:**
- Payload missing both `question` and `title`

**Fix:**
1. Send `question` or `title` (alias) in HTTP body

---

## 5. Verification Checklist

Use this checklist to verify integration readiness (from [FRONTEND_INTEGRATION.md](../../docs/FRONTEND_INTEGRATION.md)):

| Requirement | Status | Notes |
|-------------|--------|-------|
| Config validation (relayerUrl, evms, etc.) | ✓ | Workflow validates on startup |
| Checkpoint submit/finalize/cancel handlers | ✓ | Cron handlers in workflow |
| Publish-from-draft HTTP route | ✓ | `onHttpTrigger` routes by payload shape |
| Create market (orchestration + direct) HTTP route | ✓ | Same |
| Resolution (log + schedule) | ✓ | Backend-driven |
| Direct create returns JSON | ✓ | `{ ok, message }` |
| Relayer sig storage flow | Verify | Ensure relayer stores sigs for Option A |

---

## 6. Related Docs

- [01-relayer-api.md](01-relayer-api.md) — Relayer endpoints and error codes
- [02-checkpoint-signing.md](02-checkpoint-signing.md) — EIP-712 signing flow
- [03-workflow-http.md](03-workflow-http.md) — HTTP payloads and responses
- [docs/FRONTEND_INTEGRATION.md](../../docs/FRONTEND_INTEGRATION.md) — High-level checklist
- [docs/RelayerIntegration.md](../../docs/RelayerIntegration.md) — Workflow ↔ Relayer contract
