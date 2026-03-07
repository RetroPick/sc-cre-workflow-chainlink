# RetroPick Hackathon Demo

A **deterministic, no-LLM** CRE workflow for the Chainlink Convergence hackathon. This demo proves RetroPick uses CRE as the orchestration layer to turn external data or user input into a reviewed market draft, publish it through a controlled flow, and settle it via an event-driven handler.

## What This Demo Proves

1. **Proposal → Draft**: User sends a proposal; CRE analyzes it with mock intelligence; system returns allow/review/reject, draft artifact, brochure, and resolution plan.
2. **Publish from Draft**: User claims a draft; CRE validates and publishes through the controlled path.
3. **Event-Driven Settlement**: Market emits `SettlementRequested`; CRE log trigger detects it; mock resolver returns a deterministic outcome; CRE submits the report.

## Why It Is Separate from Production

The production workflow includes orchestration, ML, policy, drafting, publish, settlement, monitoring, and privacy. The demo is **deterministic**, **mock-heavy**, **single-config**, and **local-simulation first** — optimized for hackathon reliability and reproducibility.

## Architecture

```
HTTP Proposal Trigger
  → demoAnalyzeCandidate (mocks)
  → mock classify / risk / evidence / brochure
  → deterministic policy
  → draft record in memory

HTTP Publish Trigger
  → validate claim payload
  → revalidate draft
  → publishFromDraft → MarketFactory.createFromDraft

EVM Log Trigger (SettlementRequested)
  → fetch market
  → mock deterministic resolver
  → write settlement report
```

## Folder Structure

```
demo/
├── main-demo.ts           # CRE entry; registers HTTP + log handlers
├── demoHttpCallback.ts    # Proposal preview + publish-from-draft
├── demoLogTrigger.ts      # Settlement handler (mock resolver)
├── demoAnalyzeCandidate.ts
├── mocks/
│   ├── mockClassifier.ts
│   ├── mockRiskScorer.ts
│   ├── mockEvidenceProvider.ts
│   ├── mockBrochure.ts
│   ├── mockResolutionPlan.ts
│   └── mockSettlementResolver.ts
├── fixtures/
│   ├── proposal-safe.json
│   ├── proposal-review.json
│   ├── proposal-reject.json
│   ├── publish-safe.json
│   └── settlement-safe.json
└── README.md
```

## Setup

### Prerequisites

- CRE CLI installed
- Bun installed
- Sepolia RPC URL
- One funded Sepolia key (for broadcast mode)

### Install

From the **monorepo root** (`sc-cre-workflow-chainlink/`):

```bash
cd apps/workflow
bun install
cp .env.example .env   # if exists
```

If your terminal is already in `apps/workflow` (e.g. Cursor workspace root), skip the `cd` and run `bun install` directly.

### Configure

1. Copy `config.demo.json` and fill in:
   - `evms[0].marketAddress` — PoolMarketLegacy address for SettlementRequested
   - `creReceiverAddress` — CREReceiver for settlement reports
   - `creatorAddress` — Creator wallet
   - `curatedPath.crePublishReceiverAddress` — For publish-from-draft (optional)

2. Set `.env`:
   ```
   RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
   CRE_ETH_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
   ```

### Run Demo

The demo runs via the CRE CLI (provides the runtime). **Recommended: run from the monorepo root** so CRE finds both `project.yaml` (RPCs) and `workflow.yaml` (demo target).

**From the monorepo root** (`sc-cre-workflow-chainlink/`):

```bash
cre workflow simulate ./apps/workflow -T demo-settings
```

**From `apps/workflow`** (if `project.yaml` and RPCs are configured there):

```bash
cre workflow simulate . -T demo-settings
```

When prompted, select the HTTP trigger and provide a fixture path, e.g. `@demo/fixtures/proposal-safe.json` or paste the JSON.

**If your `.env` is in `apps/workflow`** and you run from the monorepo root, pass it explicitly:

```bash
cre workflow simulate ./apps/workflow -T demo-settings -e apps/workflow/.env --http-payload @apps/workflow/demo/fixtures/proposal-safe.json
```

### Troubleshooting

| Error | Fix |
|-------|-----|
| `no RPC URLs found` | Add `demo-settings` to `project.yaml` (at monorepo root) with `rpcs` for ethereum-testnet-sepolia. |
| `open demo/tmp.wasm: no such file or directory` | The demo now uses `src/demo-main.ts` as the entry so CRE finds `src/tmp.wasm`. Run `bun install` in `apps/workflow` first (cre-setup creates tmp.wasm). |
| `cd apps/workflow` fails | You may already be in `apps/workflow`; run `pwd` to confirm. |

## Simulation Commands

### Proposal Preview (Flow A — Safe)

```bash
# From monorepo root:
cre workflow simulate ./apps/workflow -T demo-settings --http-payload @apps/workflow/demo/fixtures/proposal-safe.json

# Or run interactively: select HTTP trigger, then provide path: demo/fixtures/proposal-safe.json
```

Expected: `ALLOW`, draft generated, brochure generated, `PENDING_CLAIM`.

### Proposal Preview (Flow B — Review)

Use `demo/fixtures/proposal-review.json`. Expected: `REVIEW`, brochure, `REVIEW_REQUIRED`.

### Proposal Preview (Flow C — Reject)

Use `demo/fixtures/proposal-reject.json`. Expected: `REJECT`, no claimable draft.

### Publish from Draft (Flow D)

1. Run proposal-safe first to create a draft.
2. Use the returned `draftId` in `demo/fixtures/publish-safe.json` (or use the precomputed ETH fixture draftId).
3. Provide publish payload to HTTP trigger.

Expected: publish validation succeeds, `createFromDraft` called, market active.

### Settlement (Flow E)

1. Deploy or use a demo market.
2. Call `requestSettlement(marketId)` on the market.
3. Run workflow simulation with the triggering transaction hash and log index.

Expected: settlement handler loads plan, mock resolver returns outcome, CRE writes report.

## Payload Examples

### proposal-safe.json

```json
{
  "title": "Will ETH exceed $6000 by December 31, 2026?",
  "body": "Threshold market based on public market data",
  "sourceType": "http_proposal"
}
```

### publish-safe.json

```json
{
  "draftId": "0x3c37c2c1d9bfd2bfe058983a55ac0c0f609f2e7706be7db6175f4075120fc494",
  "creator": "0x1111111111111111111111111111111111111111",
  "params": {
    "question": "Will ETH exceed $6000 by December 31, 2026?",
    "marketType": 0,
    "outcomes": ["Yes", "No"],
    "timelineWindows": [],
    "resolveTime": 1798675200,
    "tradingOpen": 0,
    "tradingClose": 0
  },
  "claimerSig": "0xdeadbeef"
}
```

The `draftId` above is the deterministic ID for the ETH $6000 proposal. Run proposal-safe with that question first to create the draft, then use this payload to publish.

## Where Chainlink CRE Is Used

- **demo/main-demo.ts**: CRE Runner, HTTP capability, EVM log trigger, `cre.handler`
- **demo/demoHttpCallback.ts**: HTTP trigger handler (proposal + publish)
- **demo/demoLogTrigger.ts**: EVM log trigger handler, `evmClient.writeReport`
- **src/pipeline/creation/publishFromDraft.ts**: CRE report encoding, EVM write
- **src/contracts/reportFormats.ts**: Report encoding for CREReceiver

## Mocked vs Real

| Component        | Demo                    | Production              |
|-----------------|-------------------------|-------------------------|
| Classifier      | mockClassifier (rules)  | LLM or rule-based       |
| Risk scorer     | mockRiskScorer         | LLM + lexical           |
| Evidence        | mockEvidenceProvider   | External fetchers       |
| Brochure        | mockBrochure (template)| LLM explain             |
| Settlement      | mockSettlementResolver | resolveFromPlan / LLM   |
| Draft storage   | In-memory (same repo)   | In-memory / Firestore   |
| Policy          | Real (evaluatePolicy)   | Real                    |
| Publish         | Real (publishFromDraft)| Real                    |
| CRE triggers    | Real                    | Real                    |

## Video Script (3–5 min)

- **0–1 min**: Architecture — CRE orchestration, no-LLM demo lane, proposal → draft → publish → settle
- **1–2 min**: Run proposal preview (safe market), show logs, draft artifact, brochure
- **2–3 min**: Run publish-from-draft with claim payload, show creation logs
- **3–4 min**: Trigger settlement, simulate CRE log-trigger workflow, show deterministic outcome
- **4–5 min**: Audit output — policy result, draft state, settlement record
