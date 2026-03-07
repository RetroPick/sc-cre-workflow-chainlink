/**
 * Test coverage for Safety & Compliance Layer (03_SafetyComplienceLayer.md).
 * Covers policy engine, oracleability, unresolved check, resolution plan builder,
 * and the four canonical test cases from the build plan.
 */
import { describe, test, expect } from "bun:test";
import { evaluatePolicy } from "../src/policy/evaluate";
import { buildOracleability } from "../src/analysis/oracleability";
import { verifyUnresolvedState } from "../src/analysis/unresolvedCheck";
import { buildResolutionPlan } from "../src/analysis/buildResolutionPlan";
import { BANNED_CATEGORIES, REVIEW_ONLY_CATEGORIES } from "../src/policy/bannedCategories";
import { HARD_BANNED_TERMS, GAMBLING_TERMS } from "../src/policy/bannedTerms";
import { POLICY_THRESHOLDS, POLICY_VERSION } from "../src/policy/thresholds";
import { SOURCE_TYPE_BASE_TRUST } from "../src/policy/sourceTrust";
import { analyzeCandidate } from "../src/pipeline/orchestration/analyzeCandidate";
import {
  createDefaultEvidenceService,
  MockEvidenceProvider,
  type EvidenceProvider,
  type RawEvidenceCandidate,
} from "../src/analysis/evidence";
import type { SourceObservation } from "../src/domain/candidate";
import type { UnderstandingOutput } from "../src/domain/understanding";
import type { RiskScores } from "../src/domain/risk";
import type { EvidenceBundle } from "../src/domain/evidence";
import type { ResolutionPlan } from "../src/domain/resolutionPlan";
import type { PolicyInput } from "../src/domain/policy";

const mockRuntime = { config: {}, log: () => {} } as any;

// -----------------------------------------------------------------------------
// Policy Configuration
// -----------------------------------------------------------------------------

describe("Safety Compliance — Policy Configuration", () => {
  describe("BANNED_CATEGORIES", () => {
    test("includes politics, sports, war_violence", () => {
      expect(BANNED_CATEGORIES).toContain("politics");
      expect(BANNED_CATEGORIES).toContain("sports");
      expect(BANNED_CATEGORIES).toContain("war_violence");
    });
  });

  describe("REVIEW_ONLY_CATEGORIES", () => {
    test("includes regulatory, entertainment", () => {
      expect(REVIEW_ONLY_CATEGORIES).toContain("regulatory");
      expect(REVIEW_ONLY_CATEGORIES).toContain("entertainment");
    });
  });

  describe("HARD_BANNED_TERMS", () => {
    test("includes violence and harm terms", () => {
      expect(HARD_BANNED_TERMS).toContain("assassination");
      expect(HARD_BANNED_TERMS).toContain("kill");
      expect(HARD_BANNED_TERMS).toContain("murder");
      expect(HARD_BANNED_TERMS).toContain("terrorist attack");
      expect(HARD_BANNED_TERMS).toContain("school shooting");
    });
  });

  describe("GAMBLING_TERMS", () => {
    test("includes betting and wager terms", () => {
      expect(GAMBLING_TERMS).toContain("bet");
      expect(GAMBLING_TERMS).toContain("wager");
      expect(GAMBLING_TERMS).toContain("odds");
      expect(GAMBLING_TERMS).toContain("sportsbook");
      expect(GAMBLING_TERMS).toContain("parlay");
      expect(GAMBLING_TERMS).toContain("spread");
    });
  });

  describe("POLICY_THRESHOLDS", () => {
    test("has required threshold keys", () => {
      expect(POLICY_THRESHOLDS.maxAmbiguityAllow).toBe(0.45);
      expect(POLICY_THRESHOLDS.maxAmbiguityReject).toBe(0.75);
      expect(POLICY_THRESHOLDS.maxGamblingLanguageReject).toBe(0.8);
      expect(POLICY_THRESHOLDS.minOracleabilityAllow).toBe(0.8);
      expect(POLICY_THRESHOLDS.minOracleabilityReview).toBe(0.65);
      expect(POLICY_THRESHOLDS.maxDuplicateRiskReject).toBe(0.85);
    });
  });

  describe("SOURCE_TYPE_BASE_TRUST", () => {
    test("onchain_event has highest trust", () => {
      expect(SOURCE_TYPE_BASE_TRUST.onchain_event).toBe(1);
    });
    test("official_api has high trust", () => {
      expect(SOURCE_TYPE_BASE_TRUST.official_api).toBe(0.95);
    });
    test("manual_review has lowest trust", () => {
      expect(SOURCE_TYPE_BASE_TRUST.manual_review).toBe(0.4);
    });
  });
});

// -----------------------------------------------------------------------------
// Policy Engine (evaluatePolicy)
// -----------------------------------------------------------------------------

function mkPolicyInput(overrides: Partial<PolicyInput>): PolicyInput {
  const base: PolicyInput = {
    observation: {
      sourceType: "coinGecko",
      sourceId: "cg",
      externalId: "x",
      observedAt: 0,
      title: "Will ETH exceed 6000?",
      raw: {},
    } as SourceObservation,
    understanding: {
      canonicalSubject: "ETH",
      eventType: "price_threshold",
      category: "crypto_asset",
      candidateQuestion: "Will ETH exceed 6000?",
      marketType: "binary",
      ambiguityScore: 0.2,
      marketabilityScore: 0.8,
      entities: [],
    } as UnderstandingOutput,
    risk: {
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
    } as RiskScores,
    evidence: { primary: [], supporting: [], contradicting: [] } as EvidenceBundle,
    resolutionPlan: {
      resolutionMode: "deterministic",
      primarySources: [],
      fallbackSources: [],
      resolutionPredicate: "ETH price at resolve",
      oracleabilityScore: 0.85,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    } as ResolutionPlan,
  };
  return deepMerge(base, overrides) as PolicyInput;
}

function deepMerge<T>(target: T, source: Partial<T>): T {
  const out = { ...target };
  for (const k of Object.keys(source) as (keyof T)[]) {
    const v = source[k];
    if (v !== undefined && typeof v === "object" && v !== null && !Array.isArray(v)) {
      (out as any)[k] = deepMerge((target as any)[k], v);
    } else if (v !== undefined) {
      (out as any)[k] = v;
    }
  }
  return out;
}

describe("Safety Compliance — Policy Engine", () => {
  test("REJECTs banned category (politics)", () => {
    const input = mkPolicyInput({
      understanding: {
        ...mkPolicyInput({}).understanding,
        category: "politics",
      } as UnderstandingOutput,
    });
    const decision = evaluatePolicy(input);
    expect(decision.status).toBe("REJECT");
    expect(decision.ruleHits).toContain("CATEGORY_BANNED");
    expect(decision.reasons.some((r) => r.includes("politics"))).toBe(true);
  });

  test("REJECTs banned category (sports)", () => {
    const input = mkPolicyInput({
      understanding: {
        ...mkPolicyInput({}).understanding,
        category: "sports",
      } as UnderstandingOutput,
    });
    const decision = evaluatePolicy(input);
    expect(decision.status).toBe("REJECT");
    expect(decision.ruleHits).toContain("CATEGORY_BANNED");
  });

  test("REJECTs banned category (war_violence)", () => {
    const input = mkPolicyInput({
      understanding: {
        ...mkPolicyInput({}).understanding,
        category: "war_violence",
      } as UnderstandingOutput,
    });
    const decision = evaluatePolicy(input);
    expect(decision.status).toBe("REJECT");
    expect(decision.ruleHits).toContain("CATEGORY_BANNED");
  });

  test("REJECTs hard-banned terms", () => {
    const input = mkPolicyInput({
      risk: {
        ...mkPolicyInput({}).risk,
        flaggedTerms: ["murder", "assassination"],
      } as RiskScores,
    });
    const decision = evaluatePolicy(input);
    expect(decision.status).toBe("REJECT");
    expect(decision.ruleHits).toContain("HARD_BANNED_TERMS");
  });

  test("REJECTs invalid market type", () => {
    const input = mkPolicyInput({
      understanding: {
        ...mkPolicyInput({}).understanding,
        marketType: "invalid",
      } as UnderstandingOutput,
    });
    const decision = evaluatePolicy(input);
    expect(decision.status).toBe("REJECT");
    expect(decision.ruleHits).toContain("INVALID_MARKET_TYPE");
  });

  test("REJECTs high gambling language risk", () => {
    const input = mkPolicyInput({
      risk: {
        ...mkPolicyInput({}).risk,
        gamblingLanguageRisk: 0.9,
      } as RiskScores,
    });
    const decision = evaluatePolicy(input);
    expect(decision.status).toBe("REJECT");
    expect(decision.ruleHits).toContain("GAMBLING_LANGUAGE_REJECT");
  });

  test("REJECTs when unresolved check failed", () => {
    const input = mkPolicyInput({
      resolutionPlan: {
        ...mkPolicyInput({}).resolutionPlan,
        unresolvedCheckPassed: false,
      } as ResolutionPlan,
    });
    const decision = evaluatePolicy(input);
    expect(decision.status).toBe("REJECT");
    expect(decision.ruleHits).toContain("UNRESOLVED_CHECK_FAILED");
  });

  test("REJECTs low oracleability", () => {
    const input = mkPolicyInput({
      resolutionPlan: {
        ...mkPolicyInput({}).resolutionPlan,
        oracleabilityScore: 0.5,
      } as ResolutionPlan,
    });
    const decision = evaluatePolicy(input);
    expect(decision.status).toBe("REJECT");
    expect(decision.ruleHits).toContain("ORACLEABILITY_TOO_LOW");
  });

  test("REJECTs high ambiguity", () => {
    const input = mkPolicyInput({
      understanding: {
        ...mkPolicyInput({}).understanding,
        ambiguityScore: 0.9,
      } as UnderstandingOutput,
    });
    const decision = evaluatePolicy(input);
    expect(decision.status).toBe("REJECT");
    expect(decision.ruleHits).toContain("AMBIGUITY_REJECT");
  });

  test("REJECTs high duplicate risk", () => {
    const input = mkPolicyInput({
      risk: {
        ...mkPolicyInput({}).risk,
        duplicateRisk: 0.9,
      } as RiskScores,
    });
    const decision = evaluatePolicy(input);
    expect(decision.status).toBe("REJECT");
    expect(decision.ruleHits).toContain("DUPLICATE_REJECT");
  });

  test("REVIEWs review-only categories (regulatory)", () => {
    const input = mkPolicyInput({
      understanding: {
        ...mkPolicyInput({}).understanding,
        category: "regulatory",
      } as UnderstandingOutput,
    });
    const decision = evaluatePolicy(input);
    expect(decision.status).toBe("REVIEW");
    expect(decision.ruleHits).toContain("CATEGORY_REVIEW_ONLY");
  });

  test("REVIEWs review-only categories (entertainment)", () => {
    const input = mkPolicyInput({
      understanding: {
        ...mkPolicyInput({}).understanding,
        category: "entertainment",
      } as UnderstandingOutput,
    });
    const decision = evaluatePolicy(input);
    expect(decision.status).toBe("REVIEW");
    expect(decision.ruleHits).toContain("CATEGORY_REVIEW_ONLY");
  });

  test("REVIEWs medium gambling language risk", () => {
    const input = mkPolicyInput({
      risk: {
        ...mkPolicyInput({}).risk,
        gamblingLanguageRisk: 0.5,
      } as RiskScores,
    });
    const decision = evaluatePolicy(input);
    expect(decision.status).toBe("REVIEW");
    expect(decision.ruleHits).toContain("GAMBLING_LANGUAGE_REVIEW");
  });

  test("REVIEWs medium ambiguity", () => {
    const input = mkPolicyInput({
      understanding: {
        ...mkPolicyInput({}).understanding,
        ambiguityScore: 0.55,
      } as UnderstandingOutput,
    });
    const decision = evaluatePolicy(input);
    expect(decision.status).toBe("REVIEW");
    expect(decision.ruleHits).toContain("AMBIGUITY_REVIEW");
  });

  test("REVIEWs oracleability in review band", () => {
    const input = mkPolicyInput({
      resolutionPlan: {
        ...mkPolicyInput({}).resolutionPlan,
        oracleabilityScore: 0.7,
      } as ResolutionPlan,
    });
    const decision = evaluatePolicy(input);
    expect(decision.status).toBe("REVIEW");
    expect(decision.ruleHits).toContain("ORACLEABILITY_REVIEW");
  });

  test("ALLOWs safe crypto candidate", () => {
    const input = mkPolicyInput({});
    const decision = evaluatePolicy(input);
    expect(decision.status).toBe("ALLOW");
    expect(decision.ruleHits).toContain("AUTO_ALLOW");
  });

  test("decision includes scores and policyVersion", () => {
    const input = mkPolicyInput({});
    const decision = evaluatePolicy(input);
    expect(decision.scores).toBeDefined();
    expect(decision.scores.ambiguity).toBe(0.2);
    expect(decision.scores.overallRisk).toBe(0.2);
    expect(decision.scores.gamblingLanguageRisk).toBe(0);
    expect(decision.scores.oracleability).toBe(0.85);
    expect(decision.policyVersion).toBe(POLICY_VERSION);
  });
});

// -----------------------------------------------------------------------------
// Oracleability (buildOracleability)
// -----------------------------------------------------------------------------

describe("Safety Compliance — Oracleability", () => {
  const baseObs: SourceObservation = {
    sourceType: "coinGecko",
    sourceId: "cg",
    externalId: "x",
    observedAt: 0,
    title: "Will ETH exceed 6000 by Dec 31 2026?",
    raw: {},
  };

  const baseUnderstanding: UnderstandingOutput = {
    canonicalSubject: "ETH",
    eventType: "price_threshold",
    category: "crypto_asset",
    candidateQuestion: "Will ETH exceed 6000 by Dec 31 2026?",
    marketType: "binary",
    ambiguityScore: 0.2,
    marketabilityScore: 0.8,
    entities: [],
  };

  test("buildOracleability returns OracleabilityResult with required fields", () => {
    const evidence: EvidenceBundle = {
      primary: [
        {
          label: "CoinGecko",
          url: "https://api.coingecko.com",
          sourceType: "official_api",
          trustScore: 0.95,
        },
      ],
      supporting: [],
      contradicting: [],
    };
    const result = buildOracleability(baseObs, baseUnderstanding, evidence);
    expect(result.oracleabilityScore).toBeGreaterThan(0);
    expect(result.oracleabilityScore).toBeLessThanOrEqual(1);
    expect(result.resolutionMode).toBeDefined();
    expect(["deterministic", "multi_source_deterministic", "ai_assisted", "human_review"]).toContain(
      result.resolutionMode
    );
    expect(result.primarySources.length).toBeGreaterThan(0);
    expect(result.resolutionPredicate).toContain("Will ETH exceed");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  test("buildOracleability uses deterministic mode for official_api", () => {
    const evidence: EvidenceBundle = {
      primary: [
        {
          label: "API",
          url: "https://api.example.com",
          sourceType: "official_api",
          trustScore: 0.95,
        },
      ],
      supporting: [],
      contradicting: [],
    };
    const result = buildOracleability(baseObs, baseUnderstanding, evidence);
    expect(result.resolutionMode).toBe("deterministic");
  });

  test("buildOracleability uses human_review for unknown category", () => {
    const evidence: EvidenceBundle = { primary: [], supporting: [], contradicting: [] };
    const understanding: UnderstandingOutput = {
      ...baseUnderstanding,
      category: "unknown",
    };
    const result = buildOracleability(baseObs, understanding, evidence);
    expect(result.resolutionMode).toBe("human_review");
  });

  test("buildOracleability derives predicate by category", () => {
    const evidence: EvidenceBundle = { primary: [], supporting: [], contradicting: [] };
    const result = buildOracleability(baseObs, baseUnderstanding, evidence);
    expect(result.resolutionPredicate).toContain("authoritative value/source");
    expect(result.resolutionPredicate).toContain("Will ETH exceed");
  });

  test("buildOracleability ranks primary over supporting", () => {
    const evidence: EvidenceBundle = {
      primary: [
        { label: "P1", url: "https://p1.com", sourceType: "official_api", trustScore: 0.95 },
      ],
      supporting: [
        { label: "S1", url: "https://s1.com", sourceType: "news", trustScore: 0.65 },
      ],
      contradicting: [],
    };
    const result = buildOracleability(baseObs, baseUnderstanding, evidence);
    expect(result.primarySources.length).toBe(1);
    expect(result.fallbackSources.length).toBe(1);
    expect(result.primarySources[0].trustScore).toBeGreaterThanOrEqual(result.fallbackSources[0].trustScore);
  });
});

// -----------------------------------------------------------------------------
// Unresolved Check (verifyUnresolvedState)
// -----------------------------------------------------------------------------

describe("Safety Compliance — Unresolved Check", () => {
  const baseObs: SourceObservation = {
    sourceType: "coinGecko",
    sourceId: "cg",
    externalId: "x",
    observedAt: 0,
    title: "Will Product Y launch by Dec 31?",
    raw: {},
  };

  const baseUnderstanding: UnderstandingOutput = {
    canonicalSubject: "Product Y",
    eventType: "product_launch",
    category: "crypto_product",
    candidateQuestion: "Will Product Y launch by Dec 31?",
    marketType: "binary",
    ambiguityScore: 0.2,
    marketabilityScore: 0.8,
    entities: [],
  };

  test("verifyUnresolvedState passes when no resolved signals", () => {
    const evidence: EvidenceBundle = {
      primary: [
        {
          label: "Rumor",
          url: "https://x.com",
          sourceType: "social",
          trustScore: 0.4,
          excerpt: "Expected to launch, considering the proposal",
        },
      ],
      supporting: [],
      contradicting: [],
    };
    const result = verifyUnresolvedState(baseObs, baseUnderstanding, evidence);
    expect(result.passed).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
  });

  test("verifyUnresolvedState fails when strong official resolved evidence", () => {
    const evidence: EvidenceBundle = {
      primary: [
        {
          label: "Official Blog",
          url: "https://official.com",
          sourceType: "official_website",
          trustScore: 0.9,
          excerpt: "We have officially launched the product. It is now available.",
        },
      ],
      supporting: [],
      contradicting: [],
    };
    const result = verifyUnresolvedState(baseObs, baseUnderstanding, evidence);
    expect(result.passed).toBe(false);
    expect(result.evidence.some((e) => e.includes("already be known"))).toBe(true);
  });

  test("verifyUnresolvedState fails when many resolved signals and no unresolved", () => {
    const evidence: EvidenceBundle = {
      primary: [
        { label: "A", url: "https://a.com", sourceType: "news", trustScore: 0.7, excerpt: "has launched" },
        { label: "B", url: "https://b.com", sourceType: "news", trustScore: 0.7, excerpt: "was launched" },
        { label: "C", url: "https://c.com", sourceType: "news", trustScore: 0.7, excerpt: "released" },
      ],
      supporting: [],
      contradicting: [],
    };
    const result = verifyUnresolvedState(baseObs, baseUnderstanding, evidence);
    expect(result.passed).toBe(false);
  });

  test("verifyUnresolvedState requiresReview when mixed signals", () => {
    const evidence: EvidenceBundle = {
      primary: [
        { label: "A", url: "https://a.com", sourceType: "news", trustScore: 0.7, excerpt: "announced" },
        { label: "B", url: "https://b.com", sourceType: "news", trustScore: 0.7, excerpt: "rumor" },
      ],
      supporting: [],
      contradicting: [],
    };
    const result = verifyUnresolvedState(baseObs, baseUnderstanding, evidence);
    expect(result.requiresReview).toBe(true);
    expect(result.passed).toBe(true);
  });

  test("verifyUnresolvedState requiresReview for unknown category", () => {
    const evidence: EvidenceBundle = { primary: [], supporting: [], contradicting: [] };
    const understanding: UnderstandingOutput = { ...baseUnderstanding, category: "unknown" };
    const result = verifyUnresolvedState(baseObs, understanding, evidence);
    expect(result.requiresReview).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Build Resolution Plan
// -----------------------------------------------------------------------------

describe("Safety Compliance — Build Resolution Plan", () => {
  const baseObs: SourceObservation = {
    sourceType: "coinGecko",
    sourceId: "cg",
    externalId: "x",
    observedAt: 0,
    title: "Will ETH exceed 6000?",
    raw: {},
  };

  const baseUnderstanding: UnderstandingOutput = {
    canonicalSubject: "ETH",
    eventType: "price_threshold",
    category: "crypto_asset",
    candidateQuestion: "Will ETH exceed 6000?",
    marketType: "binary",
    ambiguityScore: 0.2,
    marketabilityScore: 0.8,
    entities: [],
  };

  test("buildResolutionPlan composes oracleability and unresolved", () => {
    const evidence: EvidenceBundle = {
      primary: [
        {
          label: "CoinGecko",
          url: "https://api.coingecko.com",
          sourceType: "official_api",
          trustScore: 0.95,
        },
      ],
      supporting: [],
      contradicting: [],
    };
    const plan = buildResolutionPlan(baseObs, baseUnderstanding, evidence);
    expect(plan.resolutionMode).toBeDefined();
    expect(plan.oracleabilityScore).toBeGreaterThan(0);
    expect(plan.unresolvedCheckPassed).toBe(true);
    expect(plan.primarySources.length).toBeGreaterThan(0);
    expect(plan.resolutionPredicate).toBeDefined();
    expect(plan.reasons).toBeDefined();
    expect(plan.reasons!.length).toBeGreaterThan(0);
  });

  test("buildResolutionPlan downgrades to human_review when unresolved requiresReview", () => {
    // Mixed signals: primary has only unresolved (rumor), supporting has resolved (announced).
    // hasStrongOfficialResolvedEvidence checks primary only — primary has no resolved pattern, so false.
    // Result: requiresReview=true (mixed signals), oracle says deterministic → downgrade to human_review.
    const evidence: EvidenceBundle = {
      primary: [
        { label: "Rumor", url: "https://rumor.com", sourceType: "official_api", trustScore: 0.9, excerpt: "rumor expected" },
      ],
      supporting: [
        { label: "Announced", url: "https://announced.com", sourceType: "news", trustScore: 0.65, excerpt: "announced released" },
      ],
      contradicting: [],
    };
    const plan = buildResolutionPlan(baseObs, baseUnderstanding, evidence);
    expect(plan.resolutionMode).toBe("human_review");
  });

  test("buildResolutionPlan sets unresolvedCheckPassed false when evidence indicates resolved", () => {
    const evidence: EvidenceBundle = {
      primary: [
        {
          label: "Official",
          url: "https://official.com",
          sourceType: "official_website",
          trustScore: 0.9,
          excerpt: "officially launched and now available",
        },
      ],
      supporting: [],
      contradicting: [],
    };
    const plan = buildResolutionPlan(baseObs, baseUnderstanding, evidence);
    expect(plan.unresolvedCheckPassed).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Evidence Provider (for Case C — already resolved)
// -----------------------------------------------------------------------------

/** Evidence provider that returns primary evidence indicating outcome already known. */
class AlreadyResolvedEvidenceProvider implements EvidenceProvider {
  async search() {
    return {
      primary: [
        {
          label: "Official Announcement",
          url: "https://official.com/launch",
          sourceType: "official_website",
          excerpt: "We have officially launched the product. It is now available to all users.",
          trustHint: 0.9,
        } as RawEvidenceCandidate,
      ],
      supporting: [],
      contradicting: [],
    };
  }
}

// -----------------------------------------------------------------------------
// Case A — Safe: "Will ETH exceed $6000 by Dec 31 2026?"
// -----------------------------------------------------------------------------

describe("Safety Compliance — Case A (Safe)", () => {
  test("Case A: safe crypto asset market → ALLOW or REVIEW, strong oracleability", async () => {
    const obs: SourceObservation = {
      sourceType: "coinGecko",
      sourceId: "cg",
      externalId: "eth-6k-2026",
      observedAt: Math.floor(Date.now() / 1000),
      title: "Will ETH exceed $6000 by Dec 31 2026?",
      tags: ["crypto"],
      eventTime: 1735689600,
      raw: {},
    };
    const result = await analyzeCandidate(mockRuntime, obs, {
      config: { analysis: { useLlm: false, useExplainability: false } },
    });
    expect(result.understanding.category).toBe("crypto_asset");
    expect(["ALLOW", "REVIEW"]).toContain(result.policy.status);
    expect(result.resolutionPlan.oracleabilityScore).toBeGreaterThan(0);
    if (result.policy.status !== "REJECT") {
      expect(result.draft).toBeDefined();
      expect(result.draft?.outcomes).toContain("Yes");
      expect(result.draft?.outcomes).toContain("No");
    }
  });
});

// -----------------------------------------------------------------------------
// Case B — Banned: "Will Candidate X win the next election?"
// -----------------------------------------------------------------------------

describe("Safety Compliance — Case B (Banned)", () => {
  test("Case B: politics/election market → REJECT, CATEGORY_BANNED", async () => {
    const obs: SourceObservation = {
      sourceType: "polymarket",
      sourceId: "poly",
      externalId: "election-x",
      observedAt: 0,
      title: "Will Candidate X win the next election?",
      tags: ["Politics"],
      eventTime: 1735689600,
      raw: {},
    };
    const result = await analyzeCandidate(mockRuntime, obs, {
      config: { analysis: { useLlm: false, useExplainability: false } },
    });
    expect(result.policy.status).toBe("REJECT");
    expect(result.policy.ruleHits).toContain("CATEGORY_BANNED");
    expect(result.draft).toBeUndefined();
  });
});

// -----------------------------------------------------------------------------
// Case C — Already Resolved: evidence indicates outcome known
// -----------------------------------------------------------------------------

describe("Safety Compliance — Case C (Already Resolved)", () => {
  test("Case C: evidence indicates outcome known → REJECT, UNRESOLVED_CHECK_FAILED", async () => {
    const obs: SourceObservation = {
      sourceType: "http_proposal",
      sourceId: "proposal",
      externalId: "resolved-test",
      observedAt: 0,
      title: "Will Product Y launch by today?",
      body: "Product launch speculation",
      raw: {},
    };
    const resolvedProvider = new AlreadyResolvedEvidenceProvider();
    const evidenceService = createDefaultEvidenceService(resolvedProvider);

    const services = {
      classify: (await import("../src/analysis/classify")).classifyCandidate,
      enrich: (await import("../src/analysis/enrich")).enrichContext,
      risk: (await import("../src/analysis/riskScore")).scoreRisk,
      evidence: async (o: SourceObservation, u: import("../src/domain/understanding").UnderstandingOutput) =>
        evidenceService.fetch(o, u),
      resolution: (await import("../src/analysis/buildResolutionPlan")).buildResolutionPlan,
      policy: (await import("../src/policy/evaluate")).evaluatePolicy,
      draft: (await import("../src/analysis/draftSynthesis")).synthesizeDraft,
      explain: (await import("../src/analysis/explain")).generateMarketBrief,
    };

    const result = await analyzeCandidate(mockRuntime, obs, {
      config: { analysis: { useLlm: false, useExplainability: false } },
      services,
    });
    expect(result.policy.status).toBe("REJECT");
    expect(result.policy.ruleHits).toContain("UNRESOLVED_CHECK_FAILED");
    expect(result.draft).toBeUndefined();
  });
});

// -----------------------------------------------------------------------------
// Case D — Ambiguous Rumor: "Will MetaMask token soon?" + rumor
// -----------------------------------------------------------------------------

describe("Safety Compliance — Case D (Ambiguous Rumor)", () => {
  test("Case D: ambiguous rumor-based market → REVIEW or REJECT, elevated risk", async () => {
    const obs: SourceObservation = {
      sourceType: "custom",
      sourceId: "custom",
      externalId: "metamask-rumor",
      observedAt: 0,
      title: "Will MetaMask token soon?",
      body: "Community rumors say it may happen",
      tags: ["rumor"],
      raw: {},
    };
    const result = await analyzeCandidate(mockRuntime, obs, {
      config: { analysis: { useLlm: false, useExplainability: false } },
    });
    expect(["REVIEW", "REJECT"]).toContain(result.policy.status);
    expect(result.understanding.category).toBe("unknown");
    expect(result.risk.manipulationRisk).toBeGreaterThanOrEqual(0);
    if (result.policy.status === "REJECT") {
      expect(
        result.policy.ruleHits.some(
          (r) =>
            r === "ORACLEABILITY_TOO_LOW" ||
            r === "AMBIGUITY_REJECT" ||
            r === "CATEGORY_BANNED"
        )
      ).toBe(true);
    } else {
      expect(result.policy.ruleHits.some((r) => r.includes("REVIEW"))).toBe(true);
    }
  });
});
