/**
 * Test coverage for ML Models Chapter (02_MLModels.md).
 * Covers Phase A (model providers), B (L1/L2/L4 LLM-assisted), C (L5 explainability),
 * D (L6 settlement inference), and orchestration integration.
 */
import { describe, test, expect } from "bun:test";
import type { LlmProvider } from "../models/interfaces";
import { createStubEmbeddingProvider } from "../models/providers/embeddingProvider";
import { classifyCandidate } from "../analysis/classify";
import { scoreRisk } from "../analysis/riskScore";
import { synthesizeDraft } from "../analysis/draftSynthesis";
import { generateMarketBrief } from "../analysis/explain";
import { inferSettlement } from "../analysis/settlementInference";
import { analyzeCandidate } from "../pipeline/orchestration/analyzeCandidate";
import type { SourceObservation } from "../domain/candidate";
import type { UnderstandingOutput } from "../domain/understanding";
import type { RiskScores } from "../domain/risk";
import type { EvidenceBundle } from "../domain/evidence";
import type { ResolutionPlan } from "../domain/resolutionPlan";
import type { DraftArtifact } from "../domain/draft";
import type { PolicyDecision } from "../domain/policy";
import { resolveFromPlan } from "../pipeline/resolution/resolveFromPlan";

// -----------------------------------------------------------------------------
// Mock providers for deterministic tests (no real API calls)
// -----------------------------------------------------------------------------

function createMockLlmProvider<T>(fixedResponse: T): LlmProvider {
  return {
    async completeJson<T>(_args: {
      system: string;
      user: string;
      schemaName: string;
      temperature?: number;
    }): Promise<T> {
      return Promise.resolve(fixedResponse as T);
    },
  };
}

const mockRuntime = {
  config: {},
  log: () => {},
} as any;

// -----------------------------------------------------------------------------
// Phase A — Model Provider Layer
// -----------------------------------------------------------------------------

describe("ML Models — Phase A: Model Provider Layer", () => {
  describe("EmbeddingProvider (stub)", () => {
    test("createStubEmbeddingProvider returns zero vectors of dimension 384", async () => {
      const provider = createStubEmbeddingProvider();
      const texts = ["hello", "world"];
      const vectors = await provider.embedTexts(texts);
      expect(vectors).toHaveLength(2);
      expect(vectors[0]).toHaveLength(384);
      expect(vectors[1]).toHaveLength(384);
      expect(vectors[0].every((v) => v === 0)).toBe(true);
      expect(vectors[1].every((v) => v === 0)).toBe(true);
    });

    test("embedTexts handles empty array", async () => {
      const provider = createStubEmbeddingProvider();
      const vectors = await provider.embedTexts([]);
      expect(vectors).toEqual([]);
    });
  });

  describe("LlmProvider interface (mock)", () => {
    test("mock LlmProvider returns fixed JSON", async () => {
      const llm = createMockLlmProvider({ category: "crypto_asset", marketType: "binary" });
      const result = await llm.completeJson<{ category: string; marketType: string }>({
        system: "test",
        user: "test",
        schemaName: "Test",
      });
      expect(result.category).toBe("crypto_asset");
      expect(result.marketType).toBe("binary");
    });
  });
});

// -----------------------------------------------------------------------------
// Phase B — L1 Classify, L2 Risk, L4 Draft Synthesis (LLM-assisted + fallback)
// -----------------------------------------------------------------------------

describe("ML Models — Phase B: L1 Classification", () => {
  const baseObs: SourceObservation = {
    sourceType: "coinGecko",
    sourceId: "cg",
    externalId: "x",
    observedAt: 0,
    title: "Will ETH hit 5k?",
    tags: ["crypto"],
    eventTime: 1735689600,
    raw: {},
  };

  test("classifyCandidate uses rule-based when useLlm false", async () => {
    const u = await classifyCandidate(baseObs);
    expect(u.category).toBe("crypto_asset");
    expect(u.marketType).toBe("binary");
    expect(u.candidateQuestion).toBe("Will ETH hit 5k?");
  });

  test("classifyCandidate uses LLM when useLlm true and llm provided", async () => {
    const llm = createMockLlmProvider<UnderstandingOutput>({
      category: "macro",
      canonicalSubject: "ETH price",
      eventType: "coinGecko",
      candidateQuestion: "Will Ethereum exceed 5000 USD?",
      marketType: "binary",
      ambiguityScore: 0.1,
      marketabilityScore: 0.9,
      entities: [],
    });
    const u = await classifyCandidate(baseObs, { llm, useLlm: true });
    expect(u.category).toBe("macro");
    expect(u.candidateQuestion).toBe("Will Ethereum exceed 5000 USD?");
  });

  test("classifyCandidate normalizes invalid LLM category to inferred", async () => {
    const llm = createMockLlmProvider<Partial<UnderstandingOutput>>({
      category: "invalid_category",
      candidateQuestion: "Test",
      marketType: "binary",
    });
    const u = await classifyCandidate(baseObs, { llm, useLlm: true });
    expect(u.category).toBe("crypto_asset"); // fallback from sourceType
  });
});

describe("ML Models — Phase B: L2 Risk Scoring", () => {
  const baseObs: SourceObservation = {
    sourceType: "coinGecko",
    sourceId: "cg",
    externalId: "x",
    observedAt: 0,
    title: "Will BTC exceed 100k?",
    tags: ["crypto"],
    eventTime: 1735689600,
    raw: {},
  };

  const baseUnderstanding: UnderstandingOutput = {
    canonicalSubject: "BTC",
    eventType: "coinGecko",
    category: "crypto_asset",
    candidateQuestion: "Will BTC exceed 100k?",
    marketType: "binary",
    ambiguityScore: 0.2,
    marketabilityScore: 0.8,
    entities: [],
  };

  test("scoreRisk uses lexical only when useLlm false", async () => {
    const risk = await scoreRisk(baseObs, baseUnderstanding);
    expect(risk.overallRisk).toBeGreaterThanOrEqual(0);
    expect(risk.overallRisk).toBeLessThanOrEqual(1);
    expect(risk.gamblingLanguageRisk).toBeDefined();
    expect(risk.categoryRisk).toBeDefined();
  });

  test("scoreRisk uses LLM semantic when useLlm true", async () => {
    const llm = createMockLlmProvider({
      gamblingLanguageRisk: 0.1,
      manipulationRisk: 0.2,
      policySensitivityRisk: 0.3,
      harmRisk: 0.05,
      rationale: ["Low risk crypto market"],
    });
    const risk = await scoreRisk(baseObs, baseUnderstanding, { llm, useLlm: true });
    expect(risk.overallRisk).toBeGreaterThanOrEqual(0);
    expect(risk.manipulationRisk).toBe(0.2);
    expect(risk.rationale).toContain("Low risk crypto market");
  });

  test("scoreRisk flags gambling language from banned terms", async () => {
    const obs: SourceObservation = {
      ...baseObs,
      title: "Place your bet and wager on odds",
      body: "gamble stake",
    };
    const risk = await scoreRisk(obs, baseUnderstanding);
    expect(risk.gamblingLanguageRisk).toBeGreaterThan(0);
    expect(risk.flaggedTerms.length).toBeGreaterThan(0);
  });
});

describe("ML Models — Phase B: L4 Draft Synthesis", () => {
  const baseObs: SourceObservation = {
    sourceType: "coinGecko",
    sourceId: "cg",
    externalId: "synth:1",
    observedAt: 1000,
    title: "Will Bitcoin hit 100k?",
    tags: ["crypto"],
    eventTime: 1735689600,
    raw: {},
  };

  const baseUnderstanding: UnderstandingOutput = {
    canonicalSubject: "Bitcoin",
    eventType: "coinGecko",
    category: "crypto_asset",
    candidateQuestion: "Will Bitcoin hit 100k?",
    marketType: "binary",
    ambiguityScore: 0.2,
    marketabilityScore: 0.8,
    entities: [],
  };

  const baseEvidence: EvidenceBundle = {
    primary: [{ label: "CoinGecko", url: "https://coingecko.com", sourceType: "official_api", trustScore: 0.9 }],
    supporting: [],
    contradicting: [],
  };

  const basePlan: ResolutionPlan = {
    resolutionMode: "deterministic",
    primarySources: [
      { sourceType: "official_api", locator: "https://api.coingecko.com", trustScore: 0.9 },
    ],
    fallbackSources: [],
    resolutionPredicate: "BTC price >= 100000 at resolve time",
    oracleabilityScore: 0.9,
    unresolvedCheckPassed: true,
    unresolvedCheckEvidence: [],
  };

  const basePolicy: PolicyDecision = {
    status: "ALLOW",
    reasons: [],
    policyVersion: "1.0",
  };

  const baseRisk: RiskScores = {
    categoryRisk: 0.2,
    gamblingLanguageRisk: 0,
    manipulationRisk: 0.2,
    ambiguityRisk: 0.2,
    policySensitivityRisk: 0.2,
    duplicateRisk: 0.1,
    harmRisk: 0.1,
    overallRisk: 0.2,
    flaggedTerms: [],
    rationale: [],
  };

  test("synthesizeDraft uses rule-based when useLlm false", async () => {
    const draft = await synthesizeDraft({
      observation: baseObs,
      understanding: baseUnderstanding,
      risk: baseRisk,
      evidence: baseEvidence,
      resolutionPlan: basePlan,
      policy: basePolicy,
    });
    expect(draft.canonicalQuestion).toBe("Will Bitcoin hit 100k?");
    expect(draft.outcomes).toContain("Yes");
    expect(draft.outcomes).toContain("No");
    expect(draft.explanation).toContain("coinGecko");
    expect(draft.draftId).toBeDefined();
    expect(draft.resolutionPlan).toBe(basePlan);
  });

  test("synthesizeDraft uses LLM when useLlm true", async () => {
    const llm = createMockLlmProvider({
      canonicalQuestion: "Will the price of Bitcoin exceed $100,000 USD by the resolution date?",
      outcomes: ["Yes", "No"],
      explanation: "This market resolves based on Bitcoin's price at resolution time.",
    });
    const draft = await synthesizeDraft({
      observation: baseObs,
      understanding: baseUnderstanding,
      risk: baseRisk,
      evidence: baseEvidence,
      resolutionPlan: basePlan,
      policy: basePolicy,
      llm,
      useLlm: true,
    });
    expect(draft.canonicalQuestion).toBe("Will the price of Bitcoin exceed $100,000 USD by the resolution date?");
    expect(draft.explanation).toBe("This market resolves based on Bitcoin's price at resolution time.");
  });
});

// -----------------------------------------------------------------------------
// Phase C — L5 Explainability
// -----------------------------------------------------------------------------

describe("ML Models — Phase C: L5 Explainability", () => {
  const baseDraft: DraftArtifact = {
    draftId: "0xabc",
    canonicalQuestion: "Will BTC exceed 100k by 2026?",
    marketType: "binary",
    outcomes: ["Yes", "No"],
    category: "crypto_asset",
    explanation: "Market from coinGecko",
    evidenceLinks: ["https://coingecko.com"],
    policyVersion: "1.0",
    policyDecision: "ALLOW",
    policyReasons: [],
    resolutionPlan: {
      resolutionMode: "deterministic",
      primarySources: [{ sourceType: "official_api", locator: "https://api.coingecko.com", trustScore: 0.9 }],
      fallbackSources: [],
      resolutionPredicate: "BTC >= 100000 at resolve",
      oracleabilityScore: 0.9,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    },
    confidence: { topic: 0.9, risk: 0.8, oracleability: 0.9, explanation: 0.8 },
    createdAt: Math.floor(Date.now() / 1000),
  };

  const baseEvidence: EvidenceBundle = {
    primary: [
      { label: "CoinGecko", url: "https://coingecko.com", sourceType: "official_api", trustScore: 0.9 },
    ],
    supporting: [],
    contradicting: [],
  };

  test("generateMarketBrief returns MarketBrief with LLM output", async () => {
    const llm = createMockLlmProvider({
      title: "Bitcoin $100k Prediction",
      explanation: "This market predicts whether Bitcoin will exceed $100,000.",
      whyThisMarketExists: "Price prediction for crypto traders.",
      evidenceSummary: ["CoinGecko price data"],
      sourceLinks: ["https://coingecko.com"],
      resolutionExplanation: "Uses official API at resolve time.",
      caveats: ["Past performance does not guarantee future results."],
    });
    const brief = await generateMarketBrief(baseDraft, baseEvidence, { llm });
    expect(brief.title).toBe("Bitcoin $100k Prediction");
    expect(brief.explanation).toBe("This market predicts whether Bitcoin will exceed $100,000.");
    expect(brief.whyThisMarketExists).toBe("Price prediction for crypto traders.");
    expect(brief.evidenceSummary).toContain("CoinGecko price data");
    expect(brief.sourceLinks).toContain("https://coingecko.com");
    expect(brief.resolutionExplanation).toBe("Uses official API at resolve time.");
    expect(brief.caveats).toContain("Past performance does not guarantee future results.");
  });

  test("generateMarketBrief falls back to draft when LLM returns partial", async () => {
    // Use empty object so all fields are undefined (?? fallback); empty string "" would NOT trigger fallback
    const llm = createMockLlmProvider<Record<string, unknown>>({});
    const brief = await generateMarketBrief(baseDraft, baseEvidence, { llm });
    expect(brief.title).toBe(baseDraft.canonicalQuestion.slice(0, 80));
    expect(brief.explanation).toBe(baseDraft.explanation);
    expect(brief.sourceLinks).toEqual(baseEvidence.primary.map((e) => e.url));
    expect(brief.resolutionExplanation).toBe(baseDraft.resolutionPlan.resolutionPredicate);
  });
});

// -----------------------------------------------------------------------------
// Phase D — L6 Settlement Inference
// -----------------------------------------------------------------------------

describe("ML Models — Phase D: L6 Settlement Inference", () => {
  const baseMarket = {
    question: "Will BTC exceed 100k by 2026?",
    outcomes: ["Yes", "No"],
    marketType: 0,
  };

  const basePlan: ResolutionPlan = {
    resolutionMode: "ai_assisted",
    primarySources: [{ sourceType: "official_api", locator: "https://api.coingecko.com", trustScore: 0.9 }],
    fallbackSources: [],
    resolutionPredicate: "BTC price >= 100000 at resolve",
    oracleabilityScore: 0.9,
    unresolvedCheckPassed: true,
    unresolvedCheckEvidence: [],
  };

  const baseEvidence: EvidenceBundle = {
    primary: [{ label: "CoinGecko", url: "https://coingecko.com", sourceType: "official_api", trustScore: 0.9 }],
    supporting: [],
    contradicting: [],
  };

  test("inferSettlement returns RESOLVED when LLM says so with valid index and confidence", async () => {
    const llm = createMockLlmProvider({
      status: "RESOLVED",
      selectedOutcomeIndex: 0,
      confidence: 8500,
      justification: ["Price data shows BTC above 100k"],
      sourceEvidence: ["https://coingecko.com"],
    });
    const decision = await inferSettlement(baseMarket, basePlan, baseEvidence, { llm });
    expect(decision.status).toBe("RESOLVED");
    expect(decision.selectedOutcomeIndex).toBe(0);
    expect(decision.confidence).toBe(8500);
    expect(decision.justification).toContain("Price data shows BTC above 100k");
  });

  test("inferSettlement returns AMBIGUOUS when confidence below minConfidence", async () => {
    const llm = createMockLlmProvider({
      status: "RESOLVED",
      selectedOutcomeIndex: 0,
      confidence: 5000, // below default 7000
      justification: [],
      sourceEvidence: [],
    });
    const decision = await inferSettlement(baseMarket, basePlan, baseEvidence, { llm, minConfidence: 7000 });
    expect(decision.status).toBe("AMBIGUOUS");
    expect(decision.confidence).toBe(5000);
  });

  test("inferSettlement returns AMBIGUOUS when selectedOutcomeIndex out of range", async () => {
    const llm = createMockLlmProvider({
      status: "RESOLVED",
      selectedOutcomeIndex: 99, // invalid
      confidence: 9000,
      justification: [],
      sourceEvidence: [],
    });
    const decision = await inferSettlement(baseMarket, basePlan, baseEvidence, { llm });
    expect(decision.status).toBe("AMBIGUOUS");
  });

  test("inferSettlement returns ESCALATE when LLM says so", async () => {
    const llm = createMockLlmProvider({
      status: "ESCALATE",
      confidence: 0,
      justification: ["Conflicting sources"],
      sourceEvidence: [],
    });
    const decision = await inferSettlement(baseMarket, basePlan, baseEvidence, { llm });
    expect(decision.status).toBe("ESCALATE");
  });

  test("inferSettlement uses custom minConfidence", async () => {
    const llm = createMockLlmProvider({
      status: "RESOLVED",
      selectedOutcomeIndex: 1,
      confidence: 6000,
      justification: [],
      sourceEvidence: [],
    });
    const decision = await inferSettlement(baseMarket, basePlan, baseEvidence, {
      llm,
      minConfidence: 5000,
    });
    expect(decision.status).toBe("RESOLVED");
    expect(decision.selectedOutcomeIndex).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// Orchestration Integration
// -----------------------------------------------------------------------------

describe("ML Models — Orchestration Integration", () => {
  const baseObs: SourceObservation = {
    sourceType: "coinGecko",
    sourceId: "cg",
    externalId: "test:btc",
    observedAt: Math.floor(Date.now() / 1000),
    title: "Will Bitcoin price exceed 100000 USD by December 2026?",
    url: "https://api.coingecko.com",
    tags: ["crypto"],
    eventTime: 1735689600,
    raw: {
      feedId: "cg",
      question: "Will Bitcoin price exceed 100000 USD by December 2026?",
      category: "crypto",
      resolveTime: 1735689600,
      sourceUrl: "https://api.coingecko.com",
      externalId: "test:btc",
    },
  };

  test("analyzeCandidate with useLlm false preserves rule-based behavior", async () => {
    const result = await analyzeCandidate(mockRuntime, baseObs, {
      config: { analysis: { useLlm: false, useExplainability: false } },
    });
    expect(result.understanding).toBeDefined();
    expect(result.understanding.category).toBe("crypto_asset");
    expect(result.risk).toBeDefined();
    expect(result.policy).toBeDefined();
    if (result.policy.status !== "REJECT") {
      expect(result.draft).toBeDefined();
    }
    expect(result.marketBrief).toBeUndefined();
  });

  test("analyzeCandidate with useLlm true uses mock LLM when provided", async () => {
    const llm = createMockLlmProvider<UnderstandingOutput>({
      category: "macro",
      canonicalSubject: "Bitcoin",
      eventType: "coinGecko",
      candidateQuestion: "Will Bitcoin exceed 100k?",
      marketType: "binary",
      ambiguityScore: 0.1,
      marketabilityScore: 0.9,
      entities: [],
    });
    const riskLlm = createMockLlmProvider({
      gamblingLanguageRisk: 0,
      manipulationRisk: 0.1,
      policySensitivityRisk: 0.2,
      harmRisk: 0.05,
      rationale: [],
    });
    const draftLlm = createMockLlmProvider({
      canonicalQuestion: "Will Bitcoin exceed $100,000?",
      outcomes: ["Yes", "No"],
      explanation: "LLM-generated explanation",
    });
    const explainLlm = createMockLlmProvider({
      title: "Bitcoin 100k",
      explanation: "Brief explanation",
      whyThisMarketExists: "Price prediction",
      evidenceSummary: [],
      sourceLinks: [],
      resolutionExplanation: "API-based",
      caveats: [],
    });

    // We need to inject a composite mock that returns different things per schema
    const compositeLlm: LlmProvider = {
      async completeJson<T>(args: { schemaName: string }): Promise<T> {
        if (args.schemaName === "UnderstandingOutput") return llm.completeJson(args) as Promise<T>;
        if (args.schemaName === "RiskSemanticScores") return riskLlm.completeJson(args) as Promise<T>;
        if (args.schemaName === "DraftSynthesisOutput") return draftLlm.completeJson(args) as Promise<T>;
        if (args.schemaName === "MarketBrief") return explainLlm.completeJson(args) as Promise<T>;
        return {} as T;
      },
    };

    const result = await analyzeCandidate(mockRuntime, baseObs, {
      config: { analysis: { useLlm: true, useExplainability: true } },
      llm: compositeLlm,
    });
    expect(result.understanding.category).toBe("macro");
    if (result.policy.status !== "REJECT") {
      expect(result.draft).toBeDefined();
      expect(result.draft?.canonicalQuestion).toBe("Will Bitcoin exceed $100,000?");
      expect(result.marketBrief).toBeDefined();
      expect(result.marketBrief?.title).toBe("Bitcoin 100k");
    }
  });
});

// -----------------------------------------------------------------------------
// Phase D — resolveFromPlan (plan-driven settlement)
// -----------------------------------------------------------------------------

describe("ML Models — resolveFromPlan", () => {
  const planWithSources: ResolutionPlan = {
    resolutionMode: "ai_assisted",
    primarySources: [{ sourceType: "official_api", locator: "https://api.coingecko.com", trustScore: 0.9 }],
    fallbackSources: [],
    resolutionPredicate: "BTC >= 100000 at resolve",
    oracleabilityScore: 0.9,
    unresolvedCheckPassed: true,
    unresolvedCheckEvidence: [],
  };

  test("resolveFromPlan with null plan uses legacy askGPTForOutcome (useMockAi)", async () => {
    const runtime = {
      config: { useMockAi: true, mockAiResponse: '{"result":"YES","confidence":10000}' },
      log: () => {},
    } as any;
    const result = await resolveFromPlan(runtime, "Will BTC exceed 100k?", 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcomeIndex).toBe(0);
      expect(result.confidence).toBe(10000);
    }
  });

  test("resolveFromPlan with plan uses inferSettlement (useMockAi settlement format)", async () => {
    const runtime = {
      config: {
        useMockAi: true,
        mockAiResponse:
          '{"status":"RESOLVED","selectedOutcomeIndex":1,"confidence":8500,"justification":["Price below 100k"],"sourceEvidence":[]}',
      },
      log: () => {},
    } as any;
    const result = await resolveFromPlan(
      runtime,
      "Will BTC exceed 100k by 2026?",
      0,
      ["Yes", "No"],
      undefined,
      planWithSources
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcomeIndex).toBe(1);
      expect(result.confidence).toBe(8500);
    }
  });

  test("resolveFromPlan returns ok:false when inferSettlement returns AMBIGUOUS", async () => {
    const runtime = {
      config: {
        useMockAi: true,
        mockAiResponse: '{"status":"AMBIGUOUS","confidence":5000,"justification":["Insufficient evidence"],"sourceEvidence":[]}',
      },
      log: () => {},
    } as any;
    const result = await resolveFromPlan(
      runtime,
      "Will BTC exceed 100k?",
      0,
      undefined,
      undefined,
      planWithSources
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe("AMBIGUOUS");
      expect(result.reason).toBeDefined();
    }
  });
});
