# Handlers Reference

Per-handler documentation for all CRE workflow handlers registered in [main.ts](../main.ts).

## Handler Summary

| Handler | Trigger | Config | Purpose |
|---------|---------|--------|---------|
| scheduleTrigger | cron | feeds, creatorAddress | Feed-driven market creation |
| draftProposer | cron | curatedPath, polymarket, rpcUrl | Polymarket → MarketDraftBoard.proposeDraft |
| sessionSnapshot | cron | yellowSessions, creReceiverAddress | Legacy SessionFinalizer path |
| onCheckpointSubmit | cron | relayerUrl, creReceiverAddress | V3 checkpoint delivery via CREReceiver |
| onCheckpointFinalize | cronFinalize | relayerUrl | Relayer submits finalizeCheckpoint after 30 min |
| onCheckpointCancel | cronCancel | relayerUrl | Relayer submits cancelPendingCheckpoint after 6 hr |
| onScheduleResolver | cron | resolution.marketIds, marketRegistryAddress | V3 MarketRegistry schedule-based resolution |
| onLogTrigger | Log | marketAddress | Legacy: SettlementRequested → CREReceiver |
| onHttpTrigger | HTTP | crePublishReceiverAddress | Publish-from-draft when payload has draftId, creator, params, claimerSig |

## Conditional Registration

- **onLogTrigger:** Registered when `resolution.mode` is `"log"` or `"both"` AND `evms[0].marketAddress` is set and non-zero.
- **onScheduleResolver:** Registered when `resolution.mode` is `"schedule"` or `"both"` AND `evms[0].marketRegistryAddress` is set and non-zero.

## Trigger Schedules

| Trigger | Config Field | Default |
|---------|--------------|---------|
| cron | cronSchedule | `*/15 * * * *` (every 15 min) |
| cronFinalize | cronScheduleFinalize | Same as cronSchedule |
| cronCancel | cronScheduleCancel | `0 0 */8 * * *` (every 8 hr) |

## Handler Details

### scheduleTrigger

- **Source:** [pipeline/creation/scheduleTrigger.ts](../pipeline/creation/scheduleTrigger.ts)
- **Flow:** Fetches items from configured feeds (coinGecko, newsAPI, githubTrends, polymarket, custom) → generateMarketInput → createMarkets.
- **Output:** writeReport to marketFactoryAddress.
- **Skip:** No-op if `feeds` empty or `creatorAddress` missing.

### draftProposer

- **Source:** [pipeline/creation/draftProposer.ts](../pipeline/creation/draftProposer.ts)
- **Flow:** Fetches Polymarket events → proposeDraft to MarketDraftBoard via RPC (direct contract call).
- **Requires:** curatedPath.enabled, draftBoardAddress, RPC_URL, CRE_ETH_PRIVATE_KEY.

### sessionSnapshot

- **Source:** [jobs/sessionSnapshot.ts](../jobs/sessionSnapshot.ts)
- **Flow:** For each yellowSession with resolveTime <= now, builds 0x03-prefixed payload → writeReport to CREReceiver.
- **Requires:** yellowSessions, creReceiverAddress.
- **Target:** CREReceiver → OracleCoordinator → SettlementRouter → SessionFinalizer (legacy path).

### onCheckpointSubmit

- **Source:** [pipeline/checkpoint/checkpointSubmit.ts](../pipeline/checkpoint/checkpointSubmit.ts)
- **Flow:** GET /health → GET /cre/checkpoints → for each hasDeltas: GET /cre/checkpoints/:sessionId/sigs → POST /cre/checkpoints/:sessionId → writeReport(0x03 payload) → CREReceiver.
- **Requires:** relayerUrl, creReceiverAddress.
- **See:** [CheckpointFlow](CheckpointFlow.md), [RelayerIntegration](RelayerIntegration.md).

### onCheckpointFinalize

- **Source:** [pipeline/checkpoint/checkpointFinalize.ts](../pipeline/checkpoint/checkpointFinalize.ts)
- **Flow:** GET /cre/checkpoints → for each: POST /cre/finalize/:sessionId. Relayer submits finalizeCheckpoint tx (succeeds after 30 min challenge window).
- **Requires:** relayerUrl.
- **Idempotent:** 400 if challenge window not elapsed or no pending.

### onCheckpointCancel

- **Source:** [pipeline/checkpoint/checkpointCancel.ts](../pipeline/checkpoint/checkpointCancel.ts)
- **Flow:** GET /cre/checkpoints → for each: POST /cre/cancel/:sessionId. Relayer submits cancelPendingCheckpoint tx (after 6 hr CANCEL_DELAY).
- **Requires:** relayerUrl.
- **Idempotent:** 400 if CANCEL_DELAY not elapsed or no pending.

### onScheduleResolver

- **Source:** [pipeline/resolution/scheduleResolver.ts](../pipeline/resolution/scheduleResolver.ts)
- **Flow:** For each marketId in resolution.marketIds: read market from MarketRegistry → if resolveTime <= now and not settled → askGPTForOutcome → encodeOutcomeReport → writeReport to CREReceiver.
- **Requires:** creReceiverAddress, marketRegistryAddress, resolution.marketIds.
- **See:** [ResolutionFlow](ResolutionFlow.md).

### onLogTrigger

- **Source:** [pipeline/resolution/logTrigger.ts](../pipeline/resolution/logTrigger.ts)
- **Flow:** On SettlementRequested(marketId, question): read market from PoolMarketLegacy → askGPTForOutcome → encodeOutcomeReport → writeReport to CREReceiver.
- **Requires:** creReceiverAddress, marketAddress.
- **Event:** `SettlementRequested(uint256 indexed marketId, string question)`.
- **See:** [ResolutionFlow](ResolutionFlow.md).

### onHttpTrigger

- **Source:** [httpCallback.ts](../httpCallback.ts), [pipeline/creation/publishFromDraft.ts](../pipeline/creation/publishFromDraft.ts)
- **Flow:** If payload has draftId, creator, params, claimerSig → publishFromDraft → writeReport(0x04) to CREPublishReceiver. Else routes to create market (currently returns Success).
- **Requires:** crePublishReceiverAddress (or curatedPath.crePublishReceiverAddress).
- **Target:** CREPublishReceiver (not CREReceiver).
