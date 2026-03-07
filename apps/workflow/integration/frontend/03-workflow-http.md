# Workflow HTTP Trigger

**Audience:** Frontend engineers  
**Source:** [httpCallback.ts](../../src/httpCallback.ts) | [CreationFlows.md](../../docs/CreationFlows.md)

---

## 1. How to Invoke

The CRE platform exposes an HTTP trigger URL after workflow deployment. The frontend POSTs JSON to this URL; CRE decodes `payload.input` and routes to the appropriate handler.

**Environment variable:** `VITE_WORKFLOW_HTTP_URL` (or equivalent). Obtain from the CRE platform UI after deploying the workflow.

**Request:** `POST {workflowHttpUrl}` with `Content-Type: application/json` and a JSON body. The CRE platform wraps the body as `payload.input`.

**Example (fetch):**

```typescript
const WORKFLOW_URL = import.meta.env.VITE_WORKFLOW_HTTP_URL;

async function callWorkflow(payload: object) {
  const res = await fetch(WORKFLOW_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

---

## 2. Route 1 — Create Market (Direct)

When `orchestration.enabled` is false, the workflow creates markets directly via MarketFactory.

### Payload

```json
{
  "question": "Will BTC hit 100k by end of 2025?",
  "resolveTime": 1735689600,
  "category": "crypto",
  "requestedBy": "0x..."
}
```

| Field | Required | Description |
|-------|----------|-------------|
| question | Yes | Market question text |
| title | No | Alias for question (fixtures use "title") |
| resolveTime | No | Unix timestamp; default: now + 24h |
| category | No | Label; default: "http" |
| requestedBy | No | Creator address; falls back to config.creatorAddress |

### Response

```json
{
  "ok": true,
  "message": "Created 1 markets"
}
```

### Requirements

- `marketFactoryAddress` in workflow config
- `creatorAddress` in config or `requestedBy` in payload

### Errors

- `"Error: Question is required"` — missing question/title
- `"Error: creatorAddress or requestedBy required"` — no creator
- `"Error: marketFactoryAddress required"` — workflow not configured for create

---

## 3. Route 2 — Create Market (Orchestration)

When `orchestration.enabled` is true, the workflow runs analysis (classify, risk, evidence, resolution plan) before creating.

### Payload

```json
{
  "question": "Will inflation fall below 2% by Q2 2025?",
  "resolveTime": 1735689600,
  "category": "economics",
  "requestedBy": "0x...",
  "preview": true
}
```

| Field | Required | Description |
|-------|----------|-------------|
| question | Yes | Market question |
| title | No | Alias for question |
| resolveTime | No | Unix timestamp; default: now + 24h |
| category | No | Label; default: "http" |
| requestedBy | No | Creator address |
| preview | No | When true: analysis only, no market/draft created |

### Response (preview or ALLOW/REVIEW)

```json
{
  "ok": true,
  "policy": {
    "status": "ALLOW",
    "reasons": [],
    "policyVersion": "...",
    "ruleHits": []
  },
  "understanding": {
    "category": "...",
    "eventType": "...",
    "candidateQuestion": "...",
    "marketType": 0,
    "ambiguityScore": 0.2,
    "marketabilityScore": 0.9
  },
  "resolutionPlan": {
    "resolutionMode": "multi_source_deterministic",
    "oracleabilityScore": 0.85,
    "unresolvedCheckPassed": true,
    "primarySources": [...],
    "reasons": []
  },
  "draft": {
    "draftId": "0x...",
    "canonicalQuestion": "...",
    "outcomes": ["Yes", "No"],
    "explanation": "...",
    "evidenceLinks": []
  },
  "draftId": "0x...",
  "status": "PENDING_CLAIM",
  "brochure": { ... }
}
```

When `draftingPipeline` is true and policy is ALLOW/REVIEW, a DraftRecord is created and `draftId` is returned. User must claim and publish separately (Route 3).

When `preview: true`, only analysis is returned; no draft or market is created.

---

## 4. Route 3 — Publish-from-Draft

For the curated drafting pipeline: user has claimed a draft on MarketDraftBoard and signs EIP-712 PublishFromDraft. Frontend sends the payload to trigger on-chain market creation.

### Payload

```json
{
  "draftId": "0x...",
  "creator": "0x...",
  "params": {
    "question": "Will X happen?",
    "marketType": 0,
    "outcomes": ["Yes", "No"],
    "timelineWindows": [],
    "resolveTime": 1735689600,
    "tradingOpen": 0,
    "tradingClose": 1735689600
  },
  "claimerSig": "0x..."
}
```

| Field | Required | Description |
|-------|----------|-------------|
| draftId | Yes | Draft ID (bytes32) |
| creator | Yes | Creator/claimer address |
| params | Yes | DraftPublishParams (see below) |
| claimerSig | Yes | EIP-712 PublishFromDraft signature |

**params (DraftPublishParams):**

| Field | Type | Description |
|-------|------|-------------|
| question | string | Canonical question |
| marketType | number | 0=binary, 1=categorical, 2=timeline |
| outcomes | string[] | e.g. ["Yes", "No"] |
| timelineWindows | number[] | For timeline markets |
| resolveTime | number | Unix timestamp |
| tradingOpen | number | Unix timestamp |
| tradingClose | number | Unix timestamp |

### Response (success)

```json
{
  "ok": true,
  "txHash": "0x..."
}
```

### Response (failure)

```json
{
  "ok": false,
  "error": "Draft not found"
}
```

### Errors

- `"Draft not found"` — draftId not in draft repository
- `"Eligibility denied"` — COMPLIANCE_GATED market; user failed eligibility check
- Revalidation failure messages (e.g. params mismatch, draft expired)

### Prerequisites

- Draft must be claimed on MarketDraftBoard (claimAndSeed)
- Creator must match claimer
- Creator signs EIP-712 PublishFromDraft; claimerSig included in payload

---

## 5. Error Handling Summary

| Condition | Response |
|-----------|----------|
| Empty input | `"Error: Empty Request"` |
| Missing question (create) | `"Error: Question is required"` |
| Missing creator | `"Error: creatorAddress or requestedBy required"` |
| Draft not found (publish) | `{ ok: false, error: "Draft not found" }` |
| Revalidation failed | `{ ok: false, error: "<reason>" }` |
| Eligibility denied | `{ ok: false, error: "<reasonCode>" }` |

---

## 6. References

- [CreationFlows.md](../../docs/CreationFlows.md) — All creation paths
- [ContractIntegration.md](../../docs/ContractIntegration.md) — Report formats
- [packages/contracts/docs/abi/docs/cre/CREWorkflowPublish.md](../../../packages/contracts/docs/abi/docs/cre/CREWorkflowPublish.md)
