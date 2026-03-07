# Frontend Integration Docs

Step-by-step guides for integrating the frontend with the CRE Chainlink Workflow and Relayer. This directory provides detailed API schemas, flows, and troubleshooting beyond the high-level [FRONTEND_INTEGRATION.md](../../docs/FRONTEND_INTEGRATION.md) checklist.

---

## Prerequisites

- **Wallet connection** (e.g. wagmi, viem) for EIP-712 signing
- **Environment variables** configured (see [04-configuration.md](04-configuration.md))
- **Contract addresses** for the target chain (Fuji/Sepolia) from [DeploymentConfig.md](../../../packages/contracts/docs/abi/docs/frontend/DeploymentConfig.md)

---

## Quick Reference

| Component | Config / URL |
|-----------|--------------|
| Relayer base URL | `VITE_RELAYER_URL` (e.g. `https://backend-relayer-production.up.railway.app`) |
| Workflow HTTP trigger | `VITE_WORKFLOW_HTTP_URL` (provided by CRE platform after deployment) |
| ChannelSettlement (Fuji) | `0xFA5D0e64B0B21374690345d4A88a9748C7E22182` |
| CREReceiver (Fuji) | `0x51c0680d8E9fFE2A2f6CC65e598280D617D6cAb7` |
| OutcomeToken1155 (Fuji) | `0x9B413811ecfD0e0679A7Ba785de44E15E7482044` |

---

## Document Index

| Doc | Description |
|-----|-------------|
| [01-relayer-api.md](01-relayer-api.md) | Relayer API contract (trading + CRE checkpoint endpoints) |
| [02-checkpoint-signing.md](02-checkpoint-signing.md) | EIP-712 checkpoint signing flow |
| [03-workflow-http.md](03-workflow-http.md) | Workflow HTTP trigger (create market, publish-from-draft) |
| [04-configuration.md](04-configuration.md) | Environment variables and config matrix |
| [05-sequence-diagrams.md](05-sequence-diagrams.md) | Mermaid diagrams for integration flows |
| [06-troubleshooting.md](06-troubleshooting.md) | Common issues and verification checklist |

---

## Source Checklist

For the high-level integration checklist, see [docs/FRONTEND_INTEGRATION.md](../../docs/FRONTEND_INTEGRATION.md).
