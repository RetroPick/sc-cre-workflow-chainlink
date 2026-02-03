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
├── src/
│   ├── core/                       # Primary contracts for betting
│   │   ├── PredictionMarket.sol   # Handles market creation, bets, resolution
│   │   └── MarketFactory.sol      # Optional: factory to deploy market instances
│   ├── interfaces/                # External protocol and system interfaces
│   │   ├── IReceiver.sol          # Chainlink Functions receiver interface
│   │   └── IStateChannel.sol      # Yellow Network integration interface
│   ├── receivers/                 # Templates and CRE-compatible receivers
│   │   └── ReceiverTemplate.sol   # Logic to parse/validate CRE payload
│   ├── utils/                     # Shared helpers (Math, Transfer)
│   │   ├── Math.sol
│   │   └── ERC20Utils.sol
│   └── constants/                 # Project-wide config constants
│       └── Errors.sol             # Custom errors for gas savings
├── test/
│   ├── unit/                      # Unit tests per contract
│   ├── integration/               # End-to-end flows including CRE + Yellow
│   └── mocks/                     # Dummy contracts and ERCs for testing
├── foundry.toml                  # Foundry config
├── foundry.lock
├── README.md
```

---

## Explanation of Key Folders

### `core/`

* Main application logic
* `PredictionMarket.sol` supports joining, betting, settling markets
* Includes events and modifiers for lifecycle tracking

### `receivers/`

* Chainlink Functions receivers that match with workflows in `/workflow`
* Can reuse parsing logic across multiple prediction sources

### `interfaces/`

* Interfaces for CRE, ERC20, and Yellow state channel contracts
* Keeps the system modular and testable

### `utils/`

* Gas-optimized helpers for math, transfers, and security

### `constants/`

* Custom errors and pre-defined constants shared across the contracts

### `test/`

* Follows Foundry standard
* Split into `unit/`, `integration/`, and `mocks/` for clarity

---

Let me know if you'd like to scaffold these contracts with minimal boilerplate, or add Slither/Forge CI integration.
