/**
 * Tests for CRE Orchestration Layer.
 * Covers source registry, analysis core, policy engine, and draft synthesis.
 */
import { describe, test, expect } from "bun:test";
import { feedItemToSourceObservation, polymarketDraftToSourceObservation } from "../src/sources/registry";
import { analyzeCandidate } from "../src/pipeline/orchestration/analyzeCandidate";
import { classifyCandidate } from "../src/analysis/classify";
import { evaluatePolicy } from "../src/policy/evaluate";
import type { SourceObservation } from "../src/domain/candidate";
import type { FeedItem } from "../src/types/feed";
import type { FeedConfig } from "../src/types/feed";
import type { UnderstandingOutput } from "../src/domain/understanding";
import type { RiskScores } from "../src/domain/risk";
import type { EvidenceBundle } from "../src/domain/evidence";
import type { ResolutionPlan } from "../src/domain/resolutionPlan";

const mockRuntime = {
  config: {},
  log: () => {},
} as any;

describe("CRE Orchestration Layer", () => {
  describe("Source Registry", () => {
    test("feedItemToSourceObservation maps FeedItem to SourceObservation", () => {
      const feed: FeedConfig = { id: "test", type: "coinGecko", category: "crypto" };
      const item: FeedItem = {
        feedId: "test",
        question: "Will BTC exceed 100k by 2026?",
        category: "crypto",
        resolveTime: 1735689600,
        sourceUrl: "https://api.coingecko.com",
        externalId: "test:btc:100k",
      };
      const obs = feedItemToSourceObservation(item, feed);
      expect(obs.sourceType).toBe("coinGecko");
      expect(obs.sourceId).toBe("test");
      expect(obs.externalId).toBe("test:btc:100k");
      expect(obs.title).toBe(item.question);
      expect(obs.eventTime).toBe(1735689600);
      expect(obs.raw).toEqual(item);
    });

    test("polymarketDraftToSourceObservation maps PolymarketDraftInput", () => {
      const feed: FeedConfig = { id: "poly", type: "polymarket" };
      const draft = {
        question: "Will X happen?",
        questionUri: "ipfs://q",
        outcomes: ["Yes", "No"],
        resolveTime: 1735689600,
        tradingOpen: 1735603200,
        tradingClose: 1735689600,
        externalId: "polymarket:evt1",
        category: "Crypto",
      };
      const obs = polymarketDraftToSourceObservation(draft, feed);
      expect(obs.sourceType).toBe("polymarket");
      expect(obs.title).toBe("Will X happen?");
      expect(obs.entityHints).toEqual(["Yes", "No"]);
      expect(obs.raw).toEqual(draft);
    });
  });

  describe("Classification", () => {
    test("classifyCandidate infers crypto_asset from coinGecko source", async () => {
      const obs: SourceObservation = {
        sourceType: "coinGecko",
        sourceId: "cg",
        externalId: "x",
        observedAt: 0,
        title: "Will ETH hit 5k?",
        tags: ["crypto"],
        eventTime: 1735689600,
        raw: {},
      };
      const u = await classifyCandidate(obs);
      expect(u.category).toBe("crypto_asset");
      expect(u.marketType).toBe("binary");
      expect(u.candidateQuestion).toBe("Will ETH hit 5k?");
    });

    test("classifyCandidate infers politics from Politics tag", async () => {
      const obs: SourceObservation = {
        sourceType: "polymarket",
        sourceId: "p",
        externalId: "x",
        observedAt: 0,
        title: "Will candidate win?",
        tags: ["Politics"],
        eventTime: 1735689600,
        raw: {},
      };
      const u = await classifyCandidate(obs);
      expect(u.category).toBe("politics");
    });
  });

  describe("Analysis Core", () => {
    test("analyzeCandidate returns AnalysisResult with policy and draft", async () => {
      const obs: SourceObservation = {
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
      const result = await analyzeCandidate(mockRuntime, obs);
      expect(result.observation).toBe(obs);
      expect(result.understanding).toBeDefined();
      expect(result.risk).toBeDefined();
      expect(result.evidence).toBeDefined();
      expect(result.resolutionPlan).toBeDefined();
      expect(result.policy).toBeDefined();
      expect(["ALLOW", "REVIEW", "REJECT"]).toContain(result.policy.status);
      if (result.policy.status !== "REJECT") {
        expect(result.draft).toBeDefined();
        expect(result.draft?.canonicalQuestion).toBe(obs.title);
        expect(result.draft?.outcomes).toContain("Yes");
        expect(result.draft?.outcomes).toContain("No");
      }
    });

    test("analyzeCandidate REJECTs banned category (politics)", async () => {
      const obs: SourceObservation = {
        sourceType: "polymarket",
        sourceId: "p",
        externalId: "poly:evt",
        observedAt: 0,
        title: "Will the incumbent win the election?",
        tags: ["Politics"],
        eventTime: 1735689600,
        raw: {},
      };
      const result = await analyzeCandidate(mockRuntime, obs);
      expect(result.policy.status).toBe("REJECT");
      expect(result.policy.reasons.some((r) => r.includes("politics") || r.includes("Banned"))).toBe(true);
      expect(result.draft).toBeUndefined();
    });

    test("analyzeCandidate REJECTs high gambling language risk", async () => {
      const obs: SourceObservation = {
        sourceType: "custom",
        sourceId: "c",
        externalId: "x",
        observedAt: 0,
        title: "Place your bet and wager on odds - gamble and stake now!",
        body: "bet wager odds gamble stake",
        tags: ["crypto"],
        eventTime: 1735689600,
        raw: {},
      };
      const result = await analyzeCandidate(mockRuntime, obs);
      expect(result.policy.status).toBe("REJECT");
      expect(result.policy.reasons.length).toBeGreaterThan(0);
      expect(
        result.policy.reasons.some(
          (r) => r.toLowerCase().includes("gambling") || r.toLowerCase().includes("language")
        )
      ).toBe(true);
    });
  });

  describe("Policy Engine", () => {
    test("evaluatePolicy REJECTs banned category", () => {
      const input = {
        observation: {} as SourceObservation,
        understanding: {
          category: "politics",
          ambiguityScore: 0.2,
        } as UnderstandingOutput,
        risk: { gamblingLanguageRisk: 0, overallRisk: 0.2 } as RiskScores,
        evidence: { primary: [], supporting: [], contradicting: [] } as EvidenceBundle,
        resolutionPlan: {
          unresolvedCheckPassed: true,
          oracleabilityScore: 0.9,
        } as ResolutionPlan,
      };
      const decision = evaluatePolicy(input);
      expect(decision.status).toBe("REJECT");
      expect(decision.reasons[0]).toContain("politics");
    });

    test("evaluatePolicy ALLOWs safe crypto candidate", () => {
      const input = {
        observation: {} as SourceObservation,
        understanding: {
          category: "crypto_asset",
          ambiguityScore: 0.2,
        } as UnderstandingOutput,
        risk: { gamblingLanguageRisk: 0, overallRisk: 0.2 } as RiskScores,
        evidence: { primary: [], supporting: [], contradicting: [] } as EvidenceBundle,
        resolutionPlan: {
          unresolvedCheckPassed: true,
          oracleabilityScore: 0.9,
        } as ResolutionPlan,
      };
      const decision = evaluatePolicy(input);
      expect(decision.status).toBe("ALLOW");
    });
  });
});
