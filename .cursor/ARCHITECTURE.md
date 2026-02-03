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
