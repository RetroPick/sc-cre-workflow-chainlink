# Troubleshooting

Common failure modes, log messages, and resolutions for the CRE workflow.

## Startup / Config Validation

### "Config must have at least one evms entry"

**Cause:** `evms` is empty or missing.

**Fix:** Add at least one EVM config with `chainSelectorName`, `marketAddress` (for log resolution), `marketRegistryAddress` (for schedule resolution), `gasLimit`.

### "relayerUrl is required for checkpoint jobs"

**Cause:** `relayerUrl` missing, empty, or too short (< 10 chars).

**Fix:** Set `relayerUrl` to relayer base URL (e.g. `https://backend-relayer-production.up.railway.app`).

### "resolution.mode includes 'schedule' but marketRegistryAddress is not set or is zero"

**Cause:** Schedule resolution enabled but `evms[0].marketRegistryAddress` not configured.

**Fix:** Set `evms[0].marketRegistryAddress` to deployed MarketRegistry address.

### "resolution.mode includes 'log' but marketAddress is not set or is zero"

**Cause:** Log resolution enabled but `evms[0].marketAddress` not configured.

**Fix:** Set `evms[0].marketAddress` to deployed PoolMarketLegacy address.

### "curatedPath.enabled with crePublishReceiverAddress requires draftBoardAddress"

**Cause:** Curated path enabled with CREPublishReceiver but no draft board.

**Fix:** Set `curatedPath.draftBoardAddress` or disable curated path.

### "Network not found: {chainSelectorName}"

**Cause:** Unsupported or typo in `chainSelectorName` (e.g. `avalanche-fuji`, `ethereum-testnet-sepolia`).

**Fix:** Use a supported chain selector. Check CRE SDK / getNetwork support.

---

## Resolution

### "Missing creReceiverAddress"

**Log:** `[ERROR] creReceiverAddress required for outcome resolution` or `[ScheduleResolver] Missing creReceiverAddress`

**Cause:** `creReceiverAddress` not set or zero address.

**Fix:** Set `creReceiverAddress` to deployed CREReceiver contract.

### "Market already settled"

**Log:** `[Step 2] Market already settled, skipping...` or `[ScheduleResolver] Market X already settled`

**Cause:** Market was resolved previously.

**Fix:** No action; workflow correctly skips.

### "resolveTime X > now"

**Log:** `[ScheduleResolver] Market X resolveTime X > now`

**Cause:** Resolution time not yet reached.

**Fix:** Wait until resolveTime; or add market to resolution.marketIds only when due.

### "DeepSeek API key not found"

**Cause:** Neither DEEPSEEK_API_KEY (CRE secret) nor `config.deepseekApiKey` set.

**Fix:** Set DEEPSEEK_API_KEY as CRE secret, or add `deepseekApiKey` to config. For demo: `useMockAi: true`, `mockAiResponse: '{"result":"YES","confidence":10000}'`.

### "Failed to parse GPT outcome" / "Invalid result value" / "Invalid confidence"

**Cause:** AI returned non-JSON or invalid structure (e.g. markdown, wrong keys, confidence out of 0–10000).

**Fix:** Check AI prompts and model. Use `useMockAi` for stable demo. Ensure model returns strict JSON.

### "Transaction failed: {TxStatus}"

**Cause:** writeReport tx reverted or failed.

**Fix:** Check gas limit, receiver address, Forwarder config. Verify OracleCoordinator and SettlementRouter wiring on-chain.

---

## Checkpoint

### "Relayer unhealthy" / "Relayer unreachable"

**Log:** `[Checkpoint] Relayer health check failed (ok != true)` or `Relayer health check failed: ...`

**Cause:** GET /health failed or returned `ok != true`.

**Fix:** Ensure relayer is running; check relayerUrl; verify relayer exposes /health with `{ ok: true }`.

### "No sessions with deltas"

**Log:** `[Checkpoint] No sessions with deltas` or similar for finalize/cancel

**Cause:** No active sessions with checkpointable deltas; or list empty.

**Fix:** Normal when no trading activity. Create session, execute trades, then checkpoint will have deltas.

### " invalid payload or missing sigs"

**Log:** `[Checkpoint] Session X: invalid payload or missing sigs`

**Cause:** POST /cre/checkpoints/:sessionId returned payload without 0x03 prefix, or missing user signatures.

**Fix:** Frontend must POST user signatures to `POST /cre/checkpoints/:sessionId/sigs` before CRE cron. Ensure relayer has OPERATOR_PRIVATE_KEY and CHANNEL_SETTLEMENT_ADDRESS configured.

### "Challenge window" / "No pending" (Finalize)

**Log:** `[CheckpointFinalize] Session X: not ready (Challenge window...` or `No pending...`

**Cause:** 400 from relayer: challenge window not elapsed (30 min) or no pending checkpoint to finalize.

**Fix:** Wait for challenge window. Ensure checkpoint was successfully submitted first. Idempotent; next cron will retry.

### "CANCEL_DELAY" / "TooEarly" (Cancel)

**Log:** `[CheckpointCancel] Session X: not ready (CANCEL_DELAY...`

**Cause:** 400 from relayer: cancel only valid after 6 hr from pending createdAt.

**Fix:** Wait for CANCEL_DELAY. Idempotent; next cron will retry.

### "503" from relayer

**Cause:** Relayer misconfigured: CHANNEL_SETTLEMENT_ADDRESS, OPERATOR_PRIVATE_KEY, or RPC_URL missing; nonce sync failed.

**Fix:** Configure relayer env vars. See [apps/relayer/README.md](../relayer/README.md).

---

## Creation

### "Missing marketFactoryAddress" (Feed-driven)

**Log:** `[Cron] Missing marketFactoryAddress in config`

**Fix:** Set `marketFactoryAddress` for scheduleTrigger / marketCreator.

### "Missing creatorAddress"

**Log:** `[Cron] Missing creatorAddress in config, skipping`

**Fix:** Set `creatorAddress` for feed-driven creation.

### "No feeds configured" / "No feed items generated"

**Log:** `[Cron] No feeds configured` or `No feed items generated`

**Fix:** Add feeds to config; ensure feed URLs and params are valid; check external API availability.

### "Missing crePublishReceiverAddress" (Publish-from-draft)

**Log:** `[PublishFromDraft] Missing crePublishReceiverAddress`

**Fix:** Set `crePublishReceiverAddress` or `curatedPath.crePublishReceiverAddress`.

### "DraftProposer not enabled" / "Missing RPC or private key"

**Log:** `[DraftProposer] Not enabled` or `RPC_URL and CRE_ETH_PRIVATE_KEY required`

**Fix:** Set `curatedPath.enabled`, `curatedPath.draftBoardAddress`, `rpcUrl` (or RPC_URL), CRE_ETH_PRIVATE_KEY (or DRAFT_PROPOSER_PRIVATE_KEY).

---

## HTTP / Relayer Errors

### "HTTP error 400: ..."

**Cause:** Relayer or external API returned 400. Body contains details.

**Fix:** Check error body. For checkpoint: missing sigs, challenge window, no pending. For others: validate request payload.

### "HTTP error 404: ..."

**Cause:** Session or resource not found.

**Fix:** Verify sessionId; ensure session exists on relayer.

### "HTTP error 503: ..."

**Cause:** Relayer or service unavailable; or misconfigured (see 503 from relayer above).

**Fix:** Check relayer status; verify relayer env vars.
