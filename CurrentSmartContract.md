# RetroPick Current Smart Contract Architecture (V3 — Polymarket-like ERC1155)

Last updated: 2026-03-01  
Scope: `packages/contracts/src` + `packages/contracts/test`  
Validation snapshot: `forge test -q` passes on this state.

## 1) Executive Architecture Summary

The current system is now a hybrid of:

1. Oracle ingress and routing pipeline
- `ReceiverTemplate` -> `CREReceiver` -> `OracleCoordinator` -> `SettlementRouter`

2. Curated market supply pipeline (Draft -> Claim -> Publish)
- `MarketDraftBoard`
- `DraftClaimManager` (legacy `claimDraft` + new `claimAndSeed`)
- `LiquidityVaultFactory` (per-draft ERC-4626 vault deployer)
- `CREPublishReceiver`
- `MarketFactory.createFromDraft`

3. Execution settlement pipeline (checkpoint-based, V3)
- `ChannelSettlement`
- `OutcomeToken1155` (ERC-1155 outcome positions; replaces `ExecutionLedger` as canonical)
- `MarketRiskManager` (LP payout cap + reservation)
- `MarketRegistry`
- `CollateralVault` or `MultiAssetVault`
- `FeeManager` + `FeePool` + `TreasuryPool`
- optional market liquidity vault per market via `MarketRegistry.liquidityVaultByMarketId`

4. Legacy pool market lane (still active in code/tests)
- `PoolMarketLegacy`
- `SessionFinalizer`
- `Treasury` (optional escrow helper)

V3 upgrades:
- **ERC-1155 outcome tokens:** Positions are ERC-1155 tokens; transfer-locked until market resolved. Polymarket-like composability post-resolution.
- **MarketRiskManager:** Caps LP underwriting per market; `reserveLpPayout` enforces `reserved + amount <= cap` before LP pays traders.
- **Accounting invariant:** `rawSum == netTraderDelta + feesTotal` enforced in `_applyCashDeltasAndFees`.
- **LP solvency check:** Explicit revert `LpVaultInsolvent(need, have)` before LP pays.
- **ExecutionLedger:** Deprecated for V3 path; optional backward compat when `outcomeToken == 0`.
- **Escrow-safe vaults (V3-Escrow):** 3-bucket accounting (free + reserved + locked). Reserve on checkpoint submit, release on finalize/cancel. Prevents withdraw griefing during challenge window.

## 2) High-Level Topology

```mermaid
flowchart LR
  subgraph ingress[Oracle Ingress]
    FWD[Chainlink Forwarder]
    CR[CREReceiver]
    OC[OracleCoordinator]
    RV[ReportValidator]
    SR[SettlementRouter]
  end

  subgraph curated[Curated Pipeline]
    DB[MarketDraftBoard]
    DCM[DraftClaimManager]
    LVF[LiquidityVaultFactory]
    CPR[CREPublishReceiver]
    MF[MarketFactory]
  end

  subgraph execution[Execution Pipeline]
    MR[MarketRegistry]
    CS[ChannelSettlement]
    OT[OutcomeToken1155]
    RM[MarketRiskManager]
    MAV[MultiAssetVault]
    CV[CollateralVault]
    FM[FeeManager]
    FP[FeePool]
    TP[TreasuryPool]
    LV[LiquidityVault4626]
  end

  subgraph legacy[Legacy Pool Lane]
    PM[PoolMarketLegacy]
    SF[SessionFinalizer]
    TR[Treasury]
  end

  FWD --> CR
  RV --> OC
  CR --> OC
  OC --> SR

  SR -->|0x01 result| MR
  SR -->|0x01 result| PM
  SR -->|session payload| CS
  SR -->|fallback| SF

  DB --> DCM
  DCM --> LVF
  CPR --> DCM
  CPR --> DB
  CPR --> MF
  MF --> MR
  MF --> PM

  CS -->|mint/burn| OT
  CS -->|reserveLpPayout| RM
  CS --> MAV
  CS --> CV
  CS --> FM
  CS --> FP
  CS --> LV
  FP --> TP
  MF -->|setMaxLpPayout| RM

  MR -->|balanceOf+burn| OT
  MR --> MAV
  MR --> CV
```

## 3) Contract Inventory and Roles

## 3.1 Core

- `src/core/MarketRegistry.sol`
  - canonical market metadata + settlement + redeem in execution lane.
- `src/core/MarketFactory.sol`
  - CRE market creation (v1/v2) and curated `createFromDraft`.
- `src/core/SettlementRouter.sol`
  - routes validated outcomes and session payloads.
- `src/core/SessionFinalizer.sol`
  - legacy snapshot payout finalizer.
- `src/core/PoolMarketLegacy.sol`
  - pool-based predict/claim + new add/reduce position behavior.
- `src/core/Treasury.sol`
  - optional escrow helper.

## 3.2 Oracle

- `src/oracle/CREReceiver.sol`
- `src/oracle/OracleCoordinator.sol`
- `src/oracle/ReportValidator.sol`

## 3.3 Curation

- `src/curation/MarketDraftBoard.sol`
- `src/curation/DraftClaimManager.sol`
- `src/curation/MarketPolicy.sol` (V3: `lpExposureMultiplier` for risk cap = `minSeed * K`)
- `src/curation/CREPublishReceiver.sol`
- `src/curation/LiquidityVaultFactory.sol`

## 3.4 Execution + Liquidity

- `src/execution/ChannelSettlement.sol`
- `src/execution/OutcomeToken1155.sol` (V3: ERC-1155 outcome tokens; transfer-locked until resolved)
- `src/execution/MarketRiskManager.sol` (V3: LP payout cap + reservation)
- `src/execution/ExecutionLedger.sol` (deprecated for V3; kept for backward compat)
- `src/execution/CollateralVault.sol`
- `src/execution/MultiAssetVault.sol`
- `src/execution/CollateralVaultAdapter.sol`
- `src/execution/LiquidityVault4626.sol`

## 3.5 Fees

- `src/fees/FeeManager.sol`
- `src/fees/FeePool.sol`
- `src/fees/TreasuryPool.sol`

## 4) Trust Boundaries and Authority Model

## 4.1 Ingress trust

- `ReceiverTemplate` enforces sender forwarder and optional workflow metadata checks.
- `CREReceiver` only transforms payload routing and delegates trust to coordinator.

## 4.2 Routing trust

- `OracleCoordinator.submitResult/submitSession` only callable by configured `creReceiver`.
- `SettlementRouter.settleMarket/finalizeSession` only callable by configured `oracleCoordinator`.

## 4.3 Settlement trust

- `ChannelSettlement` trusts:
  - `operator` checkpoint signature
  - user signature list
  - nonce/challenge window constraints

## 4.4 Admin trust

- Owners can rewire coordinator/router/vault/fee endpoints and policy values.
- Critical owner-gated ops include:
  - `ReportValidator.setMinConfidence`
  - `Treasury.setMarketApproved`
  - registry/router/vault address setters across modules

## 5) Data Models (Current Implementation)

## 5.1 `MarketDraftBoard.Draft`

Stores:
- identity: `questionHash`, `questionURI`, `marketType`, `outcomesHash`, `outcomesURI`
- policy/time: `resolveSpecHash`, `tradingOpen`, `tradingClose`, `resolveTime`
- economics: `settlementAsset`, `minSeed`
- lifecycle: `status`, `creator`, `proposedAt`

Status lifecycle:
- `Proposed -> Claimed -> Published`
- or `Cancelled/Expired`

## 5.2 `MarketRegistry.Market`

Stores:
- creator and question
- timing: `tradingOpen`, `tradingClose`, `resolveTime`, `expiry`
- settlement: `settled`, `frozen`, `confidence`, winning outcome

Associated mappings:
- `settlementAssetByMarketId`
- `liquidityVaultByMarketId`
- typed market outcomes/windows and winning index
- `hasRedeemed[marketId][user]`
- `outcomeToken` (V3: optional; when set, redeem uses ERC-1155 `balanceOf` + `burnForRedeem` instead of `ExecutionLedger.positionOf`)

`status(marketId)` derivation:
- missing creator => `Draft`
- settled => `Resolved`
- frozen => `Frozen`
- else => `Open`

## 5.3 Checkpoint types

`ShadowTypes.Checkpoint`:
- `marketId`, `sessionId`, `nonce`
- `validAfter`, `validBefore`
- `lastTradeAt`
- `stateHash`, `deltasHash`, `riskHash`

`ShadowTypes.Delta`:
- `user`, `outcomeIndex`, `sharesDelta`, `cashDelta`
- V3: `sharesDelta` drives `OutcomeToken1155` mint/burn (positive=mint, negative=burn)

`ChannelSettlement.Pending`:
- pending nonce
- challenge deadline
- persisted hashes + `lastTradeAt`
- **V3-Escrow:** `settlementAsset`, `reserveUsers[]`, `reserveAmts[]`, `createdAt` (for reserve/release tracking and cancel timeout)

## 5.4 Vault states

**CollateralVault** and **MultiAssetVault** use 3-bucket escrow-safe accounting:

| Bucket | Semantic | Mutability |
|--------|----------|------------|
| `freeBalance` | Total units held in vault for user; backing both withdrawable and reserved | Increases on deposit; decreases on withdraw, lock, and (indirectly) applyCashDeltas debit |
| `reservedBalance` | Non-withdrawable portion backing pending checkpoint obligations | Increases on `reserve`, decreases on `release` (only ChannelSettlement) |
| `lockedBalance` | Per-session locked (optional; `marketId`, `sessionId`) | `lock`/`unlock` by ChannelSettlement |

**Withdraw constraint (why it works):**

```
availableBalance = max(0, freeBalance - reservedBalance)
withdraw(amount) succeeds iff amount <= availableBalance
```

If a user has signed a checkpoint with net debit `D > 0`, finalize will call `applyCashDeltas` to debit `D` from their free balance. Before finalize, we reserve `D` on submit. Thus:

- `D <= freeBalance` at submit (reserve reverts otherwise)
- `reservedBalance >= D` during the challenge window
- `availableBalance <= freeBalance - D`, so the user cannot withdraw the `D` units needed for settlement
- After finalize, we release the reserved amount; the debit has already reduced free balance

**LiquidityVault4626:** ERC-4626 shares and asset pool (per draft via factory deployment).

## 5.5 OutcomeToken1155 (V3)

- Token ID: `(marketId << 32) | outcomeIndex`
- Storage: `channelSettlement`, `marketRegistry`
- Transfer lock: user-to-user transfers only when `marketRegistry.status(marketId) == Resolved`; mint/burn always allowed.
- Mint/burn: `onlyChannelSettlement`
- `burnForRedeem`: `onlyMarketRegistry` (for redeem flow)

## 5.6 MarketRiskManager (V3)

- `maxLpPayout[marketId]`: cap per market
- `reservedLpPayout[marketId]`: cumulative reserved (incremented when LP owes traders)
- `reserveLpPayout(marketId, amount)`: `onlyChannelSettlement`; reverts if `reserved + amount > cap`

## 6) End-to-End Flows

## 6.1 Oracle outcome flow

```mermaid
sequenceDiagram
  participant F as Forwarder
  participant CR as CREReceiver
  participant OC as OracleCoordinator
  participant SR as SettlementRouter
  participant M as Market Receiver

  F->>CR: onReport(metadata, report)
  CR->>OC: submitResult(market, marketId, outcome, confidence)
  OC->>OC: optional validate(confidence)
  OC->>SR: settleMarket(...)
  SR->>M: onReport('', 0x01 || abi.encode(...))
  M->>M: resolve
```

Receivers currently used:
- `MarketRegistry` (execution lane)
- `PoolMarketLegacy` (legacy lane)

## 6.2 Curated claim-and-seed + publish flow

```mermaid
sequenceDiagram
  participant AI as AI proposer
  participant DB as DraftBoard
  participant Maker as Claimer
  participant DCM as DraftClaimManager
  participant LVF as LiquidityVaultFactory
  participant CPR as CREPublishReceiver
  participant MF as MarketFactory
  participant MR as MarketRegistry
  participant RM as MarketRiskManager

  AI->>DB: proposeDraft(..., settlementAsset, minSeed)
  Maker->>DCM: claimAndSeed(draftId, asset, seed, sig)
  DCM->>LVF: createVaultForDraft(draftId, asset)
  DCM->>DCM: deposit to LiquidityVault4626, lock metadata, setClaimed

  CPR->>CPR: verify creator signature + draft claimed
  CPR->>MF: createFromDraft(draftId, creator, params)
  MF->>MR: create*ForWithFullParams(..., settlementAsset)
  MF->>MR: setLiquidityVault(marketId, vaultByDraft)
  MF->>RM: setMaxLpPayout (V3)
  MF->>DB: markPublished(draftId, marketId)
```

Important current behavior:
- `createFromDraft` uses draft settlement asset and full timing params.
- Liquidity vault binding depends on `DraftClaimManager` being configured in factory and a nonzero vault for draft.
- V3: When `riskManager` and `liquidityVault` are set, `riskManager.setMaxLpPayout(marketId, draft.minSeed * marketPolicy.lpExposureMultiplier())` is called. Default multiplier is 3.

## 6.3 Checkpoint settlement flow

```mermaid
sequenceDiagram
  participant SR as SettlementRouter
  participant CS as ChannelSettlement
  participant OT as OutcomeToken1155
  participant RM as MarketRiskManager
  participant TV as Trading Vault (MAV/CV)
  participant LV as LiquidityVault4626
  participant FP as FeePool

  SR->>CS: submitCheckpointFromPayload(...)
  Note over CS: If challenge: release old pending reserves first
  CS->>CS: store pending + challenge window
  CS->>CS: _computeReserves (fee-adjusted net debit per user)
  CS->>TV: reserve(user, amount) per debtor
  CS->>CS: store reserveUsers, reserveAmts, createdAt
  Note over CS: --- Challenge window ---
  CS->>CS: finalizeCheckpoint(...)
  CS->>OT: mint/burn sharesDelta per delta
  CS->>CS: _applyCashDeltasAndFees (accounting invariant)
  CS->>TV: apply net cash deltas (post fee split)
  alt netTraderDelta > 0
    CS->>CS: solvency check (bal >= need)
    CS->>RM: reserveLpPayout(marketId, need)
    CS->>LV: payToTradingLedger
  else netTraderDelta < 0
    CS->>TV: transfer to LV
  end
  CS->>TV: protocol/lp/creator fee routing transfers
  CS->>FP: record protocol fee
  CS->>TV: release pending reserves
  CS->>CS: delete pending
```

**Submit path (V3-Escrow):** After validating signatures and storing pending, ChannelSettlement resolves the settlement asset, computes per-user reserves (see §7.4), calls `vault.reserve(user, amount)` for each user with net debit, and stores the reserve arrays and `createdAt`. On challenge (replacement), old reserves are released before new ones are applied.

**Finalize path:** After applying cash deltas and fee routing, ChannelSettlement calls `_releasePendingReserves` before deleting the pending record. This releases the amounts reserved at submit so users regain available balance.

**Cancel escape hatch:** `cancelPendingCheckpoint(marketId, sessionId)` is callable by anyone once `block.timestamp >= createdAt + CANCEL_DELAY` (6 hours). It releases reserves and deletes the pending, allowing users to withdraw again if the relayer never finalized.

V3: If `outcomeToken == 0`, falls back to `ExecutionLedger.applyDeltas` (backward compat). Constructor may pass `ledger = address(0)` when using OutcomeToken.

## 6.4 Redeem flow

- User calls `MarketRegistry.redeem(marketId)`.
- Registry resolves winning outcome index.
- **V3 (outcomeToken set):** Reads `outcomeToken.balanceOf(user, tokenId)` where `tokenId = outcomeToken.id(marketId, winningOutcome)`. If positive and not redeemed before: sets `hasRedeemed`, calls `outcomeToken.burnForRedeem(user, marketId, winningOutcome, shares)`, then payout from vault.
- **Legacy (outcomeToken not set):** Reads `ExecutionLedger.positionOf(user, marketId, winningOutcome)`. If positive and not redeemed before, pays from vault.
- Payout source:
  - `MultiAssetVault.redeemPayout(user, asset, amount)` if configured
  - else `CollateralVault.redeemPayout(user, amount)`.

## 7) Detailed Contract Mechanics

## 7.1 `DraftClaimManager` (new economics path)

New path:
- `claimAndSeed(draftId, asset, seedAmount, deadline, sig)`
- Enforces:
  - draft must be `Proposed`
  - signature validity on typed `ClaimAndSeed`
  - liquidity vault factory configured
  - `seedAmount >= draft.minSeed`
  - asset matches draft settlement asset (if set)
- Actions:
  - deploy/get per-draft `LiquidityVault4626`
  - pull tokens from claimer to manager
  - approve + deposit into vault on behalf of claimer
  - store claim and lock metadata
  - call `draftBoard.setClaimed`

Legacy path still present:
- `claimDraft(...)` without seed deposit.

## 7.2 `LiquidityVaultFactory` + `LiquidityVault4626`

Factory:
- idempotent vault deployment per `draftId`
- callable by any address

Vault:
- ERC-4626 wrapper over one asset
- settlement hook `payToTradingLedger(to, amount)` only callable by configured `channelSettlement`

## 7.3 `MarketFactory.createFromDraft`

Current curated creation behavior:
- gated by `approvedPublishReceivers`
- reads draft settlement asset
- resolves timing from params with fallback to draft fields
- uses full-param create functions in `MarketRegistry`
- if draft has liquidity vault in `DraftClaimManager`, calls `marketRegistry.setLiquidityVault`
- **V3:** if `riskManager != 0` and `liquidityVault != 0`, calls `riskManager.setMaxLpPayout(marketId, draft.minSeed * marketPolicy.lpExposureMultiplier())`. Requires `marketFactory` set on `MarketRiskManager` for `setMaxLpPayout` to succeed.
- marks draft published and maps `draftIdByMarketId`

CRE feed creation behavior (non-curated):
- still supports v1/v2 market input payloads (`0x02` for v2 typed)
- creates markets via `PREDICTION_MARKET` interface target (now often `PoolMarketLegacy` in tests)

## 7.4 `ChannelSettlement` fee and net-flow model

### Cash delta and fee math (same for reserve and finalize)

For each `Delta` with nonzero `cashDelta`:

- If `cashDelta > 0`: fee applies. `FeeManager.computeSplit(cashDelta)` returns `totalFee = profit * protocolFeeBps / 10000`, `netDelta = profit - totalFee` (with `profit = cashDelta`). Fee is split into protocol/lp/creator buckets; only `netDelta` affects the trader.

- If `cashDelta <= 0`: no fee; `netDelta = cashDelta`.

Per-user net cash is the sum of all net deltas for that user in the checkpoint.

### Reserve computation (`_computeReserves`)

Reserve must cover the amount that will be debited at finalize. That equals the fee-adjusted net cash debit:

`reserve_u = max(0, -netCash_u)` where `netCash_u = sum(netDelta_i)` over all deltas for user `u`, and `netDelta_i` uses the same fee logic as `_applyCashDeltasAndFees`. **Why it works:** finalize debits exactly `netCash_u` from each user (via `applyCashDeltas`). If `netCash_u < 0`, we debit `|netCash_u|`. By reserving that amount on submit, the user cannot withdraw it during the challenge window, so the debit at finalize cannot fail for insufficient balance.

**Implementation:** `_computeReserves` iterates deltas, aggregates per-user net (with `computeSplit` for positive deltas), and returns `(users[], amts[])` for users with \(\text{netCash} < 0\). Bounded by `MAX_DELTAS=256` and `MAX_USERS=256`.

### Cash deltas and finalize

During `_applyCashDeltasAndFees`:
- determines settlement asset via registry (`getSettlementAsset`) in multi-asset mode.
- for each positive trader `cashDelta`, calls `FeeManager.computeSplit`.
- accumulates `protocolFee`, `lpFee`, `creatorFee`.
- applies net `cashDelta` set to trading vault.
- computes `netTraderDelta = sum(net cash deltas)`.
- **V3:** enforces accounting invariant: `rawSum == netTraderDelta + int256(feesTotal)`; reverts `BadCashAccounting` otherwise.

During `finalizeCheckpoint`:
- settlement invariants checked.
- **Share deltas:** if `outcomeToken != 0`, calls `_applyShareDeltasAs1155` (mint for positive `sharesDelta`, burn for negative). Else if `LEDGER != 0`, calls `LEDGER.applyDeltas`.
- applies cash deltas and fee accounting.
- reads market liquidity vault from registry.
- if liquidity vault exists and `netTraderDelta > 0`:
  - **V3:** explicit solvency check: `IERC20(settlementAsset).balanceOf(lpVault) >= need`; reverts `LpVaultInsolvent(need, bal)` otherwise.
  - **V3:** if `riskManager != 0`, calls `riskManager.reserveLpPayout(marketId, need)` (reverts `RiskCapExceeded` if reserved + amount > cap).
  - LP vault pays trading vault via `payToTradingLedger`.
- if liquidity vault exists and `netTraderDelta < 0`: trading vault pays LP vault.
- routes fees:
  - protocol fee -> `FeePool` (if configured and channel is feeCollector)
  - lp fee -> LP vault donation if LP shares exist, else fallback to treasury
  - creator fee -> market creator address

## 7.5 `FeeManager` split semantics

- `protocolFeeBps` is total fee rate cap-limited to 2%.
- fee split percentages:
  - `lpFeeShareBps`
  - `creatorFeeShareBps`
  - remainder goes to protocol bucket
- `computeSplit` returns `(protocolFee, lpFee, creatorFee, netDelta)`.

## 7.6 `PoolMarketLegacy` trading update

New behavior versus old one-shot model:
- users can add to existing same-outcome position.
- cannot add directly to opposite outcome without reducing first.
- new reducers:
  - `reducePosition`
  - `reduceAll`
  - typed equivalents
- prediction claim remains pro-rata pool payout post-settlement.

## 8) Access-Control Matrix (Current)

| Contract | Operation | Guard |
|---|---|---|
| `ReportValidator` | `setMinConfidence` | `onlyOwner` |
| `Treasury` | `setMarketApproved` | `onlyOwner` |
| `OracleCoordinator` | `submitResult/submitSession` | `msg.sender == creReceiver` |
| `SettlementRouter` | `settleMarket/finalizeSession` | `msg.sender == oracleCoordinator` |
| `SettlementRouter` | market settlement target | optional allowlist |
| `MarketRegistry` | `resolve` | `msg.sender == settlementRouter` |
| `MarketRegistry` | createFor/withParams + setLiquidityVault | `msg.sender == marketFactory` |
| `OutcomeToken1155` | `mint`, `burn` | `msg.sender == channelSettlement` |
| `OutcomeToken1155` | `burnForRedeem` | `msg.sender == marketRegistry` |
| `MarketRiskManager` | `setMaxLpPayout` | `msg.sender == owner` or `msg.sender == marketFactory` |
| `MarketRiskManager` | `reserveLpPayout` | `msg.sender == channelSettlement` |
| `ExecutionLedger` | `applyDeltas` | `msg.sender == channelSettlement` (deprecated when OutcomeToken used) |
| `CollateralVault` | mutating settlement functions, reserve, release | `msg.sender == channelSettlement` |
| `MultiAssetVault` | mutating settlement functions, reserve, release | `msg.sender == channelSettlement` |
| `LiquidityVault4626` | `payToTradingLedger` | `msg.sender == channelSettlement` |
| `MarketDraftBoard` | propose draft | `AI_ORACLE_ROLE` |
| `MarketDraftBoard` | mark published | `PUBLISH_CALLER_ROLE` |

## 9) Invariants Enforced in Code Today

1. Checkpoint signer coverage
- every delta user must be signed.
- duplicate signer list entries are rejected.

2. Nonce monotonicity + challenge window
- stale/replayed checkpoint nonces rejected.
- finalize before challenge deadline rejected.

3. Market close boundary
- `lastTradeAt > tradingClose` rejected at finalize.

4. Resolution authority
- direct unauthorized market resolve rejected.

5. Fee cap
- total fee bps capped in `FeeManager`.

6. Typed market bounds
- outcome/windows cardinality and index validity enforced.

7. **V3:** Accounting invariant
- `rawSum == netTraderDelta + feesTotal` in `_applyCashDeltasAndFees`; reverts `BadCashAccounting` otherwise.

8. **V3:** LP solvency
- before LP pays (`netTraderDelta > 0`): `lpVault.balanceOf(settlementAsset) >= need`; reverts `LpVaultInsolvent(need, bal)` otherwise.

9. **V3:** Risk cap
- `reservedLpPayout[marketId] + amount <= maxLpPayout[marketId]` in `reserveLpPayout`; reverts `RiskCapExceeded` otherwise.

10. **V3:** OutcomeToken transfer lock
- user-to-user transfers only when `marketRegistry.status(marketId) == Resolved`; reverts `TransferLocked` otherwise.

11. **V3-Escrow:** Withdraw ≤ availableBalance
- `withdraw(amount)` requires `amount ≤ freeBalance - reservedBalance`; reverts `InsufficientAvailableBalance` otherwise.

12. **V3-Escrow:** Reserve/release only by ChannelSettlement
- `reserve` and `release` callable only by configured `channelSettlement`.

13. **V3-Escrow:** Replace releases before reserve
- On `challengeCheckpoint`, old pending reserves are released before new reserves are applied; no reserve leak.

## 10) ChangesTarget2 Mapping (Current)

## 10.1 Implemented

- Draft includes `settlementAsset` + `minSeed`.
- `claimAndSeed` path implemented with ERC-4626 deposit.
- Per-draft liquidity vault deployment (`LiquidityVaultFactory`).
- Market creation binds to full timing params in curated flow.
- Registry stores `liquidityVaultByMarketId`.
- Settlement includes:
  - net trader delta reconciliation with LP vault
  - protocol/lp/creator fee split routing
- Pool market supports add/reduce/switch flow for positions.

## 10.2 Partial

- Claim = seed is not mandatory globally:
  - legacy `claimDraft` still allows draft claim without seed.
  - publish path requires SEEDED when `draftClaimManager` configured (see §14.3).

- Multi-asset routing is implemented in settlement/redemption but not fully universal across all non-curated creation inputs.

## 10.3 V3 Implemented (2026-03-01)

- **OutcomeToken1155:** ERC-1155 outcome positions; transfer-locked until market resolved.
- **MarketRiskManager:** LP payout cap per market; `reserveLpPayout` enforces `reserved + amount <= cap`.
- **Accounting invariant:** `rawSum == netTraderDelta + feesTotal` in `_applyCashDeltasAndFees`.
- **LP solvency check:** Explicit `LpVaultInsolvent(need, have)` before LP pays.
- **Redeem burn path:** When `outcomeToken` set, redeem reads `balanceOf` and calls `burnForRedeem`.
- **createFromDraft risk cap:** `riskManager.setMaxLpPayout(marketId, minSeed * lpExposureMultiplier)` when both configured.
- **MarketPolicy.lpExposureMultiplier:** Default 3; configurable.

**V3-Escrow (2026-03-01):**
- **3-bucket vaults:** `freeBalance`, `reservedBalance`, `availableBalance`; withdraw enforces `amount ≤ availableBalance`.
- **Reserve on submit:** `_computeReserves` matches `_applyCashDeltasAndFees` fee logic; reserves `max(0, -netCash)` per user.
- **Release on finalize/cancel:** `_releasePendingReserves` before delete; `cancelPendingCheckpoint` after `CANCEL_DELAY` (6 hours).
- **Replace safety:** Challenge releases old reserves before applying new ones.

## 10.4 Missing relative to broader target vision

- Resolution dispute manager (`ResolutionManager`) with bond/evidence/challenge lifecycle.
- Checkpoint v2 transcript fields (`epoch/accountsRoot/txRoot/prevStateHash/policyHash`).
- ~~Risk sentinel/manager enforcement hooks.~~ **V3:** MarketRiskManager implements cap + reservation.
- CCIP gateway + market mirror cross-chain modules.

## 11) Current Risks / Technical Debt (Implementation-Exact)

1. ~~LP solvency depends on vault funding presence~~ **V3 resolved:** Explicit `LpVaultInsolvent` revert before LP pays; solvency checked onchain.

2. ~~If no liquidity vault bound to market, net trader delta reconciliation step is skipped.~~ Unchanged: LP step skipped when no vault; `usesLpVaultByMarketId` still enforces vault presence when flagged.

3. Seed lock
- `unlockSeedShares` transfers vault shares from manager to claimer; custody-enforced (see §14.4). No transfer restriction on ERC-4626 shares themselves.

4. Draft claim path duality
- `claimDraft` and `claimAndSeed` coexist; policy does not force seeded claims in publish flow.

5. Session routing event semantics
- `SettlementRouter.finalizeSession` emits `MarketSettled(address(0),0,0,0)` placeholder event rather than dedicated session route event.

6. `LiquidityVaultFactory.createVaultForDraft` is open callable
- idempotent and safe in practice, but not role-restricted.

## 12) Test Coverage Snapshot

Covered by current tests:

- Security hardening: `test/SecurityHardening.t.sol`
- Checkpoint validity/lifecycle: `test/CheckpointFlow.t.sol` (V3: uses OutcomeToken)
- Fee extraction basics: `test/FeeFlow.t.sol`
- Curated flow + claimAndSeed path: `test/CurationFlow.t.sol`
- Oracle ingress/routing: `test/OracleFlow.t.sol`
- Typed market creation: `test/MarketTypes.t.sol`
- Legacy session finalization fallback: `test/YellowSessionFlow.t.sol`
- Pool add/reduce/switch position behavior: `test/PoolMarketTrading.t.sol`
- **V3:** ERC-1155 mint/burn, transfer lock, redeem burn: `test/OutcomeTokenFlow.t.sol`
- **V3:** Risk cap, reserve within/exceed: `test/RiskManagerFlow.t.sol`
- **V3:** E2E with OutcomeToken: `test/E2EDeployTestnet.t.sol`
- **V3-Escrow:** Reserve/release, withdraw blocked, cancel: `test/EscrowFlow.t.sol`

## 13) Practical Current Production Path

For this architecture state (V3), the intended lane is:

1. Curated draft proposal with settlement asset and min seed.
2. Prefer `claimAndSeed` (not legacy claim) so liquidity vault exists.
3. Publish via `CREPublishReceiver` -> `MarketFactory.createFromDraft` (sets risk cap when `riskManager` configured).
4. Trade offchain, settle checkpoints through `ChannelSettlement` (mint/burn `OutcomeToken1155`, reserve LP payout).
5. Resolve via oracle path into `MarketRegistry`.
6. Redeem through registry: burns winning outcome tokens, pays from configured vault path.

This document describes current onchain behavior exactly as implemented in this repository state.

---

## 14) 2026-03-01 V3 Extension (Polymarket-like ERC1155 + Risk Reservation)

Date of verification: 2026-03-01  
Validation rerun on this state: `forge test -q` passes.

This section extends the document with V3 implementation-exact details.

## 14.1 Scope Clarification

There are effectively two production-relevant lanes and one compatibility lane:

1. **Primary lane (V3, recommended):**  
`MarketDraftBoard -> DraftClaimManager.claimAndSeed -> CREPublishReceiver -> MarketFactory.createFromDraft -> MarketRegistry -> ChannelSettlement -> OutcomeToken1155 (mint/burn) + MarketRiskManager (reserve) -> (MultiAssetVault or CollateralVault) -> redeem (burn 1155, payout)`

2. Oracle resolution lane:  
`CREReceiver -> OracleCoordinator -> SettlementRouter -> MarketRegistry.onReport(0x01...)`

3. Legacy compatibility lane (kept for demo/backward compatibility):  
`PoolMarketLegacy` + optional `SessionFinalizer`

## 14.2 Concrete Wiring Requirements (V3 Deployment Truth)

For curated + checkpoint lane to work end-to-end with V3, these links must be set:

**New V3 contracts:**
- Deploy `OutcomeToken1155`, `MarketRiskManager`
- `OutcomeToken1155.setChannelSettlement(ChannelSettlement)`, `OutcomeToken1155.setMarketRegistry(MarketRegistry)`
- `MarketRiskManager.setChannelSettlement(ChannelSettlement)`, `MarketRiskManager.setMarketFactory(MarketFactory)`

**ChannelSettlement / MarketRegistry (V3 path):**
- `ChannelSettlement(vault, address(0), operator)` — ledger may be 0 when OutcomeToken used
- `MarketRegistry(vault, address(0))` — ledger may be 0 when OutcomeToken used
- `ChannelSettlement.setOutcomeToken(OutcomeToken1155)`, `ChannelSettlement.setRiskManager(MarketRiskManager)`
- `MarketRegistry.setOutcomeToken(OutcomeToken1155)`

**Existing links:**
- `MarketRegistry.marketFactory = MarketFactory`
- `MarketRegistry.settlementRouter = SettlementRouter`
- `MarketRegistry.multiAssetVault` optional, but if set then `setDefaultSettlementAsset` should also be set
- `CollateralVault.channelSettlement = ChannelSettlement`
- `CollateralVault.marketRegistry = MarketRegistry` (for redeem)
- if using MAV: `MultiAssetVault.channelSettlement = ChannelSettlement` and `MultiAssetVault.marketRegistry = MarketRegistry`
- `ChannelSettlement.marketRegistry = MarketRegistry`
- optional fee lane: `ChannelSettlement.feeManager`, `ChannelSettlement.feePool`, `FeePool.feeCollector = ChannelSettlement`
- `SettlementRouter.oracleCoordinator = OracleCoordinator`
- optional `SettlementRouter.channelSettlement` for checkpoint payload routing
- fallback-only `SettlementRouter.sessionFinalizer` if no `channelSettlement`
- `OracleCoordinator.creReceiver = CREReceiver`
- `OracleCoordinator.settlementRouter = SettlementRouter`
- optional `OracleCoordinator.reportValidator = ReportValidator`
- curated lane:
  - `MarketFactory.marketRegistry = MarketRegistry`
  - `MarketFactory.draftBoard = MarketDraftBoard`
  - `MarketFactory.draftClaimManager = DraftClaimManager`
  - `MarketFactory.marketPolicy = MarketPolicy` (for `lpExposureMultiplier`)
  - `MarketFactory.riskManager = MarketRiskManager`
  - `MarketFactory.approvedPublishReceivers[CREPublishReceiver] = true`
  - `MarketDraftBoard.draftClaimManager = DraftClaimManager`
  - `MarketDraftBoard.PUBLISH_CALLER_ROLE` granted to `MarketFactory`
  - `DraftClaimManager.liquidityVaultFactory = LiquidityVaultFactory`

**Removed for V3:** `ExecutionLedger` not required when OutcomeToken path used.

## 14.3 `createFromDraft` Is Now Strictly Seed-Gated (When ClaimManager Is Configured)

Behavior in current code:

- caller must be approved publish receiver (`UnauthorizedPublishReceiver` otherwise)
- curated path must be configured (`CuratedPathNotConfigured` otherwise)
- draft times in payload cannot override draft (`DraftTimeMismatch`)
- if `draftClaimManager` is set, claim type must be `SEEDED` (`SeededClaimRequired`)
- if draft has `minSeed > 0`, liquidity vault must exist (`SeededClaimRequired`)
- if vault asset and draft settlement asset differ, revert (`InvalidLiquidityVaultAsset`)
- on success:
  - market created with full params from draft times
  - vault bound via `MarketRegistry.setLiquidityVault`
  - **V3:** if `riskManager != 0` and `liquidityVault != 0`, `riskManager.setMaxLpPayout(marketId, draft.minSeed * marketPolicy.lpExposureMultiplier())`. `MarketPolicy.lpExposureMultiplier` defaults to 3.
  - draft marked published and reverse-linked via `draftIdByMarketId`

This is stricter than older behavior described earlier in this doc.

## 14.4 Seed Locking Is Onchain-Enforced at Share Custody Level

Current `DraftClaimManager.claimAndSeed` flow:

- transfers seed asset from claimer to manager
- deposits into vault with receiver = `DraftClaimManager` (not claimer)
- stores `seedSharesLocked[draftId]` and `seedUnlockTime[draftId]`
- unlock path transfers vault shares from manager to claimer only after unlock time

So seed lock is no longer metadata-only; shares are actually custody-locked in manager until `unlockSeedShares`.

## 14.5 Checkpoint Pipeline: Exact Guarantees

`ChannelSettlement` enforces:

- bounded payload (`MAX_DELTAS=256`, `MAX_USERS=256`)
- `users.length == userSigs.length`
- `hash(deltas) == cp.deltasHash`
- validity window (`validAfter`, `validBefore`)
- operator signature must recover to configured `operator`
- every user signature must recover over checkpoint digest
- `users` must be unique
- every delta user must appear in `users`
- nonce strictly increasing over finalized nonce
- challenge constraints:
  - pending must exist
  - within challenge window
  - replacement nonce must be newer than pending nonce

**Submit (V3-Escrow):** if `isChallenge`, release old pending reserves first; then resolve settlement asset, compute reserves via `_computeReserves`, call `vault.reserve` per debtor, store `reserveUsers`, `reserveAmts`, `createdAt`.

Finalize enforces:

- pending exists and challenge window has elapsed
- finalize deltas hash equals stored pending hash
- if registry is set:
  - market must not be resolved
  - `lastTradeAt <= tradingClose` when `tradingClose != 0`
- **V3:** applies share deltas: if `outcomeToken != 0`, `_applyShareDeltasAs1155` (mint for positive `sharesDelta`, burn for negative). Else if `LEDGER != 0`, `LEDGER.applyDeltas`.
- then cash deltas + fees (with accounting invariant: `rawSum == netTraderDelta + feesTotal`)
- then LP counterparty: if `netTraderDelta > 0`, **V3:** solvency check + `riskManager.reserveLpPayout` (if riskManager set) + `payToTradingLedger`. If `netTraderDelta < 0`, transfer to LP vault.
- then protocol/lp/creator fee routing
- **V3-Escrow:** calls `_releasePendingReserves(k)` to release reserved amounts before clearing pending
- writes finalized nonce and clears pending

## 14.6 Cash and Fee Semantics (Current Math)

Fee logic (`FeeManager`) on positive `cashDelta` only:

- `totalFee = profit * protocolFeeBps / 10000`
- split of `totalFee`:
- protocol bucket: `1 - lpShare - creatorShare`
- LP bucket: `lpFeeShareBps`
- creator bucket: `creatorFeeShareBps`
- trader net cash delta = `profit - totalFee`

No fee applied to zero/negative trader deltas.

`ChannelSettlement` aggregates per-checkpoint:

- `protocolFee`, `lpFee`, `creatorFee`
- `netTraderDelta = sum(net trader cash deltas)`

Then:

- if LP vault exists:
- `netTraderDelta > 0`: LP vault pays trading vault (`payToTradingLedger`)
- `netTraderDelta < 0`: trading vault transfers asset to LP vault
- protocol fee:
- transferred to `FeePool` only when `feePool.feeCollector == ChannelSettlement`
- LP fee:
- donated to LP vault when LP vault exists and has `totalSupply > 0`
- otherwise fallback to treasury pool (if configured)
- creator fee:
- transferred to market creator (if non-zero creator)

## 14.7 Escrow-Safe Vault Semantics (V3-Escrow)

### Threat model addressed

Without reserve-on-submit, a user could:
1. Sign a checkpoint with net debit `D` (e.g. trade cost).
2. Call `withdraw(freeBalance)` before finalize.
3. Finalize would try to debit `D` and revert (insufficient balance) or grief settlement.

By reserving `D` on submit, `availableBalance = freeBalance - reservedBalance` becomes at most `freeBalance - D`. The user cannot withdraw the `D` units needed for settlement.

### Math

**Per-user net cash (identical in `_computeReserves` and `_applyCashDeltasAndFees`):**

For each delta for user `u`:
- If `cashDelta > 0`: `net_i = FeeManager.computeSplit(cashDelta)` (4th return; fee-adjusted)
- If `cashDelta <= 0`: `net_i = cashDelta` (no fee)

`netCash_u = sum(net_i)` over all deltas for user `u`.

**Reserve:** `reserve_u = max(0, -netCash_u)`. Only debtors are reserved; creditors need no reserve.

**Why it matches finalize:** `applyCashDeltas` receives the same `(users[], cashDeltas[])` where each `cashDeltas[j]` is the fee-adjusted net. For a debit, `cashDeltas[j] < 0` and the vault subtracts \(|\text{cashDeltas[j]}|\) from `freeBalance`. The reserve exactly covers that debit.

### Lifecycle

1. **Submit:** Compute reserves, call `vault.reserve(u, asset, amount)` for each debtor, store in `Pending`.
2. **Challenge window:** User cannot withdraw reserved amount; settlement cannot be griefed.
3. **Finalize:** Apply share deltas, apply cash deltas (debits succeed because reserved), release reserves, delete pending.
4. **Cancel:** After `CANCEL_DELAY` (6 hours), anyone can call `cancelPendingCheckpoint`; reserves released, pending cleared.

## 14.8 LP Solvency Safety Flag

`MarketRegistry.setLiquidityVault` sets:

- `liquidityVaultByMarketId[marketId] = vault`
- `usesLpVaultByMarketId[marketId] = true` if vault non-zero (sticky flag)

`ChannelSettlement.finalizeCheckpoint` then enforces:

- if `usesLpVaultByMarketId == true` and current `liquidityVaultByMarketId == 0`, revert `LiquidityVaultRequired`
- **V3:** before LP pays when `netTraderDelta > 0`: `IERC20(settlementAsset).balanceOf(lpVault) >= need`; else revert `LpVaultInsolvent(need, bal)`
- **V3:** if `riskManager` set, `reserveLpPayout(marketId, need)` before LP pays; reverts `RiskCapExceeded` if `reserved + need > cap`

This prevents silently finalizing LP-designated markets without a bound LP vault and enforces onchain solvency.

## 14.9 Settlement Asset Resolution Logic

`MarketRegistry.getSettlementAsset(marketId)` precedence:

1. explicit `settlementAssetByMarketId[marketId]`
2. if `multiAssetVault != 0` and `defaultSettlementAsset != 0`, use default
3. fallback to `CollateralVault.token()`

Implication: if MAV is used without per-market asset and without default asset, flows can still fall back to vault token semantics through existing compatibility assumptions.

## 14.10 Curated Security Model (EIP-712 Paths)

`DraftClaimManager` signatures:

- `ClaimDraft(...)` typed EIP-712 with user nonce
- `ClaimAndSeed(...)` typed EIP-712 with user nonce

`CREPublishReceiver` signatures:

- `PublishFromDraft(draftId, paramsHash, chainId, nonce)` typed EIP-712
- signer must match `creator == claimer(draftId)`
- nonce increments per creator

Receiver-level authenticity:

- `CREPublishReceiver` and `CREReceiver` inherit `ReceiverTemplate`
- forwarder check enforced unless intentionally disabled
- optional workflow metadata checks available (`workflowId`, `author`, `workflowName`)

## 14.11 MarketRegistry Lifecycle Nuances

- `freeze(marketId)` is permissionless and only sets frozen when `block.timestamp >= tradingClose`
- `resolve` restricted to settlement router
- `onReport` also restricted to settlement router and expects `0x01` report prefix
- typed outcome bound checks are enforced at resolve
- **V3:** `redeem` is one-shot per `(marketId, user)`. When `outcomeToken` set: reads `outcomeToken.balanceOf(user, tokenId)`, calls `outcomeToken.burnForRedeem(user, marketId, winningOutcome, shares)`, then pays from vault. Else reads winning `shares` from `ExecutionLedger`.

Payout source in redeem:

- MAV path if configured
- else single-asset vault path

## 14.12 Legacy Pool Lane: Current Intent

`PoolMarketLegacy` currently supports:

- binary + categorical + timeline market creation
- additive same-outcome position updates
- explicit position reduction (`reducePosition`, `reduceAll`, typed variants)
- settlement via `onReport(0x01 || abi.encode(...))`
- pro-rata payout from pooled collateral

This lane remains functional but is not the recommended production lane for checkpoint-based settlement architecture.

## 14.13 Session Routing Behavior

`SettlementRouter.finalizeSession(payload)`:

- only callable by `oracleCoordinator`
- if `channelSettlement` configured:
- decodes checkpoint payload
- forwards to `submitCheckpointFromPayload`
- emits `SessionPayloadRouted(..., routeType=1)`
- else if `sessionFinalizer` configured:
- forwards raw payload to finalizer
- emits `SessionPayloadRouted(..., routeType=0)`
- else revert `InvalidAddress`

`onlySessionFinalizer` modifier exists but is currently unused in function entrypoints.

## 14.14 Test-Backed Guarantees (Current)

From current tests:

- `CheckpointFlow.t.sol`: hash mismatch, bad sigs, nonce monotonicity, challenge window checks; **V3:** uses OutcomeToken for share deltas
- `OutcomeTokenFlow.t.sol`: **V3:** mint on positive sharesDelta, burn on negative, transfer lock pre-resolution, transfer allowed post-resolution, redeem burns and pays, insufficient balance reverts
- `RiskManagerFlow.t.sol`: **V3:** reserve within cap, reserve exceeds cap reverts
- `SecurityHardening.t.sol`: unsigned delta user rejection, unauthorized resolve rejection, post-close trade timestamp rejection
- `CurationFlow.t.sol`: seeded publish requirement, draft-time mismatch rejection, share lock custody in manager, wrong-asset precreate replacement handling, unlock gating
- `FeeFlow.t.sol` + `FuzzFeeSplit.t.sol`: fee split math and boundary behavior; accounting invariant
- `InvariantSolvency.t.sol`: LP vault requirement and settlement solvency invariants
- `SessionRouting.t.sol`: session payload routing and emitted route events
- `OracleFlow.t.sol`: CRE -> coordinator -> router -> market settlement flow
- `PoolMarketTrading.t.sol`: add/reduce/switch position behavior in legacy lane
- `E2EDeployTestnet.t.sol`: **V3:** full stack with OutcomeToken + MarketRiskManager, redeem via 1155 burn; **V3-Escrow:** MAV withdraw blocked during checkpoint window
- `EscrowFlow.t.sol`: **V3-Escrow:** withdraw blocked by reserve, release on finalize, replace releases old reserves, cancel escape hatch, reserve matches fee split

## 14.15 Operational Checklist (Recommended)

Before enabling production traffic (V3):

1. Keep `ReceiverTemplate` forwarder validation enabled on all receiver contracts.
2. Configure `draftClaimManager` in `MarketFactory` to enforce seeded publish path.
3. Set and verify `LiquidityVaultFactory.channelSettlement`.
4. Set `MarketRegistry.defaultSettlementAsset` when using MAV and markets may omit explicit asset.
5. Wire `FeePool.feeCollector = ChannelSettlement` or protocol fee collection events will not represent actual custody moves.
6. Disable/avoid legacy lane routing in production if not needed.
7. Keep `ReportValidator.minConfidence` at policy-approved threshold.
8. **V3:** Deploy and wire `OutcomeToken1155`, `MarketRiskManager` per §14.2.
9. **V3:** Set `MarketPolicy.lpExposureMultiplier` (default 3) or accept default.
10. **V3:** Ensure `MarketRiskManager.marketFactory` set for `createFromDraft` to call `setMaxLpPayout`.
11. **V3-Escrow:** `CANCEL_DELAY` is 6 hours; stuck pending checkpoints can be cancelled by anyone after this window to release reserves.

## 14.16 Superseded/Ambiguous Earlier Notes

The following earlier statements in this document should now be interpreted with this addendum:

- Earlier note saying seed lock is metadata-only is no longer accurate for current code; lock is custody-enforced via manager-held vault shares.
- Earlier note saying publish accepts claimed drafts regardless of seeded path is no longer accurate when `MarketFactory.draftClaimManager` is configured; `SEEDED` claim is enforced by `createFromDraft`.
- **V3:** ExecutionLedger is deprecated for primary lane; OutcomeToken1155 is canonical. Redeem reads from OutcomeToken when set.
- **V3:** LP solvency risk is mitigated by explicit `LpVaultInsolvent` check and `MarketRiskManager` cap.
- **V3-Escrow:** User withdraw griefing during checkpoint challenge window is prevented by reserve-on-submit; reserve computation matches finalize fee logic in `_computeReserves`.

This addendum is the source of truth for the 2026-03-01 repository state.
