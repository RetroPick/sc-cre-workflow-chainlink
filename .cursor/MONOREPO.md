# RetroPick: Full Architecture with CRE Integration

## Overview

RetroPick is a decentralized, real-time prediction market that combines gasless state channel betting with stablecoin-backed settlement and trusted outcome resolution. This architecture combines:

* **Yellow Network** for off-chain, gasless sessions
* **Arc** for deterministic USDC-based settlement
* **LI.FI / Circle CCTP** for cross-chain USDC entry
* **Chainlink Functions (CRE)** for secure and flexible event outcome resolution

---

## System Architecture

### 1. **User Flow & Session Initiation**

* **USDC Onboarding:**

  * Users on any EVM chain initiate a deposit using **LI.FI** or **Circle CCTP**.
  * Funds are bridged to **Arc** and deposited into RetroPick's Arc smart contract.

* **Session Start:**

  * User connects wallet to frontend.
  * Yellow SDK initializes a **state channel session** between user and RetroPick app.
  * User's deposit amount is locked on Arc, while trades are tracked off-chain.

### 2. **Off-Chain Betting Engine (Yellow SDK)**

* All trades, odds updates, position changes happen **off-chain** via Yellow's state channel protocol (ERC-7824).
* Messages are signed by users and relayed instantly.
* User balance is updated in real-time without incurring gas costs.
* Example: Alice bets 10 USDC on "Yes" → balance updates reflected off-chain.

### 3. **Market Close & CRE Resolution Trigger**

* When a market ends (e.g. ETH > $2300 at 12:00 UTC), the RetroPick Arc smart contract:

  * Closes the session with Yellow SDK: retrieves final user balances
  * Triggers a **Chainlink Function (CRE)** to fetch the event outcome

* **Chainlink Function:**

  * Calls an external API (e.g. CoinGecko, Coindesk, ESPN, etc.) securely
  * Validates the outcome (e.g. `"yes"`, `price = 2340`, `score = 2-1`)
  * Returns result to RetroPick Arc contract

### 4. **Settlement on Arc**

* Arc contract receives CRE result and determines:

  * Which users predicted correctly
  * Calculates payouts based on final odds and balance
  * Transfers USDC to users via Arc's native stablecoin logic

### 5. **Withdrawals**

* Users can withdraw their USDC:

  * Directly if staying on Arc
  * Via **LI.FI** or **Circle CCTP** to return to their original chain (Ethereum, Polygon, etc.)

---

## Visual Layer Mapping

| Layer                 | Tool                      | Purpose                                             |
| --------------------- | ------------------------- | --------------------------------------------------- |
| Frontend              | React + MetaMask          | Wallet connection, UI, trade flow                   |
| Off-Chain Engine      | Yellow SDK                | Session-based gasless trading                       |
| Smart Contracts       | Arc                       | Secure collateral custody, CRE oracle, payout logic |
| Oracle Resolution     | Chainlink Functions (CRE) | Fetch trusted event outcome from HTTPS APIs         |
| Cross-Chain Liquidity | LI.FI SDK / Circle CCTP   | USDC on-ramp/off-ramp from/to EVM chains            |
| Testing               | Arc Faucet                | Provide testnet USDC to simulate trades             |

---

## Benefits of CRE Layer

* Supports any HTTPS API
* Event-agnostic: works for price, governance, sports, and news-based markets
* Fully auditable oracle call
* Eliminates need for centralized resolution authority

---

## Sample CRE Use Case

**Market**: "Will BTC be above $45,000 on Feb 8, 2026?"

* Market closes: Feb 8, 2026, 12:00 UTC
* CRE fetches: `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd`
* Outcome: BTC = 45,732 → "Yes" side wins
* Smart contract pays out all "Yes" bettors based on locked odds

---

Let me know if you'd like code snippets for the CRE trigger or Yellow session logic next.


Here's your structured GitHub `README.md` for the **RetroPick** repo architecture:

---

# 🧠 RetroPick Monorepo

RetroPick is a real-time, gasless prediction market powered by Yellow Network's state channels, Arc's stablecoin-native settlement, and Chainlink Functions (CRE) for oracle-based market resolution. This fullstack monorepo includes contracts, backend services, and autonomous workflows to dynamically generate markets from free APIs.

---

## 📁 Repository Structure

### `/contracts`

Smart contracts written in Solidity for prediction logic, market factory, treasury, and Chainlink oracle integration.

```
contracts/
├── core/
│   ├── Market.sol               # Main prediction market logic
│   ├── MarketFactory.sol        # Deploys markets dynamically (via CRE)
│   └── Treasury.sol             # USDC management and payouts
├── interfaces/
│   ├── IMarket.sol              # Interface for core market logic
│   └── IOracleConsumer.sol      # Interface for CRE result consumer
├── oracles/
│   ├── CREConsumer.sol          # Chainlink Functions callback consumer
│   └── OracleCoordinator.sol    # Middleware to pipe oracle results to contracts
├── utils/
│   └── Errors.sol               # Reusable gas-efficient error types
├── libraries/
│   └── MarketLib.sol            # Shared logic (payout math, state management)
└── test/
    └── Market.t.sol             # Foundry tests for Market.sol
```

---

### `/backend`

TypeScript backend for orchestrating Yellow state channels, handling API routes, and coordinating Arc settlement.

```
backend/
├── api/
│   ├── routes/
│   │   └── market.ts            # Market creation, status check, result verification
│   └── index.ts                 # Express API server entry point
├── services/
│   ├── yellow.ts                # Nitrolite SDK session manager (off-chain trades)
│   └── arc.ts                   # Smart contract calls on Arc for resolution
├── jobs/
│   └── monitor.ts               # Cron job to watch market close → trigger CRE
└── utils/
    └── config.ts                # Backend config (network, keys, etc.)
```

---

### `/workflow`

Autonomous CRE-driven engine for ingesting API feeds and spawning prediction markets without manual intervention.

```
workflow/
├── sources/
│   ├── newsAPI.js               # CRE input: headline sentiment markets
│   ├── coinGecko.js             # Price oracle for crypto prediction markets
│   ├── githubTrends.js          # Developer activity predictions
│   └── customFeeds.js           # JSON parser for user-defined API endpoints
├── builders/
│   ├── generateMarket.js        # Convert feeds → market struct + metadata
│   ├── buildFunctionRequest.js  # CRE payload builder (for Chainlink Functions)
│   └── schemaValidator.js       # Feed format and result validation
├── jobs/
│   ├── scheduleTrigger.js       # Cron scheduler to check new feeds
│   ├── resultProcessor.js       # CRE output handler → calls Arc contracts
│   └── marketCreator.js         # Deploys markets via MarketFactory on valid input
├── config/
│   └── feeds.json               # Maps APIs to prediction themes (macro, sports, etc.)
└── test/
    └── integration.test.js      # Simulates end-to-end market lifecycle
```

---

## 🧩 Innovative Workflow

> RetroPick uses autonomous CRE to power market generation and resolution:

1. `sources/`: Pull free APIs like CoinGecko, NewsAPI, GitHub, etc.
2. `builders/`: Clean + validate responses, encode outcomes.
3. `scheduleTrigger.js`: Runs every 15 minutes to query feeds.
4. `generateMarket.js` → `marketCreator.js`: Deploys new prediction market on Arc.
5. `buildFunctionRequest.js`: Prepares Chainlink Functions job per market.
6. Chainlink executes job at deadline → result sent to `CREConsumer.sol`.
7. Smart contracts verify result → settle market → pay USDC via `Treasury.sol`.

---

## 🧪 Optional Extensions

* `feeds/submit.js`: Let users suggest new APIs → vote → auto-deployed.
* GPT-based parser in `builders/`: Generate binary markets from unstructured news.
* `history/` archive: Store resolved market metadata and snapshots for analytics.

---

## 🛠 Technologies Used

* **Solidity (Foundry)** — Smart contracts (Arc, Yellow state channels)
* **Chainlink Functions (CRE)** — Event resolution + API fetch
* **Yellow SDK (Nitrolite)** — Off-chain gasless betting
* **Arc Network** — Stablecoin-native gas + deterministic finality
* **LI.FI SDK** — Cross-chain USDC routing
* **TypeScript (Node.js)** — API server, backend automation
* **React** — (Pluggable frontend)

---

Let me know if you'd like a template `package.json`, `.env.example`, or full setup instructions for contributors.
