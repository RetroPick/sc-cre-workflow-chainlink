# ML Models Layer

The ML Models layer implements a 7-layer stack that powers the Forecasting Intelligence Engine. ML assists; policy controls. Layers L1, L2, and L4 support optional LLM enhancement; L5 and L6 use LLM/verifier when configured.

## Overview

| Layer | Name | Purpose | LLM |
|-------|------|---------|-----|
| L0 | Source Representation | `SourceObservation` / `MarketObservation` | — |
| L1 | Candidate Understanding | Category, event type, ambiguity | Optional |
| L2 | Risk Scoring | Lexical + semantic risk | Optional |
| L3 | Oracleability & Unresolved | Resolution sources, unresolved proof | — |
| L4 | Draft Synthesis | Canonical question, outcomes | Optional |
| L5 | Explainability | `MarketBrief` for users | Yes |
| L6 | Settlement Inference | Plan-driven resolution | Yes |

## Layer Details

### L0 — Source Representation

- **Types:** [domain/candidate.ts](../domain/candidate.ts) — `SourceObservation`, `MarketObservation`
- **Fields:** `sourceType`, `sourceId`, `externalId`, `observedAt`, `title`, `body`, `url`, `tags`, `entityHints`, `eventTime`, `raw`

### L1 — Candidate Understanding

- **Module:** [analysis/classify.ts](../analysis/classify.ts)
- **Output:** `UnderstandingOutput` — `category`, `eventType`, `marketType`, `ambiguityScore`, `candidateQuestion`
- **LLM:** When `analysis.useLlm` is true, optional `LlmProvider` extracts structured understanding; otherwise rule-based

### L2 — Risk Scoring

- **Module:** [analysis/riskScore.ts](../analysis/riskScore.ts)
- **Output:** `RiskScores` — `overallRisk`, `gamblingLanguageRisk`, `flaggedTerms`, etc.
- **LLM:** When `analysis.useLlm` is true, optional LLM adds semantic risk; combined with lexical scores

### L3 — Oracleability & Unresolved

- **Modules:** [analysis/oracleability.ts](../analysis/oracleability.ts), [analysis/unresolvedCheck.ts](../analysis/unresolvedCheck.ts), [analysis/buildResolutionPlan.ts](../analysis/buildResolutionPlan.ts)
- **Output:** `ResolutionPlan` — `resolutionMode`, `primarySources`, `fallbackSources`, `resolutionPredicate`, `unresolvedCheckPassed`, `oracleabilityScore`
- **Policy:** Uses `policy/sourceTrust.ts` for source-type base trust

### L4 — Draft Synthesis

- **Module:** [analysis/draftSynthesis.ts](../analysis/draftSynthesis.ts)
- **Output:** `DraftArtifact` — `canonicalQuestion`, `outcomes`, `explanation`, `resolutionPlan`, `marketType`
- **LLM:** When `analysis.useLlm` is true, optional LLM generates canonical question and outcomes

### L5 — Explainability

- **Module:** [analysis/explain.ts](../analysis/explain.ts)
- **Output:** `MarketBrief` — `title`, `explanation`, `whyThisMarketExists`, `evidenceSummary`, `sourceLinks`, `resolutionExplanation`, `caveats`
- **Function:** `generateMarketBrief(draft, evidence, { llm })` — plain-language explanation for users
- **Guardrails:** Cannot alter outcomes, resolution plan, or introduce uncited claims
- **Config:** `analysis.useExplainability`

### L6 — Settlement Inference

- **Module:** [analysis/settlementInference.ts](../analysis/settlementInference.ts)
- **Flow:** Deterministic first (API/onchain); if interpretation required, uses `VerifierProvider` or LLM with constrained prompt
- **Output:** `SettlementDecision` — `status: RESOLVED | UNRESOLVED | AMBIGUOUS | ESCALATE`
- **Integration:** Used by `resolutionExecutor` for `ai_assisted` mode via `llmConsensus`

## Model Provider Interfaces

**Source:** [models/interfaces.ts](../models/interfaces.ts)

| Interface | Purpose |
|-----------|---------|
| `LlmProvider` | `completeJson<T>({ system, user, schemaName, temperature })` — structured JSON completion |
| `EmbeddingProvider` | `embedTexts(texts)` — for deduplication, clustering, similarity |
| `ClassifierProvider` | `classify({ text, labels })` — fast topic/risk routing |
| `VerifierProvider` | `verifyClaim({ claim, sources, allowedOutcomes })` — claim verification |

**Providers:** [models/providers/](../models/providers/) — `llmProvider`, `embeddingProvider`, `verifierProvider`

**Prompts:** [models/prompts/](../models/prompts/) — `classify`, `risk`, `draft`, `explain`, `settle`

## Configuration

| Field | Purpose |
|-------|---------|
| `analysis.useLlm` | Use LLM for L1, L2, L4 when true; fallback to rules when false |
| `analysis.useExplainability` | Generate `MarketBrief` (L5) for approved drafts when true |

## Implementation Status

| Component | Location | Status |
|-----------|----------|--------|
| L0 types | `domain/candidate.ts` | Implemented |
| L1 classify | `analysis/classify.ts` | Implemented (LLM optional) |
| L2 riskScore | `analysis/riskScore.ts` | Implemented (LLM optional) |
| L3 oracleability, unresolvedCheck, buildResolutionPlan | `analysis/*.ts` | Implemented |
| L4 draftSynthesis | `analysis/draftSynthesis.ts` | Implemented (LLM optional) |
| L5 explain | `analysis/explain.ts` | Implemented |
| L6 settlementInference | `analysis/settlementInference.ts` | Implemented |
| Model interfaces | `models/interfaces.ts` | Implemented |
| LlmProvider | `models/providers/llmProvider.ts` | Implemented |

## Related Docs

- [CREOrchestrationLayer](CREOrchestrationLayer.md) — Analysis core entrypoint
- [SafetyAndComplienceLayer](SafetyAndComplienceLayer.md) — Policy engine consumes L1–L3 outputs
- [AIDrivenLayerEvent](AIDrivenLayerEvent.md) — L6 used by resolution executor
