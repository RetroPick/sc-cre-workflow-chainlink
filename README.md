# RetroPick — Smart Contract CRE Workflow

Modular prediction-market protocol with **Chainlink CRE** orchestration. On-chain custody, settlement, and fees; off-chain trading via relayer; oracle and publish flows via Chainlink Request-and-Execute.

## Monorepo Structure

| Path | Purpose |
|------|---------|
| [packages/contracts](packages/contracts) | Smart contracts (Foundry); 24 verified on Avalanche Fuji; ABIs, docs |
| [apps/front-end-v2](apps/front-end-v2) | Frontend — React, Vite, Wagmi, Reown AppKit |
| [apps/relayer](apps/relayer) | Off-chain trading engine — LS-LMSR, checkpoint building, CRE endpoints |
| [apps/workflow](apps/workflow) | Chainlink CRE workflows — market creation, session snapshot, settlement |
| [packages/shared](packages/shared) | Shared utilities and types |

## Quick Start

```bash
# Smart contracts
cd packages/contracts && forge build && forge test

# Relayer
cd apps/relayer && cp .env.example .env && bun run dev

# Frontend
cd apps/front-end-v2 && npm install && npm run dev

# CRE workflow
cd apps/workflow && bun install && cre workflow simulate ./apps/workflow --target=staging-settings
```

## Architecture

```
Chainlink Forwarder → CREReceiver → OracleCoordinator → SettlementRouter
                                         ├→ MarketRegistry (resolve, redeem)
                                         └→ ChannelSettlement (checkpoint 0x03)

Relayer: GET /cre/checkpoints/:sessionId → CRE fetches → writes 0x03 report → ChannelSettlement
```

See [packages/contracts/README.md](packages/contracts/README.md) for full architecture, contract inventory, and deployment addresses.

## License

MIT
