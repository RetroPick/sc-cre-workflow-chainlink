# Configuration Reference

**Audience:** Frontend engineers, DevOps  
**Related:** [DeploymentConfig.md](../../../packages/contracts/docs/abi/docs/frontend/DeploymentConfig.md) | [Configuration.md](../../docs/Configuration.md)

---

## 1. Frontend Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_RELAYER_URL` | Yes | Base URL for relayer API (trading, checkpoint). Example: `https://backend-relayer-production.up.railway.app` |
| `VITE_WORKFLOW_HTTP_URL` | Optional | Workflow HTTP trigger URL (create market, publish-from-draft). Provided by CRE platform after deployment. |
| `VITE_CHAIN_ID` | For signing | Chain ID (e.g. `43113` for Fuji, `11155111` for Sepolia) |
| `VITE_RPC_URL` | For reads | RPC endpoint for contract reads and wallet connection |
| `VITE_MARKET_REGISTRY` | For reads | MarketRegistry contract address |
| `VITE_CHANNEL_SETTLEMENT` | For signing | ChannelSettlement address (EIP-712 verifyingContract) |
| `VITE_OUTCOME_TOKEN` | For reads | OutcomeToken1155 address |
| `VITE_MARKET_DRAFT_BOARD` | For publish | MarketDraftBoard address (curated path) |
| `VITE_POLYMARKET_API_KEY` | Optional | Polymarket Gamma API key (rate limit bypass). Never commit to source. |

**Example (.env):**

```
VITE_RELAYER_URL=https://backend-relayer-production.up.railway.app
VITE_WORKFLOW_HTTP_URL=https://your-cre-workflow-http-trigger.chain.link
VITE_CHAIN_ID=43113
VITE_RPC_URL=https://avalanche-fuji.infura.io/v3/YOUR_PROJECT_ID
VITE_CHANNEL_SETTLEMENT=0xFA5D0e64B0B21374690345d4A88a9748C7E22182
VITE_OUTCOME_TOKEN=0x9B413811ecfD0e0679A7Ba785de44E15E7482044
VITE_MARKET_REGISTRY=0x3235094A8826a6205F0A0b74E2370A4AC39c6Cc2
VITE_MARKET_DRAFT_BOARD=0x8a81759d0A4383E4879b0Ff298Bf60ff24be8302
```

**Local development:**

```
VITE_RELAYER_URL=http://localhost:8790
VITE_CHAIN_ID=43113
```

---

## 2. Config Matrix (What You Need)

| Feature | VITE_RELAYER_URL | VITE_WORKFLOW_HTTP_URL | Contract Addresses |
|---------|------------------|------------------------|---------------------|
| Trading (buy/sell/swap) | Yes | No | No |
| Checkpoint signing | Yes | No | Yes (ChannelSettlement, chainId) |
| Create market (HTTP) | No | Yes | No (workflow has them) |
| Publish-from-draft | No | Yes | Yes (MarketDraftBoard for claim) |

---

## 3. Workflow Configuration (Ops)

For the workflow to operate correctly with the frontend/relayer, these config values must be set in `config.staging.json` or `config.production.json`:

| Config | Required | Purpose |
|--------|----------|---------|
| `relayerUrl` | Yes | Relayer base URL for checkpoint jobs |
| `creReceiverAddress` | Yes | CREReceiver for resolution and checkpoint |
| `crePublishReceiverAddress` | For publish | CREPublishReceiver for publish-from-draft |
| `marketFactoryAddress` | For create | Market creation target |
| `evms[0].chainSelectorName` | Yes | Chain (e.g. `avalanche-fuji`, `ethereum-testnet-sepolia`) |
| `evms[0].gasLimit` | Yes | Gas limit for writeReport |
| `creatorAddress` | For feeds | Default creator for feed-driven creation |
| `curatedPath.crePublishReceiverAddress` | For publish | CREPublishReceiver (overrides top-level) |

See [Configuration.md](../../docs/Configuration.md) for full reference.

---

## 4. Relayer Configuration (Ops)

The relayer must have these set for checkpoint flow:

| Variable | Purpose |
|----------|---------|
| `CHANNEL_SETTLEMENT_ADDRESS` | EIP-712 verifyingContract; required for checkpoint build |
| `OPERATOR_PRIVATE_KEY` | Operator signs checkpoints; must match ChannelSettlement.operator |
| `RPC_URL` | Chain reads (nonce sync, finalize/cancel tx) |
| `CHAIN_ID` | EIP-712 domain chainId |

---

## 5. Contract Addresses (Fuji)

From [DeploymentConfig.md](../../../packages/contracts/docs/abi/docs/frontend/DeploymentConfig.md):

| Contract | Address |
|----------|---------|
| ChannelSettlement | `0xFA5D0e64B0B21374690345d4A88a9748C7E22182` |
| OutcomeToken1155 | `0x9B413811ecfD0e0679A7Ba785de44E15E7482044` |
| MarketRegistry | `0x3235094A8826a6205F0A0b74E2370A4AC39c6Cc2` |
| MarketDraftBoard | `0x8a81759d0A4383E4879b0Ff298Bf60ff24be8302` |
| CREReceiver | `0x51c0680d8E9fFE2A2f6CC65e598280D617D6cAb7` |
| CREPublishReceiver | `0x3AA7E5A28A72Df248806397Ea16C03fB10c46830` |

---

## 6. TypeScript Env Declaration

```typescript
interface ImportMetaEnv {
  readonly VITE_RELAYER_URL: string;
  readonly VITE_WORKFLOW_HTTP_URL?: string;
  readonly VITE_CHAIN_ID: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_CHANNEL_SETTLEMENT?: string;
  readonly VITE_OUTCOME_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

---

## 7. Runtime Check

```typescript
const RELAYER_URL = import.meta.env.VITE_RELAYER_URL;

if (!RELAYER_URL) {
  throw new Error("VITE_RELAYER_URL is required for relayer API calls");
}
```
