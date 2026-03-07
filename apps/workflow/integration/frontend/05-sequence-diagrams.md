# Integration Sequence Diagrams

Mermaid diagrams for frontend integration flows. See [CheckpointFlow.md](../../docs/CheckpointFlow.md) and [CREWorkflowIntegration.md](../../../front-end-v2/docs/abi/docs/cre/CREWorkflowIntegration.md) for detailed specs.

---

## 1. Checkpoint Flow (Option A: Stored Sigs)

Frontend stores user signatures via `POST /cre/checkpoints/:sessionId/sigs` before the CRE cron runs. CRE fetches stored sigs and POSTs with empty body.

```mermaid
sequenceDiagram
    participant User as User (Frontend)
    participant Relayer as Relayer
    participant CRE as CRE Workflow
    participant FWD as Forwarder
    participant CR as CREReceiver
    participant SR as SettlementRouter
    participant CS as ChannelSettlement

    User->>Relayer: Trade (POST /api/trade/*)
    Note over Relayer: Session state updated
    User->>Relayer: GET /cre/checkpoints/:sessionId
    Relayer->>User: digest, users, checkpoint
    User->>User: Prompt users to sign EIP-712
    User->>Relayer: POST /cre/checkpoints/:sessionId/sigs (userSigs)
    Note over Relayer: Store sigs for CRE (TTL 10 min)
    CRE->>Relayer: GET /health (pre-flight)
    CRE->>Relayer: GET /cre/checkpoints
    Relayer->>CRE: checkpoints with hasDeltas
    loop For each session
        CRE->>Relayer: POST /cre/checkpoints/:sessionId (empty body)
        Relayer->>CRE: 0x03 || payload
        CRE->>FWD: writeReport(payload)
        FWD->>CR: onReport(payload)
        CR->>SR: submitSession -> finalizeSession
        SR->>CS: submitCheckpointFromPayload
    end
    Note over CS: 30 min challenge window
    CRE->>Relayer: POST /cre/finalize/:sessionId
    Relayer->>CS: finalizeCheckpoint
```

---

## 2. Publish-from-Draft Flow

Frontend has a claimed draft; user signs PublishFromDraft; frontend POSTs to workflow HTTP trigger.

```mermaid
sequenceDiagram
    participant User as User (Frontend)
    participant Workflow as CRE Workflow HTTP
    participant FWD as Forwarder
    participant CPR as CREPublishReceiver
    participant MF as MarketFactory

    User->>User: Claim draft on MarketDraftBoard
    User->>User: Sign EIP-712 PublishFromDraft
    User->>Workflow: POST { draftId, creator, params, claimerSig }
    Workflow->>Workflow: revalidateForPublish
    Workflow->>Workflow: publishFromDraft
    Workflow->>FWD: writeReport(0x04 || payload)
    FWD->>CPR: onReport(payload)
    CPR->>MF: createFromDraft
    Workflow->>User: { ok: true, txHash }
```

---

## 3. Create Market (Direct) Flow

Frontend POSTs question to workflow HTTP trigger; workflow creates market via MarketFactory.

```mermaid
sequenceDiagram
    participant User as User (Frontend)
    participant Workflow as CRE Workflow HTTP
    participant FWD as Forwarder
    participant MF as MarketFactory

    User->>Workflow: POST { question, requestedBy?, resolveTime?, category? }
    Workflow->>Workflow: buildFeedItemFromPayload
    Workflow->>Workflow: generateMarketInput
    Workflow->>Workflow: createMarkets
    Workflow->>FWD: writeReport(payload)
    FWD->>MF: createMarket
    Workflow->>User: { ok: true, message }
```

---

## 4. Create Market (Orchestration) Flow

When `orchestration.enabled` is true, workflow runs analysis (classify, risk, resolution plan) before creating or drafting.

```mermaid
sequenceDiagram
    participant User as User (Frontend)
    participant Workflow as CRE Workflow HTTP
    participant MF as MarketFactory
    participant DraftRepo as DraftRepository

    User->>Workflow: POST { question, requestedBy?, preview? }
    Workflow->>Workflow: analyzeCandidate
    Workflow->>Workflow: Policy (ALLOW/REVIEW/REJECT)
    alt preview: true
        Workflow->>User: { ok, policy, understanding, resolutionPlan, draft? }
    else draftingPipeline + ALLOW
        Workflow->>DraftRepo: writeDraftRecord
        Workflow->>User: { ok, draftId, status, brochure }
    else ALLOW without draftingPipeline
        Workflow->>MF: createMarkets
        Workflow->>User: { ok, createResult }
    end
```

---

## 5. Component Topology

High-level architecture of frontend, relayer, workflow, and on-chain components.

```mermaid
flowchart TB
    subgraph Frontend [Frontend]
        FE[React/Vite App]
    end

    subgraph OffChain [Off-Chain]
        Relayer[Relayer API]
        Workflow[CRE Workflow]
    end

    subgraph OnChain [On-Chain]
        CR[CREReceiver]
        CPR[CREPublishReceiver]
        CS[ChannelSettlement]
        MF[MarketFactory]
        MR[MarketRegistry]
    end

    FE -->|Trading, Checkpoint Sigs| Relayer
    FE -->|Create, Publish| Workflow
    Workflow -->|GET/POST checkpoints| Relayer
    Workflow -->|writeReport 0x01/0x03| CR
    Workflow -->|writeReport 0x04| CPR
    CR --> CS
    CR --> MR
    CPR --> MF
```
