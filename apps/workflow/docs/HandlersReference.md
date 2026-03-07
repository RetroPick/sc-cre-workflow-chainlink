# Handlers Reference

Per-handler documentation for all CRE workflow handlers registered in [main.ts](../main.ts).

## Handler Summary

| Handler | Trigger | Config | Purpose |
|---------|---------|--------|---------|
| onDiscoveryCron | cron | orchestration, feeds, creatorAddress | Multi-source discovery → analyzeCandidate → policy → draftWriter/createMarkets |
| draftProposer | cron | curatedPath, polymarket, rpcUrl | Polymarket → MarketDraftBoard.proposeDraft |
| sessionSnapshot | cron | yellowSessions, creReceiverAddress | Legacy SessionFinalizer path |
| onCheckpointSubmit | cron | relayerUrl, creReceiverAddress | V3 checkpoint delivery via CREReceiver |
| onCheckpointFinalize | cronFinalize | relayerUrl | Relayer submits finalizeCheckpoint after 30 min |
| onCheckpointCancel | cronCancel | relayerUrl | Relayer submits cancelPendingCheckpoint after 6 hr |
| onScheduleResolver | cron | resolution.marketIds, marketRegistryAddress | V3 MarketRegistry schedule-based resolution |
| onLogTrigger | Log | marketAddress | SettlementRequested → resolveFromPlan → CREReceiver |
| onHttpTrigger | HTTP | crePublishReceiverAddress | Publish-from-draft when payload has draftId, creator, params, claimerSig |
| onRiskCron | cronRisk | monitoring.enabled, monitoring.cronSchedule | Live-market risk monitoring, enforcement |

## Conditional Registration

- **onLogTrigger:** Registered when `resolution.mode` is `"log"` or `"both"` AND `evms[0].marketAddress` is set and non-zero.
- **onScheduleResolver:** Registered when `resolution.mode` is `"schedule"` or `"both"` AND `evms[0].marketRegistryAddress` is set and non-zero.
- **onRiskCron:** Registered when `monitoring.enabled` is true.

## Trigger Schedules

| Trigger | Config Field | Default |
|---------|--------------|---------|
| cron | cronSchedule | `*/15 * * * *` (every 15 min) |
| cronFinalize | cronScheduleFinalize | Same as cronSchedule |
| cronCancel | cronScheduleCancel | `0 0 */8 * * *` (every 8 hr) |
| cronRisk | monitoring.cronSchedule | `*/5 * * * *` (every 5 min) |

## Handler Details

### onDiscoveryCron

- **Source:** [pipeline/orchestration/discoveryCron.ts](../pipeline/orchestration/discoveryCron.ts)
- **Flow:** When `orchestration.enabled`: fetches from `sources/registry` → normalizes to `SourceObservation` → for each: `analyzeCandidate` (classify, risk, evidence, oracleability, unresolved check, resolution plan, draft synthesis) → policy evaluation → ALLOW: `createMarkets` or (when `draftingPipeline`) `writeDraftRecord`; REVIEW/REJECT: audit only. When orchestration disabled: delegates to legacy scheduleTrigger path (feeds → generateMarketInput → createMarkets).
- **Output:** writeReport to marketFactoryAddress, or DraftRecord in draftRepository when draftingPipeline.
- **Skip:** No-op if no sources/feeds or `creatorAddress` missing.

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
- **Flow:** For each marketId: read market from MarketRegistry → if resolveTime <= now and not settled → **resolveFromPlan** (load ResolutionPlan from resolutionPlanStore, call resolutionExecutor). When plan exists: deterministic / multi_source_deterministic / ai_assisted (llmConsensus) / human_review. When plan absent: fallback to askGPTForOutcome. Build SettlementArtifact, log via auditLogger, encodeOutcomeReport → writeReport to CREReceiver.
- **Requires:** creReceiverAddress, marketRegistryAddress, resolution.marketIds.
- **See:** [ResolutionFlow](ResolutionFlow.md).

### onLogTrigger

- **Source:** [pipeline/resolution/logTrigger.ts](../pipeline/resolution/logTrigger.ts)
- **Flow:** On SettlementRequested(marketId, question): read market from PoolMarketLegacy → **resolveFromPlan** (load ResolutionPlan, call resolutionExecutor). When plan exists: route by resolutionMode. When plan absent: fallback to askGPTForOutcome. Build SettlementArtifact, log via auditLogger, encodeOutcomeReport → writeReport to CREReceiver.
- **Requires:** creReceiverAddress, marketAddress.
- **Event:** `SettlementRequested(uint256 indexed marketId, string question)`.
- **See:** [ResolutionFlow](ResolutionFlow.md).

### onHttpTrigger

- **Source:** [httpCallback.ts](../httpCallback.ts), [pipeline/creation/publishFromDraft.ts](../pipeline/creation/publishFromDraft.ts)
- **Flow:** If payload has draftId, creator, params, claimerSig → load draft from draftRepository → **revalidateForPublish** → publishFromDraft → markDraftPublished → writeReport(0x04) to CREPublishReceiver. Else (proposal path): when `orchestration.enabled` → normalize to observation → analyzeCandidate → return ProposalPreviewResponse (policy, understanding, resolutionPlan, draft). When `draftingPipeline`: writeDraftRecord instead of createMarkets. Else routes to create market.
- **Requires:** crePublishReceiverAddress (or curatedPath.crePublishReceiverAddress).
- **Target:** CREPublishReceiver (not CREReceiver).

### onRiskCron

- **Source:** [pipeline/monitoring/riskCronHandler.ts](../pipeline/monitoring/riskCronHandler.ts)
- **Flow:** For each marketId (from monitoring.marketIds or resolution.marketIds): collect metrics, compute signals, apply enforcement. Log compliance audit records.
- **Requires:** monitoring.enabled, marketRegistryAddress (or relayer for market IDs).
- **See:** [RiskMonitoringCOmplience.md](RiskMonitoringCOmplience.md).
