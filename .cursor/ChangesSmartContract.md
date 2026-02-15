Alright — **smart contracts only**, deep and “institution-ready.” I’m going to treat your current ShadowPool as **two products in one repo**:

1. **Classic onchain PM** (your `PredictionMarket` pools + `claim()`), and
2. **ShadowPool execution layer** (Yellow sessions → signed state → onchain enforcement).

For ShadowPool to be the execution layer that RetroPick plugs into, you want **(2) to become first-class**, and (1) becomes a demo / fallback mode.

Your own spec already states the boundary clearly: **pricing + LS-LMSR state evolution is offchain; onchain validates state transitions and enforces settlement without recomputing curve math**. 

Below is the contract architecture I’d ship for Phase 1, and what to change in your current contracts to get there.

---

## 1) What’s structurally “wrong” today (from a protocol POV)

### A) `SessionFinalizer` is not enforceable settlement — it’s “arb payout”

Right now, the backend + users sign a list of `(participant, balance)` and the contract transfers those balances.

That creates 3 institutional problems:

* **No link to collateral source of truth**: where did those balances come from?
* **No invariants**: a malicious backend can propose balances that exceed total collateral if the contract happens to hold enough tokens (or if funded incorrectly).
* **No dispute model**: “latest state wins” exists only socially. There is no onchain challenge window / nonce monotonicity enforcement.

In your own system model, sessions must support: nonces, latest-state supersedes earlier, and the ability for users to submit latest signed state in dispute/operator failure. 
So we need an onchain object that represents that.

### B) Two payout systems = two ledgers = future bugs

* Onchain pools in `PredictionMarket` compute payouts from pool ratios.
* Offchain sessions compute balances elsewhere.

Institutions hate “two sources of truth.” Phase 1 should converge to **one canonical settlement ledger** for the ShadowPool path.

---

## 2) Phase-1 contract set (smart-contract-only)

### Keep (as-is conceptually)

* `MarketFactory` (CRE market creation)
* `CREReceiver / OracleCoordinator / SettlementRouter / ReportValidator` (your oracle plumbing is good)
* `PredictionMarket` **as MarketRegistry + OutcomeFinality** (not as pool AMM)

### Replace / Add (this is the core of ShadowPool)

#### (1) `CollateralVault` (custody)

**Job:** hold collateral and allocate it to sessions/markets as “locked margin.”
**Key:** users deposit once; vault is the single custody point.

Minimal interface:

* `deposit(amount)`, `withdraw(amount)` (withdraw only from free balance)
* `lock(user, marketId, sessionId, amount)`
* `unlock(user, marketId, sessionId, amount)`
* `transferLocked(userFrom, userTo, marketId, sessionId, amount)` (only via settlement)

> This gives you a place to enforce solvency and caps (Risk Sentinel later). Onchain responsibilities include custody + risk guardrails. 

#### (2) `ChannelSettlement` (dispute + checkpoint enforcement)

This is the replacement for `SessionFinalizer`.

**Job:** accept signed checkpoints (state commitments), allow challenges, and finalize the latest valid checkpoint.

Key properties from your spec:

* state `S=(q, balances, positions, fees, nonce)` 
* nonces prevent replay; latest valid state supersedes earlier 
* periodic checkpointing: offchain → onchain, netted deltas committed 

So onchain should store **per (marketId, sessionId)**:

* `latestNonce`
* `latestStateRoot` (hash commitment)
* `pendingCheckpoint` with `challengeDeadline`
* `finalized` boolean

Functions:

* `submitCheckpoint(Checkpoint cp, sigs[])`
* `challengeCheckpoint(Checkpoint newerCp, sigs[])`
* `finalizeCheckpoint(marketId, sessionId)`

**Importantly:** you do NOT want to pass arrays of balances to transfer like you do now. You want to commit either:

* a **stateRoot + deltasRoot**, and optionally
* a compact list of **netted deltas** (bounded size)

Because your design explicitly says “execution transcript hashing” and “netted deltas committed” to avoid replaying full history.  

#### (3) `ExecutionLedger` (canonical positions ledger)

**Job:** hold the final, onchain-enforceable positions for settlement, without recomputing pricing.

* `applyDeltas(marketId, sessionId, deltas[])` callable only by `ChannelSettlement` after finalization
* `positionOf(user, marketId, outcomeIndex) -> int256` (shares can be positive/negative depending on design)
* `feesAccrued(marketId)` optional

Then, when the oracle resolves outcome `ω*`, payout is:

* `payout(user) = shares[user][ω*]` (or shares * unit payout),
  consistent with your doc’s settlement statement. 

---

## 3) The single most important object: the Checkpoint

### You need a deterministic, typed schema

A Phase-1 `Checkpoint` should be small and audit-friendly:

```
Checkpoint {
  uint256 marketId;
  bytes32 sessionId;
  uint64  nonce;
  bytes32 stateRoot;    // commitment to full S=(q, balances, positions, fees, nonce)
  bytes32 deltasRoot;   // commitment to netted deltas since last finalized checkpoint
  uint64  validAfter;   // optional
  uint64  validBefore;  // optional
}
```

**Signatures:**

* Hub/operator signature + each involved party signature (or a committee threshold later).
* Use **EIP-712 typed data**. Institutions expect this; “eth_sign” is a red flag.

### Why `deltasRoot` matters

Your spec explicitly uses “netted deltas committed onchain; transcript hash ensures auditability.” 
So:

* `stateRoot` = audit anchor
* `deltas` (bounded list) = what actually updates the ledger

---

## 4) How settlement actually moves funds (without pool math)

In your model, onchain does not recompute curve math. 
So onchain must only enforce:

1. **Checkpoint finality**
2. **Deltas application is consistent with the checkpoint** (Merkle proof or full deltas list hashed to `deltasRoot`)
3. **Vault solvency**: deltas cannot move more locked collateral than exists

### Minimal delta format (Phase 1)

To avoid merkle proofs in v1, keep it simple and include full deltas list (size capped):

```
Delta {
  address user;
  uint32  outcomeIndex;
  int128  sharesDelta;
  int128  collateralDelta; // optional (if you represent cash legs separately)
}
```

Then:

* `ChannelSettlement.finalizeCheckpoint(...)` calls:

  * `ExecutionLedger.applyDeltas(...)`
  * `CollateralVault.applyCashDeltas(...)` (if needed)
  * or simply adjust locked/free balances based on net cash movement

---

## 5) What to do with `PredictionMarket.sol`

Right now it stores pools and lets users `predict()` directly.

For ShadowPool integrated to RetroPick, I’d refactor `PredictionMarket` into:

### A) `MarketRegistry` responsibilities

* market type (binary / categorical / timeline)
* outcome labels / windows
* expiry timestamp
* resolved outcome + confidence
* status machine: Draft/Activated/Operational/Resolved/Closed (you already describe lifecycle) 

### B) Settlement responsibilities

* once resolved, allow redemption based on `ExecutionLedger`
* `redeem(marketId)` reads `shares[caller][winningOutcome]` and pays from vault

This is aligned with “deterministic settlement” and “bounded loss / risk budgeting” approach. 

### C) Keep classic pool PM as “demo module”

If you still want pool-based onchain markets:

* move current AMM/pool logic into `LegacyPoolMarket.sol`
* keep `MarketRegistry` clean

That avoids contaminating the institutional story with “two payout systems.”

---

## 6) Hardening your oracle plumbing (smart contract changes)

Your plumbing is good, but for institutional-grade you need two upgrades:

### A) Governance / Access control

Right now, several `setX()` functions have no owner checks (you said “relying on controlled deployment”). Institutions won’t accept that.

Add:

* `Ownable2Step` (or `AccessControl`) on:

  * `SettlementRouter.setOracleCoordinator`, `setSessionFinalizer`
  * `OracleCoordinator.set*`
  * `ReceiverTemplate.setExpected*` if you keep mutability

### B) Domain separation for report types

You already use report prefixes (`0x01`, `0x02`, `0x03`). Keep that pattern, but make it systematic across all receivers:

* `enum ReportType { Settlement=1, MarketCreate=2, SessionCheckpoint=3 }`
* One shared decoder lib

That prevents “type confusion” attacks where a payload is interpreted incorrectly.

---

## 7) Security invariants (the ones auditors will ask you)

### Vault + Settlement invariants

* **Conservation:** total collateral in vault = sum(free) + sum(locked) + feesReserve
* **Monotonicity:** checkpoint nonce strictly increases per (marketId, sessionId)
* **Finality:** once resolved, positions cannot change (freeze `ChannelSettlement` for that market/session)
* **Bounded deltas:** max participants per checkpoint; max deltas; caps to prevent gas DoS
* **Replay resistance:** EIP-712 with chainId + contract address domain

### Economic invariants (Phase 1)

Your doc mentions:

* slippage constraints `maxCost`, `minShares`, `maxOddsImpact` 
  Those remain **offchain enforced**, but onchain should enforce:
* **exposure caps** per market/session (basic risk guardrail)
* cannot unlock more than locked

---

## 8) Smart-contract-only folder structure (within `packages/contracts/src`)

```text
src/
  core/
    MarketRegistry.sol          # refactor of PredictionMarket: registry + resolution + redeem hook
    MarketFactory.sol
    SettlementRouter.sol

  execution/
    CollateralVault.sol         # custody + locks
    ChannelSettlement.sol       # checkpoints + disputes + finalize
    ExecutionLedger.sol         # canonical positions
    BatchSettlement.sol         # optional: multi-checkpoint in one tx
    FeeAccounting.sol           # optional: fee reserves

  oracle/
    ReceiverTemplate.sol
    CREReceiver.sol
    OracleCoordinator.sol
    ReportValidator.sol

  libs/
    Errors.sol
    Hashing.sol                 # EIP-712 typehash, stateRoot/deltasRoot helpers
    SigVerify.sol               # recover, validate, sorted signers, threshold

  interfaces/
    IMarketRegistry.sol
    ICollateralVault.sol
    IChannelSettlement.sol
    IExecutionLedger.sol
```

---

## 9) Minimal “Phase 1” contract API (so RetroPick can integrate cleanly)

### Required

* `MarketRegistry.create*` (from factory / CRE)
* `MarketRegistry.resolve(marketId, outcomeIndex, confidence)` (via router)
* `ChannelSettlement.submitCheckpoint(cp, sigs, deltas)`
* `MarketRegistry.redeem(marketId)` (reads ledger, pays from vault)

### Optional (nice)

* `ChannelSettlement.challengeCheckpoint(newerCp, sigs, deltas)`
* `BatchSettlement.settleBatch(checkpoints[])`

---

If you want, next message I can do **one of these** (still smart contract only, deep):

1. Write the **exact Solidity interfaces + structs** for Checkpoint/Deltas (EIP-712 typed), or
2. Provide a **refactor plan for `PredictionMarket.sol` into `MarketRegistry.sol`** without breaking your CRE settlement prefix scheme, or
3. List the **Foundry test suite** you must add (nonce monotonicity, challenge flow, vault conservation, resolved freeze).

Cool — I’ll do **(1) exact Solidity structs + EIP-712 typed signing + interfaces**, and **(2) a practical refactor plan** from your current `PredictionMarket.sol`/`SessionFinalizer.sol` into a ShadowPool-first architecture.

I’ll keep it **Phase-1 realistic**: no Merkle proofs yet (optional later). We’ll hash the **full deltas array** into `deltasHash` and include it inside the signed checkpoint (so onchain can verify the deltas you pass are exactly what was signed).

---

## 1) Canonical data types (Checkpoint + Deltas)

### Design goals

* **Onchain never recomputes pricing math.** It only verifies a signed checkpoint.
* **Checkpoint is the only thing you finalize onchain.**
* **Deltas are bounded** (cap count to prevent DoS).
* **EIP-712 typed data** (institutions expect this).
* **Nonce monotonicity** per `(marketId, sessionId)`.

### Solidity types

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library ShadowTypes {
    // What the operator + parties sign
    struct Checkpoint {
        uint256 marketId;
        bytes32 sessionId;
        uint64  nonce;        // strictly increasing per (marketId, sessionId)
        uint64  validAfter;   // optional: 0 = ignore
        uint64  validBefore;  // optional: 0 = ignore
        bytes32 stateHash;    // commitment to full offchain state S (q, balances, positions, fees, nonce)
        bytes32 deltasHash;   // keccak256(abi.encodePacked(deltaStructHashes...))
        bytes32 riskHash;     // optional: encodes flags/caps (or 0x0)
    }

    // Minimal netted effect to apply onchain
    // sharesDelta updates ExecutionLedger; cashDelta updates CollateralVault locked/free.
    struct Delta {
        address user;
        uint32  outcomeIndex;     // for binary: 0/1; for categorical/timeline: index
        int128  sharesDelta;      // signed shares change
        int128  cashDelta;        // signed collateral change (e.g., -cost, +payout claimable) in token decimals
    }
}
```

**Notes**

* `stateHash` is your audit anchor (full transcript/engine state).
* `deltasHash` binds exactly which deltas can be applied onchain.
* `cashDelta` lets you net USDC movements without re-running trade math.

---

## 2) EIP-712 hashing (typed data)

### The signer set (Phase 1)

* **Operator/Hub** signature is required.
* **Each affected user** signature is required (strong safety, slower).
* Later you can switch to threshold committees / bonded operator etc.

Here’s a canonical hashing library:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ShadowTypes} from "./ShadowTypes.sol";

abstract contract ShadowEIP712 is EIP712 {
    using ECDSA for bytes32;

    // Domain: name/version chosen once for the protocol
    constructor() EIP712("ShadowPool", "1") {}

    // keccak256("Checkpoint(uint256 marketId,bytes32 sessionId,uint64 nonce,uint64 validAfter,uint64 validBefore,bytes32 stateHash,bytes32 deltasHash,bytes32 riskHash)")
    bytes32 internal constant CHECKPOINT_TYPEHASH =
        0x6c8905d6bf5b5e5f2c78c2f9f8c2d2a8cb6b0f0a0f0f24f98f4c56b6f13b6b72;

    // keccak256("Delta(address user,uint32 outcomeIndex,int128 sharesDelta,int128 cashDelta)")
    bytes32 internal constant DELTA_TYPEHASH =
        0xb2e1a4d0df52f5d58bfe2f4da0dfd8f7f3a1f2a8b4d9ed8fdf4b5b6df3d76ef0;

    function _hashDelta(ShadowTypes.Delta memory d) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            DELTA_TYPEHASH,
            d.user,
            d.outcomeIndex,
            d.sharesDelta,
            d.cashDelta
        ));
    }

    // Hash the array into a single bytes32 that matches the signed Checkpoint.deltasHash
    function _hashDeltas(ShadowTypes.Delta[] memory deltas) internal pure returns (bytes32) {
        bytes32[] memory h = new bytes32[](deltas.length);
        for (uint256 i = 0; i < deltas.length; i++) h[i] = _hashDelta(deltas[i]);
        // bind order; simplest: abi.encodePacked of hashes
        return keccak256(abi.encodePacked(h));
    }

    function _hashCheckpoint(ShadowTypes.Checkpoint memory cp) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            CHECKPOINT_TYPEHASH,
            cp.marketId,
            cp.sessionId,
            cp.nonce,
            cp.validAfter,
            cp.validBefore,
            cp.stateHash,
            cp.deltasHash,
            cp.riskHash
        ));
    }

    function _digestCheckpoint(ShadowTypes.Checkpoint memory cp) internal view returns (bytes32) {
        return _hashTypedDataV4(_hashCheckpoint(cp));
    }

    function _recoverCheckpointSigner(
        ShadowTypes.Checkpoint memory cp,
        bytes memory signature
    ) internal view returns (address) {
        return _digestCheckpoint(cp).recover(signature);
    }
}
```

**Important:** The two `*_TYPEHASH` constants must be computed exactly. In your repo, generate them in a Foundry test or script and hardcode them (don’t trust a random value I typed). The pattern is correct; the constants must be produced by `keccak256(bytes("..."))`.

In Foundry you’ll do:

```solidity
emit log_bytes32(keccak256("Checkpoint(...)"));
emit log_bytes32(keccak256("Delta(...)"));
```

---

## 3) Core interfaces (smart-contract boundary)

### `ICollateralVault` (custody + lock accounting)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICollateralVault {
    function token() external view returns (address);

    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;

    function freeBalance(address user) external view returns (uint256);
    function lockedBalance(address user, uint256 marketId, bytes32 sessionId) external view returns (uint256);

    function lock(address user, uint256 marketId, bytes32 sessionId, uint256 amount) external;
    function unlock(address user, uint256 marketId, bytes32 sessionId, uint256 amount) external;

    // apply signed net cash deltas (only ChannelSettlement)
    function applyCashDeltas(uint256 marketId, bytes32 sessionId, address[] calldata users, int128[] calldata cashDeltas) external;
}
```

### `IExecutionLedger` (canonical positions, no pricing)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ShadowTypes} from "./ShadowTypes.sol";

interface IExecutionLedger {
    function positionOf(address user, uint256 marketId, uint32 outcomeIndex) external view returns (int256);

    // only ChannelSettlement calls
    function applyDeltas(uint256 marketId, bytes32 sessionId, ShadowTypes.Delta[] calldata deltas) external;
}
```

### `IChannelSettlement` (checkpoint, challenge, finalize)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ShadowTypes} from "./ShadowTypes.sol";

interface IChannelSettlement {
    event CheckpointSubmitted(uint256 indexed marketId, bytes32 indexed sessionId, uint64 nonce, bytes32 stateHash, bytes32 deltasHash);
    event CheckpointChallenged(uint256 indexed marketId, bytes32 indexed sessionId, uint64 newNonce);
    event CheckpointFinalized(uint256 indexed marketId, bytes32 indexed sessionId, uint64 nonce);

    function submitCheckpoint(
        ShadowTypes.Checkpoint calldata cp,
        ShadowTypes.Delta[] calldata deltas,
        bytes calldata operatorSig,
        address[] calldata users,
        bytes[] calldata userSigs
    ) external;

    function challengeCheckpoint(
        ShadowTypes.Checkpoint calldata newerCp,
        ShadowTypes.Delta[] calldata newerDeltas,
        bytes calldata operatorSig,
        address[] calldata users,
        bytes[] calldata userSigs
    ) external;

    function finalizeCheckpoint(uint256 marketId, bytes32 sessionId) external;

    function latestNonce(uint256 marketId, bytes32 sessionId) external view returns (uint64);
}
```

### `IMarketRegistry` (resolution + redeem)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMarketRegistry {
    enum MarketType { Binary, Categorical, Timeline }
    enum Status { Draft, Active, Resolved, Closed }

    function marketType(uint256 marketId) external view returns (MarketType);
    function status(uint256 marketId) external view returns (Status);

    function resolve(uint256 marketId, uint32 winningOutcome, uint16 confidence) external;

    // Redeem based on ExecutionLedger positions and Vault collateral
    function redeem(uint256 marketId) external returns (uint256 payout);
}
```

---

## 4) `ChannelSettlement` implementation skeleton (core logic)

This is where you enforce institutional-grade invariants:

* verify `cp.deltasHash == _hashDeltas(deltas)`
* verify `nonce` > current nonce and (if pending) > pending nonce
* verify operator sig
* verify all user sigs for the same cp digest
* store pending checkpoint with `challengeDeadline`
* allow `challengeCheckpoint` with higher nonce before deadline
* finalize applies deltas to ledger + vault, then updates `latestNonce`

Skeleton:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ShadowTypes} from "./ShadowTypes.sol";
import {ShadowEIP712} from "./ShadowEIP712.sol";
import {ICollateralVault} from "./ICollateralVault.sol";
import {IExecutionLedger} from "./IExecutionLedger.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

contract ChannelSettlement is ShadowEIP712, Ownable2Step {
    ICollateralVault public immutable vault;
    IExecutionLedger public immutable ledger;

    address public operator; // hub signer (can rotate)

    uint32 public constant MAX_DELTAS = 256;
    uint32 public constant MAX_USERS  = 256;

    struct Pending {
        uint64 nonce;
        uint64 challengeDeadline;
        bytes32 stateHash;
        bytes32 deltasHash;
        bytes32 riskHash;
        bool exists;
    }

    mapping(bytes32 => uint64) public latestNonceByKey;     // key = keccak256(marketId, sessionId)
    mapping(bytes32 => Pending) public pendingByKey;

    constructor(address vault_, address ledger_, address operator_) {
        vault = ICollateralVault(vault_);
        ledger = IExecutionLedger(ledger_);
        operator = operator_;
    }

    function setOperator(address op) external onlyOwner { operator = op; }

    function _key(uint256 marketId, bytes32 sessionId) internal pure returns (bytes32) {
        return keccak256(abi.encode(marketId, sessionId));
    }

    function latestNonce(uint256 marketId, bytes32 sessionId) external view returns (uint64) {
        return latestNonceByKey[_key(marketId, sessionId)];
    }

    function submitCheckpoint(
        ShadowTypes.Checkpoint calldata cp,
        ShadowTypes.Delta[] calldata deltas,
        bytes calldata operatorSig,
        address[] calldata users,
        bytes[] calldata userSigs
    ) external {
        _verifyAndStorePending(cp, deltas, operatorSig, users, userSigs, /*isChallenge*/ false);
    }

    function challengeCheckpoint(
        ShadowTypes.Checkpoint calldata newerCp,
        ShadowTypes.Delta[] calldata newerDeltas,
        bytes calldata operatorSig,
        address[] calldata users,
        bytes[] calldata userSigs
    ) external {
        _verifyAndStorePending(newerCp, newerDeltas, operatorSig, users, userSigs, /*isChallenge*/ true);
    }

    function finalizeCheckpoint(uint256 marketId, bytes32 sessionId) external {
        bytes32 k = _key(marketId, sessionId);
        Pending memory p = pendingByKey[k];
        require(p.exists, "NO_PENDING");
        require(block.timestamp >= p.challengeDeadline, "CHALLENGE_WINDOW");

        // apply deltas requires deltas to be provided. Phase-1: finalize with stored deltasHash only
        // so we require re-submission of deltas for application OR store deltas in calldata at submit.
        // Best practice: store nothing heavy onchain; finalize requires deltas passed again.
        revert("FINALIZE_REQUIRES_DELTAS"); // see note below
    }

    // ---- internal ----

    function _verifyAndStorePending(
        ShadowTypes.Checkpoint calldata cp,
        ShadowTypes.Delta[] calldata deltas,
        bytes calldata operatorSig,
        address[] calldata users,
        bytes[] calldata userSigs,
        bool isChallenge
    ) internal {
        require(deltas.length <= MAX_DELTAS, "TOO_MANY_DELTAS");
        require(users.length <= MAX_USERS, "TOO_MANY_USERS");
        require(users.length == userSigs.length, "SIG_LEN");

        // bind deltas
        bytes32 dHash = _hashDeltas(deltas);
        require(dHash == cp.deltasHash, "BAD_DELTAS_HASH");

        // optional time bounds
        if (cp.validAfter != 0) require(block.timestamp >= cp.validAfter, "TOO_EARLY");
        if (cp.validBefore != 0) require(block.timestamp <= cp.validBefore, "TOO_LATE");

        // operator signature
        require(_recoverCheckpointSigner(cp, operatorSig) == operator, "BAD_OPERATOR_SIG");

        // each user signature matches checkpoint digest
        bytes32 digest = _digestCheckpoint(cp);
        for (uint256 i = 0; i < users.length; i++) {
            address rec = ECDSA.recover(digest, userSigs[i]);
            require(rec == users[i], "BAD_USER_SIG");
        }

        bytes32 k = _key(cp.marketId, cp.sessionId);

        uint64 latest = latestNonceByKey[k];
        require(cp.nonce > latest, "NONCE_NOT_INCREASING");

        Pending storage p = pendingByKey[k];

        if (isChallenge) {
            require(p.exists, "NO_PENDING_TO_CHALLENGE");
            require(block.timestamp < p.challengeDeadline, "WINDOW_PASSED");
            require(cp.nonce > p.nonce, "CHALLENGE_NOT_NEWER");
        }

        // store pending, new challenge window
        p.nonce = cp.nonce;
        p.stateHash = cp.stateHash;
        p.deltasHash = cp.deltasHash;
        p.riskHash = cp.riskHash;
        p.challengeDeadline = uint64(block.timestamp + 30 minutes); // parameterize
        p.exists = true;
    }
}
```

### One important implementation choice (finalize with deltas)

For Phase 1, do this:

* `finalizeCheckpoint(marketId, sessionId, deltas)` receives deltas again,
* recompute `_hashDeltas(deltas)` and require it matches stored `pending.deltasHash`,
* then apply deltas to `ExecutionLedger` and `CollateralVault`.

That avoids storing deltas onchain.

So your real finalize signature should be:

```solidity
function finalizeCheckpoint(uint256 marketId, bytes32 sessionId, ShadowTypes.Delta[] calldata deltas) external;
```

(And require `hashDeltas(deltas) == pending.deltasHash`.)

---

## 5) Refactor plan from your current contracts

### Step 1 — Split `PredictionMarket.sol`

Right now it mixes:

* registry + creation
* onchain pool betting
* onchain pool payout
* CRE receiver settlement entrypoint

**Refactor into:**

1. `MarketRegistry.sol`

   * market storage, types, metadata pointer
   * resolution (winningOutcome + confidence)
   * status machine
2. `LegacyPoolMarket.sol` (optional demo path)

   * keep your current `predict()`/`claim()` logic here
   * it references `MarketRegistry` for resolved outcome
3. `RedeemFromLedger.sol` (or just `MarketRegistry.redeem()`)

   * reads `ExecutionLedger.positionOf(msg.sender, marketId, winningOutcome)`
   * pays from `CollateralVault` / reserves

This removes “two payout sources” in the core protocol.

### Step 2 — Replace `SessionFinalizer.sol` with `ChannelSettlement.sol`

Your current `SessionFinalizer` is “backend signs balances, users sign balances, contract transfers.”

Replace with:

* checkpoint-based settlement (nonce + challenge)
* apply deltas to ledger + vault
* no arbitrary transfers

### Step 3 — Introduce `CollateralVault.sol`

Currently, funds are held either in `PredictionMarket` or in `Treasury`.

ShadowPool execution wants **single custody**:

* deposit once into vault
* offchain trading changes locked/free via deltas
* redemption draws from vault based on final outcome

(You can keep `Treasury` as a wrapper later, but vault should be canonical.)

### Step 4 — Keep your oracle pipeline, but change what it settles

Your pipeline currently routes to:

* `PredictionMarket.onReport(0x01...)` for outcome
* `SessionFinalizer.finalizeSession(payload)` for session

Keep the **report prefixes**, but update the targets:

* `0x01` outcome settlement → `MarketRegistry.resolve(marketId, winningOutcome, confidence)`
* `0x03` session checkpoint → `ChannelSettlement.submitCheckpoint(cp, deltas, sigs...)`

This preserves your existing CRE integration style while aligning protocol semantics.

---

## 6) Minimum Foundry tests you must add (smart-contract only)

### A) Checkpoint correctness

* rejects wrong `deltasHash`
* rejects non-increasing nonce
* rejects invalid operator sig
* rejects invalid user sig

### B) Challenge mechanics

* submit cp nonce=5
* challenge with nonce=6 before deadline succeeds
* challenge after deadline fails
* finalize before deadline fails

### C) Ledger/Vault invariants

* applying deltas cannot make any user’s locked < 0
* total vault balance conservation: total == sum(free+locked)+fees

### D) Resolution freeze

* once market resolved, ChannelSettlement refuses checkpoints for that market/session (optional but recommended)
* redeem only works after resolved

---

## What I need from you (no questions, just assumptions I’ll use)

I’m going to assume for Phase 1:

* You’re fine with **operator + all users signing** each checkpoint (strong safety).
* `cashDelta` is denominated in **token smallest unit** (USDC 6 decimals, etc).
* You cap deltas/users per checkpoint to keep gas safe.

If you want, next I can generate:

* a concrete `CollateralVault.sol` + `ExecutionLedger.sol` skeleton (compilable),
* and a Foundry test file `CheckpointFlow.t.sol` with EIP-712 signing using `vm.sign`.

Say “generate vault + ledger + tests” and I’ll output them in full.
