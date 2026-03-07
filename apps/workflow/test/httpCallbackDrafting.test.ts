/**
 * HTTP Callback drafting pipeline tests.
 * Covers publish-from-draft routing, draft-not-found, revalidation failure,
 * and create-market validation per 04_MarketDraftingPipeline.md §6.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { onHttpTrigger } from "../src/httpCallback";
import { getDefaultDraftRepository, createInMemoryDraftRepository } from "../src/pipeline/persistence/draftRepository";
import { writeDraftRecord } from "../src/pipeline/creation/draftWriter";
import type { SourceObservation } from "../src/domain/candidate";
import type { UnderstandingOutput } from "../src/domain/understanding";
import type { RiskScores } from "../src/domain/risk";
import type { EvidenceBundle } from "../src/domain/evidence";
import type { ResolutionPlan } from "../src/domain/resolutionPlan";
import type { PolicyDecision } from "../src/domain/policy";
import type { DraftArtifact } from "../src/domain/draft";

function makeObservation(resolveTime: number): SourceObservation {
  return {
    sourceType: "http",
    sourceId: "http-proposal",
    externalId: "test:http-draft",
    observedAt: Math.floor(Date.now() / 1000),
    title: "Will ETH exceed $6000 by Dec 31, 2026?",
    eventTime: resolveTime,
    raw: {
      feedId: "http",
      question: "Will ETH exceed $6000 by Dec 31, 2026?",
      category: "crypto",
      resolveTime,
      externalId: "test:http-draft",
    },
  };
}

function makeUnderstanding(): UnderstandingOutput {
  return {
    canonicalSubject: "Ethereum",
    eventType: "threshold",
    category: "crypto_asset",
    candidateQuestion: "Will ETH exceed $6000 by Dec 31, 2026?",
    marketType: "binary",
    outcomes: ["Yes", "No"],
    entities: ["ETH"],
    ambiguityScore: 0.2,
    marketabilityScore: 0.9,
  };
}

function makeRisk(): RiskScores {
  return {
    categoryRisk: 0.1,
    gamblingLanguageRisk: 0,
    manipulationRisk: 0.1,
    ambiguityRisk: 0.2,
    policySensitivityRisk: 0,
    duplicateRisk: 0,
    harmRisk: 0,
    overallRisk: 0.15,
    flaggedTerms: [],
    rationale: [],
  };
}

function makeEvidence(): EvidenceBundle {
  return {
    primary: [{ label: "CoinGecko", url: "https://coingecko.com", sourceType: "official_api", trustScore: 0.9 }],
    supporting: [],
    contradicting: [],
  };
}

function makeResolutionPlan(): ResolutionPlan {
  return {
    resolutionMode: "deterministic",
    primarySources: [{ sourceType: "official_api", locator: "coingecko", trustScore: 0.9 }],
    fallbackSources: [],
    resolutionPredicate: "Closing price at resolve time",
    oracleabilityScore: 0.9,
    unresolvedCheckPassed: true,
    unresolvedCheckEvidence: [],
  };
}

function makeDraft(draftId: string, resolveTime: number): DraftArtifact {
  return {
    draftId,
    canonicalQuestion: "Will ETH exceed $6000 by Dec 31, 2026?",
    marketType: "binary",
    outcomes: ["Yes", "No"],
    category: "crypto_asset",
    explanation: "Market from http",
    evidenceLinks: ["https://coingecko.com"],
    policyVersion: "v1",
    policyDecision: "ALLOW",
    policyReasons: ["AUTO_ALLOW"],
    resolutionPlan: makeResolutionPlan(),
    confidence: { topic: 0.9, risk: 0.85, oracleability: 0.9, explanation: 0.8 },
    createdAt: Math.floor(Date.now() / 1000),
  };
}

function mockRuntime(overrides: Record<string, unknown> = {}) {
  return {
    config: {
      creatorAddress: "0xbeaA395506D02d20749d8E39ddb996ACe1C85Bfc" as `0x${string}`,
      evms: [{ chainSelectorName: "ethereum-testnet-sepolia", gasLimit: "500000" }],
      orchestration: { enabled: true, draftingPipeline: true },
      ...overrides,
    },
    log: () => {},
    ...overrides,
  } as any;
}

/** CRE decodeJson expects Uint8Array. Encode JSON string to bytes. */
function httpPayload(input: unknown) {
  const str = typeof input === "string" ? input : JSON.stringify(input);
  return {
    input: new TextEncoder().encode(str),
  } as any;
}

describe("HTTP Callback Drafting Pipeline", () => {
  describe("Publish-from-draft route (§6.2)", () => {
    test("returns Draft not found when draftId does not exist", async () => {
      const runtime = mockRuntime();
      const payload = httpPayload({
        draftId: "0x0000000000000000000000000000000000000000000000000000000000000000",
        creator: "0xbeaA395506D02d20749d8E39ddb996ACe1C85Bfc",
        params: {
          question: "Will ETH exceed $6000?",
          marketType: 0,
          outcomes: ["Yes", "No"],
          timelineWindows: [],
          resolveTime: Math.floor(Date.now() / 1000) + 86400,
          tradingOpen: 0,
          tradingClose: Math.floor(Date.now() / 1000) + 86400,
        },
        claimerSig: "0x",
      });
      const result = await onHttpTrigger(runtime, payload);
      const parsed = JSON.parse(result);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toBe("Draft not found");
    });

    test("returns revalidation error when params mismatch stored draft", async () => {
      const draftId = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
      const resolveTime = Math.floor(Date.now() / 1000) + 86400 * 365;
      const repo = getDefaultDraftRepository();
      const obs = makeObservation(resolveTime);
      const draft = makeDraft(draftId, resolveTime);
      const policy: PolicyDecision = { status: "ALLOW", reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any };

      await writeDraftRecord({
        repo,
        observation: obs,
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: makeResolutionPlan(),
        policy,
        draft,
      });

      const payload = httpPayload({
        draftId,
        creator: "0xbeaA395506D02d20749d8E39ddb996ACe1C85Bfc",
        params: {
          question: "Different question - mismatch?",
          marketType: 0,
          outcomes: ["Yes", "No"],
          timelineWindows: [],
          resolveTime,
          tradingOpen: 0,
          tradingClose: resolveTime,
        },
        claimerSig: "0x",
      });

      const result = await onHttpTrigger(mockRuntime(), payload);
      const parsed = JSON.parse(result);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toContain("question");
    });
  });

  describe("Create market route", () => {
    test("returns Error when question is empty", async () => {
      const runtime = mockRuntime();
      const payload = httpPayload({ question: "" });
      const result = await onHttpTrigger(runtime, payload);
      expect(result).toContain("Question is required");
    });

    test("returns Error when question is missing", async () => {
      const runtime = mockRuntime();
      const payload = httpPayload({});
      const result = await onHttpTrigger(runtime, payload);
      expect(result).toContain("Question is required");
    });

    test("returns Error when creatorAddress is missing for create path", async () => {
      const runtime = {
        config: {
          creatorAddress: undefined,
          evms: [{ chainSelectorName: "ethereum-testnet-sepolia", gasLimit: "500000" }],
          orchestration: { enabled: true, draftingPipeline: true },
        },
        log: () => {},
      } as any;
      const payload = httpPayload({
        question: "Will X happen?",
      });
      const result = await onHttpTrigger(runtime, payload);
      expect(result).toContain("creatorAddress");
    });
  });

  describe("Empty request", () => {
    test("returns Error when input is empty", async () => {
      const runtime = mockRuntime();
      const payload = httpPayload("");
      const result = await onHttpTrigger(runtime, payload);
      expect(result).toContain("Empty Request");
    });
  });
});
