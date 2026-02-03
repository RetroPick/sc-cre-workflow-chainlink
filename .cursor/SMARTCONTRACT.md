# RetroPick Contracts Architecture (Foundry-based)

## Overview

This structure supports:

* Core prediction market logic
* CRE receiver compatibility
* Modular state channel interaction
* Isolated testing and math/util libraries

---

## `contracts/` Layout

```
contracts/
├── core/
│   ├── Market.sol                  # Prediction logic (modular per type: binary/scalar)
│   ├── MarketFactory.sol          # Creates new Market instances
│   ├── Treasury.sol               # Handles all fund custody and payouts
│   ├── SettlementRouter.sol      # Routes final settlement (CRE → Market → Treasury)
│   └── SessionFinalizer.sol      # Receives Yellow final state proofs (optional module)
│
├── oracle/
│   ├── CREReceiver.sol           # Chainlink Functions callback (inherits ReceiverTemplate)
│   ├── OracleCoordinator.sol     # Trusted dispatcher → SettlementRouter
│   └── ReportValidator.sol       # Optional: signature+schema verifier
│
├── interfaces/
│   ├── IMarket.sol
│   ├── IOracleReceiver.sol
│   ├── ISettlementRouter.sol
│   ├── ISessionFinalizer.sol
│   └── ITreasury.sol
│
├── libraries/
│   ├── MarketLib.sol             # Payout math, validation, etc.
│   └── SignatureLib.sol          # If using signed inputs (external APIs/users)
│
├── utils/
│   ├── Errors.sol
│   └── Constants.sol
│
└── test/
    ├── market.t.sol
    ├── settlement.t.sol
    └── integration.t.sol
```

---

## Explanation of Key Folders

Here is a **deep architectural upgrade and repo design** for **RetroPick V2 smart contracts**, based on your advanced CRE + Yellow + Arc integration and the successful prediction market patterns you’re already leveraging.

---

## 🔍 Key Architectural Goals for RetroPick V2

| Feature                   | Upgrade                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------ |
| **Modularity**            | Separate lifecycle (creation, prediction, resolution, payout) into smaller contracts |
| **Upgradability**         | Optional: proxy-compatible layout using [UUPS] or `Diamond` pattern                  |
| **Extensibility**         | Support multiple market types (binary, scalar, categorical)                          |
| **Security**              | Tight role-based access (factory, CRE, backends), CRE auth filtering                 |
| **Off-chain Integration** | Clean interfaces for Yellow (session closure) and CRE (report input)                 |
| **Composable**            | External dApps can create and query markets easily                                   |

---

## 🧱 V2 Smart Contract Repo Structure

```
contracts/
├── core/
│   ├── Market.sol                  # Prediction logic (modular per type: binary/scalar)
│   ├── MarketFactory.sol          # Creates new Market instances
│   ├── Treasury.sol               # Handles all fund custody and payouts
│   ├── SettlementRouter.sol      # Routes final settlement (CRE → Market → Treasury)
│   └── SessionFinalizer.sol      # Receives Yellow final state proofs (optional module)
│
├── oracle/
│   ├── CREReceiver.sol           # Chainlink Functions callback (inherits ReceiverTemplate)
│   ├── OracleCoordinator.sol     # Trusted dispatcher → SettlementRouter
│   └── ReportValidator.sol       # Optional: signature+schema verifier
│
├── interfaces/
│   ├── IMarket.sol
│   ├── IOracleReceiver.sol
│   ├── ISettlementRouter.sol
│   ├── ISessionFinalizer.sol
│   └── ITreasury.sol
│   ├── IReceiver.sol
│   └── ReceiverTemplate.sol
│
├── libraries/
│   ├── MarketLib.sol             # Payout math, validation, etc.
│   └── SignatureLib.sol          # If using signed inputs (external APIs/users)
│
├── utils/
│   ├── Errors.sol
│   └── Constants.sol
│
└── test/
    ├── market.t.sol
    ├── settlement.t.sol
    └── integration.t.sol
```

Here’s a detailed breakdown of your smart contract architecture for **RetroPick V2**, describing each contract/module and how they correlate with each other.

---

## 🧱 **Smart Contract Architecture: RetroPick V2**

```
contracts/
├── core/
├── oracle/
├── interfaces/
├── libraries/
├── utils/
└── test/
```

---

### 🔹 **/core** — *Core logic for prediction markets and on-chain flows*

| Contract               | Description                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Market.sol`           | **Main prediction market logic**. Each deployed Market instance supports binary, categorical, or timeline-based outcomes. Handles user predictions, outcome storage, and result claiming.         |
| `MarketFactory.sol`    | **Factory for deploying new markets**. Called by backend or CRE. It initializes `Market.sol` with metadata, outcomes, and type (binary, categorical, etc).                                        |
| `Treasury.sol`         | **Central USDC pool manager**. Escrows all market entry funds and handles payouts based on final results, after verification from `SettlementRouter`.                                             |
| `SettlementRouter.sol` | **Settlement coordinator**. Trusted contract that receives final outcome from oracle path and triggers `Market.settle()` and `Treasury.payout()`. Prevents direct settlement by external callers. |
| `SessionFinalizer.sol` | *(Optional)* Accepts final Yellow Network state proofs for off-chain trading sessions. Used to close prediction trades made via Nitrolite SDK and apply balances before on-chain resolution.      |

**➕ Correlation:**

* `MarketFactory` deploys `Market`
* `SettlementRouter` drives secure resolution on `Market`
* `Market` uses `Treasury` to pull/settle funds
* Optionally, `SessionFinalizer` closes off-chain sessions before `SettlementRouter` starts payout.

---

### 🔹 **/oracle** — *Chainlink CRE integration & resolution routing*

| Contract                | Description                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `CREReceiver.sol`       | **Chainlink Functions callback**. Inherits `ReceiverTemplate` and handles `_processReport`. Sends verified data to `OracleCoordinator`. |
| `OracleCoordinator.sol` | **Dispatch layer**. Receives parsed results from `CREReceiver` and forwards them securely to `SettlementRouter`. Trusted by Chainlink.  |
| `ReportValidator.sol`   | *(Optional)* Validates CRE reports: signature schema, payload format, expiration, confidence score. Improves trust minimization.        |

**➕ Correlation:**

* `CREReceiver` is the **CRE endpoint**
* `OracleCoordinator` ensures **modular trust routing**
* `SettlementRouter` only accepts input from `OracleCoordinator`
* Optional `ReportValidator` adds verifiability to CRE payloads

---

### 🔹 **/interfaces** — *Standardized contract communication*

| Interface               | Description                                                                  |
| ----------------------- | ---------------------------------------------------------------------------- |
| `IMarket.sol`           | External interface for any `Market` instance (used by router, backend, etc). |
| `IOracleReceiver.sol`   | Interface for Chainlink-compatible callback contracts (`CREReceiver`).       |
| `ISettlementRouter.sol` | Used by `OracleCoordinator` to push results into the router.                 |
| `ISessionFinalizer.sol` | Used by Yellow backend to finalize session deltas.                           |
| `ITreasury.sol`         | Treasury interaction layer for `Market` and `Router`.                        |
| `IReceiver.sol`         | Chainlink Functions base interface.                                          |
| `ReceiverTemplate.sol`  | Chainlink Functions receiver scaffold with `_processReport()` logic.         |

**➕ Correlation:**
Used across all contracts to maintain type safety and modular upgrades.

---

### 🔹 **/libraries** — *Low-level logic, reused across contracts*

| Library            | Description                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MarketLib.sol`    | Includes outcome math (payout ratios, claim calculations), outcome enum parsing, range band validation, etc. Used in `Market.sol`.                                     |
| `SignatureLib.sol` | Encodes/verifies signatures (EIP-712, keccak) for use with signed external payloads like off-chain price feeds or custom users. Optional, used with `ReportValidator`. |

---

### 🔹 **/utils** — *Gas optimization and shared constants*

| Utility         | Description                                                                 |
| --------------- | --------------------------------------------------------------------------- |
| `Errors.sol`    | Custom error types (`error MarketSettledAlready();`) to reduce revert cost. |
| `Constants.sol` | Standard enums, fee settings, and CRE call types used across the repo.      |

---

### 🔹 **/test** — *Comprehensive Foundry test suite*

| Test File           | Description                                                                |
| ------------------- | -------------------------------------------------------------------------- |
| `market.t.sol`      | Unit tests for `Market.sol` (predict, settle, claim, validation, reverts). |
| `settlement.t.sol`  | End-to-end test for CRE → Oracle → Router → Market + Treasury logic.       |
| `integration.t.sol` | Multi-module simulation: backend deploys → CRE resolves → USDC payouts.    |

---

## 🔄 **Overall Workflow**

```text
createMarket()
 └── MarketFactory → Market.sol
      └── USDC moved into Treasury

backend + CRE
 └── CREReceiver → OracleCoordinator → SettlementRouter
      └── Market.settle() → Treasury.payout()
```

---

## ✅ Current Implementation Notes (Core Contracts)

The current codebase uses a minimal core with CRE compatibility and adds **categorical** and **timeline** market types as **non-breaking** extensions:

- `PredictionMarket.sol` remains the core settlement contract.
- `MarketFactory.sol` is the CRE receiver that creates markets and stores metadata.
- `IReceiver.sol` and `ReceiverTemplate.sol` remain the immutable CRE integration layer.

### Additive Oracle + Routing Modules (Integrated)

These modules are added alongside the core contracts without modifying them:

- `oracle/CREReceiver.sol` — CRE entrypoint, decodes `(market, marketId, outcomeIndex, confidence)` and forwards to coordinator.
- `oracle/OracleCoordinator.sol` — validates and forwards to router.
- `oracle/ReportValidator.sol` — optional confidence gate.
- `core/SettlementRouter.sol` — calls `PredictionMarket.onReport` using the settlement prefix (`0x01`).
- `core/Treasury.sol` — ERC20 escrow (deployed but only used if markets migrate to ERC20 payouts).
- `core/SessionFinalizer.sol` — optional Yellow session hook.

### CRE Payload Mapping (Oracle Receiver)

- CRE report payload:
  - `abi.encode(address market, uint256 marketId, uint8 outcomeIndex, uint16 confidence)`
- Router builds settlement report:
  - `bytes.concat(0x01, abi.encode(marketId, outcomeIndex, confidence))`

### Supported Market Types (Implemented)

| Market Type | Description | On-chain Storage |
| --- | --- | --- |
| **Binary** | Yes/No markets (default) | `Market` struct + `totalYesPool/totalNoPool` |
| **Categorical** | Multi-outcome markets (A/B/C/...) | `categoricalOutcomes[]` + `categoricalPools[]` |
| **Timeline** | Multi-window markets (t1/t2/t3...) | `timelineWindows[]` + `timelinePools[]` |

### CRE Payload Mapping (Factory Receiver)

- **Binary** (legacy, no prefix):
  - `abi.encode(MarketInput)` where `MarketInput` matches the existing struct.
- **Typed** (categorical/timeline):
  - Prefix the report with `0x02` and then `abi.encode(MarketInputV2)`.
  - `marketType = 1` for categorical, `marketType = 2` for timeline.

### Settlement Mapping (PredictionMarket)

- Settlement report format is unified as:
  - `abi.encode(uint256 marketId, uint8 outcomeIndex, uint16 confidence)`
- Binary markets validate `outcomeIndex` in `[0,1]`.
- Categorical/timeline markets validate `outcomeIndex` against pools length.

Optional:

```text
Nitrolite session
 └── Yellow SDK → SessionFinalizer.sol → updates internal balance → routed into settlement
```

---

Would you like a visual diagram (UML / sequence / folder tree) or recommended testing plans next?


---


## 🧠 Advanced Features to Consider for V2

### ✅ Feature: Categorical Markets

* Upgrade from binary (Yes/No) to multi-option (e.g. `TeamA`, `TeamB`, `Draw`)
* `enum Outcome { A, B, C, ... }`
* Payouts use `totalPool[winning]`

### ✅ Feature: Scalar Markets (Price Ranges)

* Use bands like: `BTC < 40k`, `40k–45k`, `>45k`
* Outcomes and odds managed as array

### ✅ Feature: CRE Result Confidence

* Your `_settleMarket(bytes)` already supports a `confidence` field
* Can be used for:

  * Rejecting low-confidence resolution
  * Adding dispute window (via backend governance)

### ✅ Feature: Permissioned Market Creation

* Add EIP-712 signature-based `createMarketFromFeed()`
* So frontend/workflow/DAO can submit verified markets

### ✅ Feature: Upgradability (Optional)

* Add UUPS proxy layout for `MarketFactory`, `Treasury`, `Router`
* Or expose `upgradeTo()` from Owner for flexible patching

---

## ✅ Advantages Over V1

| V1 Limitation                      | V2 Upgrade                                         |
| ---------------------------------- | -------------------------------------------------- |
| PredictionMarket too monolithic    | Split responsibilities: Market / Treasury / Router |
| Factory tightly coupled            | Modular input validation + metadata + signature    |
| Only binary outcomes               | V2 supports binary, scalar, categorical            |
| Single contract handles resolution | Delegated via router → supports multiple oracles   |
| No Yellow finalization             | Can plug in Yellow’s netPosition proof module      |

---

## 🧪 Suggested Repo Enhancements

* `/scripts/`: Deployment + Market seeding via `hardhat` or `foundry script`
* `/mocks/`: Mock ERC20, mock CRE reports, etc.
* `/fuzz/`: Fuzz testing prediction/claim edge cases
* `/docs/`: NatSpec + Markdown architecture walkthrough

---

Would you like me to scaffold a full `MarketV2.sol` contract, a `SettlementRouter.sol`, or deploy script next?


# 🧠 RetroPick V2: Market Types and Architecture

RetroPick V2 aims to support a wide variety of prediction market types seen in platforms like Polymarket, Kalshi, and OPN. These include Binary, Categorical, Scalar, Timelined, and Correlated markets. Below is a breakdown of each type and their implications on smart contract logic, frontend UX, and payout mechanisms.

---

## ✅ Type: Binary Market

### Description:

A classic Yes/No question with a 1-bit outcome.

### Example:

> "Will BTC close above $40k on Feb 28?"

### Enum:

```solidity
enum Outcome { YES, NO }
```

### Payout:

* Winning pool is paid 1:1 minus protocol/taker fee

---

## ✅ Type: Categorical Market

### Description:

A market with more than two mutually exclusive outcomes.

### Example:

> "Which party will win the 2024 U.S. election?"

* Democrat
* Republican
* Independent

### Enum:

```solidity
enum Outcome { DEM, REP, IND }
```

### Payout:

* totalPool[winning] gets paid out proportionally
* gas-efficient: store `uint[] public outcomePools`

---

## ✅ Type: Timelined Markets (Progressive States)

### Description:

Markets that unlock new pools or sub-markets over time as the situation develops. Each timeline represents a prediction window.

### Example:

> "Will X happen by March 1, March 15, March 31?"

### Structure:

```solidity
struct TimeMarket {
  uint256 expiration;
  bytes32 parentMarketId;
  uint8 outcome; // YES/NO
}
```

### Usage:

* Backend/CRE creates linked markets that share metadata and total pool footprint
* Timeline serves as sequential checkpoints
* Users can bet on early or late occurrence

---


Great — here's an optimized and extensible scaffold for expanding your `PredictionMarket.sol` contract to support **Categorical** and **Timeline-based** markets, while preserving gas efficiency and CRE compatibility.

---

## ✅ **Key Design Goals**

* Maintain your current architecture (CRE-driven market creation/settlement)
* Keep markets compatible with Yellow off-chain sessions
* Efficient handling of **multiple outcomes (categorical)** and **timeline-variant markets**
* Support for **multiple pools per market** (one for each outcome)
* Scalable for future types like scalar/correlated

---

## 🧠 **Design Changes Overview**

### 1. **Outcome Representation**

```solidity
enum MarketType {
    Binary,        // Yes/No
    Categorical,   // A, B, C, D...
    Timeline       // 1h, 1d, 3d, etc.
}
```

```solidity
struct Market {
    address creator;
    uint48 createdAt;
    uint48 settledAt;
    bool settled;
    uint16 confidence;
    uint8 outcomeIndex; // index of winning outcome
    MarketType marketType;
    string question;
    string[] outcomes; // ["Yes", "No"] or ["TeamA", "TeamB", "Draw"] etc.
    uint256[] outcomePools; // outcomePools[0] = total bet on outcome 0
}
```

---

### 2. **Prediction Model**

```solidity
struct UserPrediction {
    uint256 amount;
    uint8 outcomeIndex;
    bool claimed;
}
```

Each user bets on an outcome index (e.g., 0 for "Yes", 1 for "No", etc).

---

## ✨ **Optimized Smart Contract Scaffold**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReceiverTemplate} from "./interfaces/ReceiverTemplate.sol";

contract PredictionMarketV2 is ReceiverTemplate {
    using SafeTransferLib for address payable;

    enum MarketType { Binary, Categorical, Timeline }

    struct Market {
        address creator;
        uint48 createdAt;
        uint48 settledAt;
        bool settled;
        uint16 confidence;
        uint8 outcomeIndex;
        MarketType marketType;
        string question;
        string[] outcomes;
        uint256[] outcomePools;
    }

    struct UserPrediction {
        uint256 amount;
        uint8 outcomeIndex;
        bool claimed;
    }

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => UserPrediction)) public predictions;
    uint256 public nextMarketId;

    event MarketCreated(uint256 indexed marketId, string question, string[] outcomes);
    event PredictionMade(uint256 indexed marketId, address indexed user, uint8 outcome, uint256 amount);
    event MarketSettled(uint256 indexed marketId, uint8 outcomeIndex, uint16 confidence);
    event WinningsClaimed(uint256 indexed marketId, address indexed user, uint256 amount);

    constructor(address forwarder) ReceiverTemplate(forwarder) {}

    function createMarket(string memory question, string[] memory outcomes, MarketType mtype) external returns (uint256 id) {
        require(outcomes.length >= 2, "Need at least 2 outcomes");
        id = nextMarketId++;

        markets[id] = Market({
            creator: msg.sender,
            createdAt: uint48(block.timestamp),
            settledAt: 0,
            settled: false,
            confidence: 0,
            outcomeIndex: 0,
            marketType: mtype,
            question: question,
            outcomes: outcomes,
            outcomePools: new uint256[](outcomes.length)
        });

        emit MarketCreated(id, question, outcomes);
    }

    function predict(uint256 marketId, uint8 outcomeIndex) external payable {
        Market storage m = markets[marketId];
        require(!m.settled, "Already settled");
        require(outcomeIndex < m.outcomes.length, "Invalid outcome");
        require(msg.value > 0, "Invalid amount");

        UserPrediction storage up = predictions[marketId][msg.sender];
        require(up.amount == 0, "Already predicted");

        up.amount = msg.value;
        up.outcomeIndex = outcomeIndex;
        up.claimed = false;
        m.outcomePools[outcomeIndex] += msg.value;

        emit PredictionMade(marketId, msg.sender, outcomeIndex, msg.value);
    }

    function _settleMarket(bytes calldata report) internal {
        (uint256 marketId, uint8 winningIndex, uint16 confidence) = abi.decode(report, (uint256, uint8, uint16));

        Market storage m = markets[marketId];
        require(!m.settled, "Already settled");
        require(winningIndex < m.outcomes.length, "Invalid outcome");

        m.settled = true;
        m.confidence = confidence;
        m.settledAt = uint48(block.timestamp);
        m.outcomeIndex = winningIndex;

        emit MarketSettled(marketId, winningIndex, confidence);
    }

    function _processReport(bytes calldata report) internal override {
        if (report.length > 0 && report[0] == 0x01) {
            _settleMarket(report[1:]);
        } else {
            (string memory question, string[] memory outcomes, MarketType mtype) =
                abi.decode(report, (string, string[], MarketType));
            createMarket(question, outcomes, mtype);
        }
    }

    function claim(uint256 marketId) external {
        Market storage m = markets[marketId];
        require(m.settled, "Not settled yet");

        UserPrediction storage up = predictions[marketId][msg.sender];
        require(up.amount > 0 && !up.claimed, "Nothing to claim");

        if (up.outcomeIndex != m.outcomeIndex) revert("Wrong outcome");

        up.claimed = true;

        uint256 totalPool;
        for (uint256 i = 0; i < m.outcomePools.length; i++) {
            totalPool += m.outcomePools[i];
        }

        uint256 winningPool = m.outcomePools[m.outcomeIndex];
        uint256 payout = (up.amount * totalPool) / winningPool;

        (bool sent,) = payable(msg.sender).call{value: payout}("");
        require(sent, "Transfer failed");

        emit WinningsClaimed(marketId, msg.sender, payout);
    }
}
```

---

## ⚙️ CRE Workflow Integration

In your `marketCreator.js`, just send the `string[]` outcomes and `MarketType` enum:

```ts
abi.encode(["string", "string[]", "uint8"], [question, ["TeamA", "TeamB", "Draw"], 1])
```

---

## ✅ Benefits

* **Gas-efficient**: Uses packed storage, avoids mappings inside structs.
* **Flexible**: Supports any number of outcomes.
* **Upgradeable**: You can add Scalar market as `MarketType.Scalar` later.
* **CRE-friendly**: Easily encoded inputs via Chainlink Functions.

---

Would you like the Foundry tests or the updated `MarketFactory.sol` next for this upgrade?



[17 tools called]

Here’s a full, accurate walkthrough of how the **current smart contracts in this repo** work, based strictly on the code that exists today.

---

## High‑level architecture (what’s actually wired)

There are two independent CRE entrypoints:

1) **`PredictionMarket`** — the core market contract, directly receives CRE reports (create or settle).  
2) **`MarketFactory`** — a CRE receiver that validates incoming feed data and **creates markets** in `PredictionMarket`.

There is also an **oracle/settlement stack** (`CREReceiver → OracleCoordinator → SettlementRouter`) plus an ERC‑20 `Treasury`, but these are **not wired into `PredictionMarket`** at the moment. `PredictionMarket` still uses **ETH pools** and direct payouts. That stack is currently additive / optional, not integrated.

---

## 1) Core market contract: `PredictionMarket`

`PredictionMarket` is **both** a market engine and a CRE report receiver (via `ReceiverTemplate`). It supports **binary, categorical, and timeline** markets.

### Market creation
- **Binary** markets are created via `createMarket` (public), or `createMarketFor` (only the configured `marketFactory`).  
- **Categorical / Timeline** markets have explicit create functions too.  
- The MarketFactory can call `createMarketFor`, `createCategoricalMarketFor`, `createTimelineMarketFor` **if it has been set** via `setMarketFactory`.

Code refs:  
```
96:179:contracts/src/core/PredictionMarket.sol
```

### Predicting
- Predictions are **paid in ETH** (`msg.value`).
- Users can only predict once per market.
- Pools are tracked separately for binary vs typed markets.

Code refs:  
```
219:275:contracts/src/core/PredictionMarket.sol
```

### Settlement request
- `requestSettlement(marketId)` **does not settle**; it only emits `SettlementRequested`.
- CRE listens to this event (log trigger), pulls market details off‑chain, then sends back the settlement report.

Code refs:  
```
281:291:contracts/src/core/PredictionMarket.sol
```

### Settlement from CRE
- CRE sends a report to `onReport`, which dispatches to `_processReport`.  
- If report starts with **prefix `0x01`**, it means **settlement** and `_settleMarket` is used.
- Settlement report format: `abi.encode(uint256 marketId, uint8 outcomeIndex, uint16 confidence)` with prefix `0x01`.

Code refs:  
```
297:346:contracts/src/core/PredictionMarket.sol
```

### Claiming winnings
- For binary markets: payout = userAmount * totalPool / winningPool.  
- For typed markets: same idea but computed across categorical/timeline pools.  
- Payouts are done in **ETH** with `call{value: payout}("")`.

Code refs:  
```
352:413:contracts/src/core/PredictionMarket.sol
```

---

## 2) Market creation via CRE: `MarketFactory`

`MarketFactory` is a CRE receiver that **validates market data**, de‑duplicates external IDs, validates signatures (optional), and then calls into `PredictionMarket` to create a market **on behalf of** the requester.

### Key behaviors
- Accepts two report formats:
  - **V1**: no prefix → `MarketInput` (binary markets only)
  - **V2**: prefix `0x02` → `MarketInputV2` (binary/categorical/timeline)
- Validates:
  - `requestedBy` not zero
  - question length bounds
  - resolveTime > now
  - `externalId` not reused
  - optional ECDSA signature
  - marketType + outcomes/timeline consistency

Code refs:  
```
102:240:contracts/src/core/MarketFactory.sol
```

---

## 3) CRE report security: `ReceiverTemplate`

Both `PredictionMarket` and `MarketFactory` inherit this.

Key security features:
- **Forwarder check** (default): only the configured Chainlink Forwarder can call `onReport`.
- Optional expected workflow ID / author / name validation (owner can set).
- Insecure mode possible by setting forwarder to `address(0)` (warning emitted).

Code refs:  
```
76:120:contracts/src/interfaces/ReceiverTemplate.sol
122:190:contracts/src/interfaces/ReceiverTemplate.sol
```

---

## 4) Optional Oracle + Settlement stack (present but not wired)

These are **in the repo**, but not currently plugged into `PredictionMarket`.

### `CREReceiver`
- Receives CRE report: `abi.encode(address market, uint256 marketId, uint8 outcomeIndex, uint16 confidence)`
- Forwards to `OracleCoordinator.submitResult`.

Code refs:  
```
24:28:contracts/src/oracle/CREReceiver.sol
```

### `OracleCoordinator`
- Only accepts results from `creReceiver`.
- Optionally enforces confidence via `ReportValidator`.
- Calls `SettlementRouter.settleMarket`.

Code refs:  
```
41:49:contracts/src/oracle/OracleCoordinator.sol
```

### `SettlementRouter`
- Only callable by `oracleCoordinator`.
- Builds `report = 0x01 || abi.encode(marketId, outcomeIndex, confidence)`
- Calls `PredictionMarket.onReport(...)`

Code refs:  
```
43:51:contracts/src/core/SettlementRouter.sol
```

**Important:** `PredictionMarket` will only accept this if its forwarder is set to `SettlementRouter` (or forwarder check disabled). That wiring isn’t shown in the code itself; it’s a deployment/config step.

---

## 5) Treasury module (ERC‑20, not used by `PredictionMarket`)

`Treasury` is an escrow for ERC‑20 funds and supports `collectBet` / `pay`, but **`PredictionMarket` uses ETH pools and does not call it**.

Code refs:  
```
24:48:contracts/src/core/Treasury.sol
```

---

## End‑to‑end flows (as implemented)

### A) Direct CRE → market creation or settlement
1. CRE Forwarder calls `PredictionMarket.onReport`.
2. `ReceiverTemplate` checks forwarder + workflow metadata.
3. If report starts with `0x01`, it settles the market.
4. Otherwise it treats report as a string question and creates a new binary market.

### B) CRE → MarketFactory → PredictionMarket
1. CRE Forwarder calls `MarketFactory.onReport`.
2. Factory validates payload and creates a market in `PredictionMarket` with explicit `requestedBy`.
3. `PredictionMarket` stores metadata and emits events.

---

## If you want the oracle/settlement stack to be “the” settlement path

Right now, `PredictionMarket` still expects CRE to call it directly.  
If you want the oracle stack to settle it:

- Set `PredictionMarket` forwarder to `SettlementRouter` (or disable forwarder check).  
- Ensure `CREReceiver` is the CRE forwarder entrypoint.  
- Configure `OracleCoordinator` and `SettlementRouter` addresses.

This wiring is possible with the current code but not enforced by it.

---

If you want, I can also provide:
- A diagram of the exact flow for your current deployment
- A minimal checklist for wiring the optional oracle stack
- A safe configuration for `ReceiverTemplate` (forwarder + workflow checks)

Just tell me which one you want.