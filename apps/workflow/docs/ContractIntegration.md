# Contract Integration

Report formats, receivers, and on-chain routing. The workflow encodes payloads and sends them to CREReceiver or CREPublishReceiver via the Chainlink Forwarder.

## Report Formats

### Outcome (Resolution)

**Source:** [contracts/reportFormats.ts](../contracts/reportFormats.ts) — `encodeOutcomeReport`

**Format:** `abi.encode(address market, uint256 marketId, uint8 outcomeIndex, uint16 confidence)` — no prefix.

**Flow:** CRE → CREReceiver → OracleCoordinator.submitResult → SettlementRouter.settleMarket → market.onReport.

SettlementRouter builds `0x01 || abi.encode(marketId, outcomeIndex, confidence)` and calls `market.onReport("", report)`. The workflow does not add 0x01; the router does.

### Checkpoint (Session Settlement)

**Format:** `0x03 || abi.encode(Checkpoint, Delta[], operatorSig, users[], userSigs[])`

**Built by:** Relayer (POST /cre/checkpoints/:sessionId). Workflow receives payload from relayer and passes through.

**Flow:** CRE → CREReceiver → OracleCoordinator.submitSession → SettlementRouter.finalizeSession → ChannelSettlement.submitCheckpointFromPayload.

### Publish-from-Draft

**Source:** [contracts/reportFormats.ts](../contracts/reportFormats.ts) — `encodePublishReport`

**Format:** `0x04 || abi.encode(draftId, creator, DraftPublishParams, claimerSig)`

**Flow:** CRE → CREPublishReceiver → MarketFactory.createFromDraft. Workflow targets CREPublishReceiver, not CREReceiver.

## CREReceiver Routing

**Source:** [packages/contracts/src/oracle/CREReceiver.sol](../../packages/contracts/src/oracle/CREReceiver.sol)

```solidity
if (report.length > 0 && report[0] == 0x03) {
    oracleCoordinator.submitSession(report[1:]);  // checkpoint path
    return;
}
// else: outcome path
abi.decode(report, (address, uint256, uint8, uint16));
oracleCoordinator.submitResult(market, marketId, outcomeIndex, confidence);
```

| Report[0] | Route | Target |
|-----------|-------|--------|
| 0x03 | submitSession | SettlementRouter → ChannelSettlement |
| (none) | submitResult | SettlementRouter → MarketRegistry / PoolMarketLegacy |

## CREPublishReceiver

Separate receiver for publish-from-draft. Workflow must target CREPublishReceiver for 0x04 payloads. Validates EIP-712 PublishFromDraft signature and calls MarketFactory.createFromDraft.

## SettlementRouter

**Source:** [packages/contracts/src/core/SettlementRouter.sol](../../packages/contracts/src/core/SettlementRouter.sol)

### settleMarket(market, marketId, outcomeIndex, confidence)

- Callable only by OracleCoordinator.
- Builds `report = 0x01 || abi.encode(marketId, outcomeIndex, confidence)`.
- Calls `market.onReport("", report)` where market is MarketRegistry or PoolMarketLegacy (IPredictionMarketReceiver).
- If useReceiverAllowlist: market must be approved.

### finalizeSession(payload)

- Callable only by OracleCoordinator.
- If channelSettlement set: decodes payload, calls `IChannelSettlement(channelSettlement).submitCheckpointFromPayload(payload)`.
- Else if sessionFinalizer set: calls `ISessionFinalizer(sessionFinalizer).finalizeSession(payload)`.

## MarketRegistry.onReport

**Source:** [packages/contracts/src/core/MarketRegistry.sol](../../packages/contracts/src/core/MarketRegistry.sol)

- Callable only by SettlementRouter.
- Requires `report[0] == 0x01`.
- Decodes `(marketId, outcomeIndex, confidence)` from report[1:].
- Calls `_doResolve(marketId, outcomeIndex, confidence)` — marks settled, sets outcome, emits MarketResolved.

## ChannelSettlement

- **submitCheckpointFromPayload(payload):** Submits checkpoint; 30 min challenge window starts.
- **finalizeCheckpoint(marketId, sessionId, deltas):** Callable after challenge window; applies deltas on-chain.
- **cancelPendingCheckpoint(marketId, sessionId):** Callable after CANCEL_DELAY (6 hr); releases reserves.

Relayer submits finalizeCheckpoint and cancelPendingCheckpoint; workflow triggers via POST /cre/finalize and POST /cre/cancel.

## Config Addresses

| Config Field | Contract | Used For |
|--------------|----------|----------|
| creReceiverAddress | CREReceiver | Resolution, checkpoint, legacy session |
| crePublishReceiverAddress | CREPublishReceiver | Publish-from-draft |
| marketFactoryAddress | MarketFactory | Feed-driven market creation |
| evms[0].marketAddress | PoolMarketLegacy | Log resolution target |
| evms[0].marketRegistryAddress | MarketRegistry | Schedule resolution target |

## Ingress Chain

| Step | Caller | Callee | Guard |
|------|--------|--------|-------|
| 1 | Chainlink Forwarder | CREReceiver / CREPublishReceiver | Forwarder only |
| 2 | CREReceiver | OracleCoordinator | onlyReceiver |
| 3 | OracleCoordinator | SettlementRouter | — |
| 4a | SettlementRouter | ChannelSettlement | (checkpoint) |
| 4b | SettlementRouter | MarketRegistry | settleMarket → onReport |
| (Publish) | Forwarder | CREPublishReceiver | Forwarder only |
| (Publish) | CREPublishReceiver | MarketFactory | — |

## References

- [packages/contracts/docs/IntegrationMatrix.md](../../packages/contracts/docs/IntegrationMatrix.md)
- [packages/contracts/docs/abi/docs/cre/CREReportFormats.md](../../packages/contracts/docs/abi/docs/cre/CREReportFormats.md)
