/**
 * Market Drafting Pipeline (04) tests.
 * Covers draftWriter, draftRepository, publishRevalidation, and drafting flow.
 */
import { describe, test, expect } from "bun:test";
import {
  writeDraftRecord,
  markDraftClaimed,
  markDraftPublished,
  expireDraft,
  type DraftRepository,
} from "../src/pipeline/creation/draftWriter";
import { createInMemoryDraftRepository, getDefaultDraftRepository } from "../src/pipeline/persistence/draftRepository";
import { revalidateForPublish } from "../src/pipeline/creation/publishRevalidation";
import type { SourceObservation } from "../src/domain/candidate";
import type { UnderstandingOutput } from "../src/domain/understanding";
import type { RiskScores } from "../src/domain/risk";
import type { EvidenceBundle } from "../src/domain/evidence";
import type { ResolutionPlan } from "../src/domain/resolutionPlan";
import type { PolicyDecision } from "../src/domain/policy";
import type { DraftArtifact } from "../src/domain/draft";

function makeObservation(): SourceObservation {
  return {
    sourceType: "http",
    sourceId: "http-proposal",
    externalId: "test:eth-6k",
    observedAt: Math.floor(Date.now() / 1000),
    title: "Will ETH exceed $6000 by Dec 31, 2026?",
    eventTime: Math.floor(Date.now() / 1000) + 86400 * 365,
    raw: {
      feedId: "http",
      question: "Will ETH exceed $6000 by Dec 31, 2026?",
      category: "crypto",
      resolveTime: Math.floor(Date.now() / 1000) + 86400 * 365,
      externalId: "test:eth-6k",
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
    primarySources: [
      { sourceType: "official_api", locator: "coingecko", trustScore: 0.9 },
    ],
    fallbackSources: [],
    resolutionPredicate: "Closing price at resolve time",
    oracleabilityScore: 0.9,
    unresolvedCheckPassed: true,
    unresolvedCheckEvidence: ["Price below threshold"],
  };
}

function makeDraft(resolveTime: number): DraftArtifact {
  return {
    draftId: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    canonicalQuestion: "Will ETH exceed $6000 by Dec 31, 2026?",
    marketType: "binary",
    outcomes: ["Yes", "No"],
    category: "crypto_asset",
    explanation: "Market from http: Will ETH exceed $6000 by Dec 31, 2026?",
    evidenceLinks: ["https://coingecko.com"],
    policyVersion: "v1",
    policyDecision: "ALLOW",
    policyReasons: ["AUTO_ALLOW"],
    resolutionPlan: makeResolutionPlan(),
    confidence: { topic: 0.9, risk: 0.85, oracleability: 0.9, explanation: 0.8 },
    createdAt: Math.floor(Date.now() / 1000),
  };
}

/** Create isolated repo for test independence. */
function isolatedRepo() {
  return createInMemoryDraftRepository(new Map());
}

describe("Market Drafting Pipeline (04)", () => {
  describe("DraftRepository", () => {
    test("createInMemoryDraftRepository put and get", async () => {
      const repo = isolatedRepo();
      const record = {
        draftId: "0xabc",
        status: "PENDING_CLAIM" as const,
        observation: makeObservation(),
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: makeResolutionPlan(),
        policy: { status: "ALLOW" as const, reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any },
        draft: makeDraft(0),
        brochure: {
          title: "ETH $6k",
          explanation: "Test",
          whyThisMarketExists: "",
          evidenceSummary: [],
          sourceLinks: [],
          resolutionExplanation: "",
          caveats: [],
        },
        createdAt: Math.floor(Date.now() / 1000),
      };
      await repo.put(record);
      const got = await repo.get("0xabc");
      expect(got).not.toBeNull();
      expect(got?.draftId).toBe("0xabc");
      expect(got?.status).toBe("PENDING_CLAIM");
    });

    test("getDefaultDraftRepository returns singleton", () => {
      const a = getDefaultDraftRepository();
      const b = getDefaultDraftRepository();
      expect(a).toBe(b);
    });

    test("get returns null for non-existent draftId", async () => {
      const repo = isolatedRepo();
      const got = await repo.get("0xnonexistent");
      expect(got).toBeNull();
    });

    test("put/get are case-insensitive for draftId", async () => {
      const repo = isolatedRepo();
      const record = {
        draftId: "0xAbCdEf",
        status: "PENDING_CLAIM" as const,
        observation: makeObservation(),
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: makeResolutionPlan(),
        policy: { status: "ALLOW" as const, reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any },
        draft: makeDraft(0),
        brochure: {
          title: "Test",
          explanation: "",
          whyThisMarketExists: "",
          evidenceSummary: [],
          sourceLinks: [],
          resolutionExplanation: "",
          caveats: [],
        },
        createdAt: Math.floor(Date.now() / 1000),
      };
      await repo.put(record);
      expect(await repo.get("0xabcdef")).not.toBeNull();
      expect(await repo.get("0xABCDEF")).not.toBeNull();
    });

    test("updateStatus on non-existent draftId is no-op", async () => {
      const repo = isolatedRepo();
      await repo.updateStatus({
        draftId: "0xnonexistent",
        status: "PUBLISHED",
        publishedAt: Math.floor(Date.now() / 1000),
      });
      expect(await repo.get("0xnonexistent")).toBeNull();
    });
  });

  describe("writeDraftRecord", () => {
    test("writes ALLOW draft as PENDING_CLAIM", async () => {
      const repo = isolatedRepo();
      const policy: PolicyDecision = { status: "ALLOW", reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any };
      const draft = makeDraft(Math.floor(Date.now() / 1000) + 86400 * 365);
      const obs = makeObservation();
      (obs.raw as any).resolveTime = Math.floor(Date.now() / 1000) + 86400 * 365;

      const record = await writeDraftRecord({
        repo,
        observation: obs,
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: makeResolutionPlan(),
        policy,
        draft,
      });

      expect(record.status).toBe("PENDING_CLAIM");
      expect(record.draftId).toBe(draft.draftId);
      const got = await repo.get(draft.draftId);
      expect(got?.status).toBe("PENDING_CLAIM");
    });

    test("writes REVIEW draft as REVIEW_REQUIRED", async () => {
      const repo = isolatedRepo();
      const policy: PolicyDecision = { status: "REVIEW", reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any };
      const draft = makeDraft(0);

      const record = await writeDraftRecord({
        repo,
        observation: makeObservation(),
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: makeResolutionPlan(),
        policy,
        draft,
      });

      expect(record.status).toBe("REVIEW_REQUIRED");
    });

    test("throws when policy is REJECT (per doc §4.5)", async () => {
      const repo = isolatedRepo();
      const policy: PolicyDecision = { status: "REJECT", reasons: ["ELECTION"], policyVersion: "v1", ruleHits: [], scores: {} as any };
      await expect(
        writeDraftRecord({
          repo,
          observation: makeObservation(),
          understanding: makeUnderstanding(),
          risk: makeRisk(),
          evidence: makeEvidence(),
          resolutionPlan: makeResolutionPlan(),
          policy,
          draft: makeDraft(0),
        })
      ).rejects.toThrow("writeDraftRecord should not be called for REJECT");
    });

    test("uses custom brochure when provided", async () => {
      const repo = isolatedRepo();
      const policy: PolicyDecision = { status: "ALLOW", reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any };
      const customBrochure = {
        title: "Custom Title",
        explanation: "Custom explanation",
        whyThisMarketExists: "Because",
        evidenceSummary: ["Custom evidence"],
        sourceLinks: ["https://custom.com"],
        resolutionExplanation: "Custom resolution",
        caveats: ["Custom caveat"],
      };
      const record = await writeDraftRecord({
        repo,
        observation: makeObservation(),
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: makeResolutionPlan(),
        policy,
        draft: makeDraft(0),
        brochure: customBrochure,
      });
      expect(record.brochure.title).toBe("Custom Title");
      expect(record.brochure.explanation).toBe("Custom explanation");
    });

    test("calls DraftBoardRegistrar when PENDING_CLAIM and registrar provided", async () => {
      const repo = isolatedRepo();
      const policy: PolicyDecision = { status: "ALLOW", reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any };
      let registered = false;
      const registrar = {
        registerDraft: async () => {
          registered = true;
          return { onchainDraftRef: "0xonchain123" };
        },
      };
      const record = await writeDraftRecord({
        repo,
        registrar,
        observation: makeObservation(),
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: makeResolutionPlan(),
        policy,
        draft: makeDraft(0),
      });
      expect(registered).toBe(true);
      expect(record.onchainDraftRef).toBe("0xonchain123");
    });
  });

  describe("markDraftClaimed / markDraftPublished / expireDraft", () => {
    test("lifecycle transitions", async () => {
      const repo = isolatedRepo();
      const policy: PolicyDecision = { status: "ALLOW", reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any };
      const draft = makeDraft(0);

      await writeDraftRecord({
        repo,
        observation: makeObservation(),
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: makeResolutionPlan(),
        policy,
        draft,
      });

      await markDraftClaimed({ repo, draftId: draft.draftId, creator: "0xcreator", claimer: "0xclaimer" });
      let got = await repo.get(draft.draftId);
      expect(got?.status).toBe("CLAIMED");

      await markDraftPublished({ repo, draftId: draft.draftId, marketId: "42" });
      got = await repo.get(draft.draftId);
      expect(got?.status).toBe("PUBLISHED");
      expect(got?.marketId).toBe("42");
    });

    test("expireDraft transitions status to EXPIRED", async () => {
      const repo = isolatedRepo();
      const policy: PolicyDecision = { status: "ALLOW", reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any };
      const draft = makeDraft(0);
      await writeDraftRecord({
        repo,
        observation: makeObservation(),
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: makeResolutionPlan(),
        policy,
        draft,
      });
      await expireDraft({ repo, draftId: draft.draftId });
      const got = await repo.get(draft.draftId);
      expect(got?.status).toBe("EXPIRED");
    });
  });

  describe("revalidateForPublish", () => {
    test("passes when draft and params match", async () => {
      const repo = isolatedRepo();
      const resolveTime = Math.floor(Date.now() / 1000) + 86400 * 365;
      const obs = makeObservation();
      (obs.raw as any).resolveTime = resolveTime;

      const draft = makeDraft(resolveTime);
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

      const record = await repo.get(draft.draftId);
      expect(record).not.toBeNull();

      const result = revalidateForPublish(record!, {
        draftId: draft.draftId,
        creator: "0xcreator",
        params: {
          question: draft.canonicalQuestion,
          marketType: 0,
          outcomes: draft.outcomes,
          timelineWindows: [],
          resolveTime,
          tradingOpen: Math.floor(Date.now() / 1000),
          tradingClose: resolveTime,
        },
        claimerSig: "0x",
      });

      expect(result.ok).toBe(true);
    });

    test("fails when question mismatch", async () => {
      const repo = isolatedRepo();
      const draft = makeDraft(0);
      const policy: PolicyDecision = { status: "ALLOW", reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any };

      await writeDraftRecord({
        repo,
        observation: makeObservation(),
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: makeResolutionPlan(),
        policy,
        draft,
      });

      const record = await repo.get(draft.draftId);
      const result = revalidateForPublish(record!, {
        draftId: draft.draftId,
        creator: "0xcreator",
        params: {
          question: "Different question?",
          marketType: 0,
          outcomes: ["Yes", "No"],
          timelineWindows: [],
          resolveTime: 0,
          tradingOpen: 0,
          tradingClose: 0,
        },
        claimerSig: "0x",
      });

      expect(result.ok).toBe(false);
      expect((result as { reason: string }).reason).toContain("question");
    });

    test("fails when draft expired", async () => {
      const repo = isolatedRepo();
      const draft = makeDraft(0);
      const policy: PolicyDecision = { status: "ALLOW", reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any };

      const record = await writeDraftRecord({
        repo,
        observation: makeObservation(),
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: makeResolutionPlan(),
        policy,
        draft,
        expiresAt: Math.floor(Date.now() / 1000) - 1,
      });

      const result = revalidateForPublish(record, {
        draftId: draft.draftId,
        creator: "0xcreator",
        params: {
          question: draft.canonicalQuestion,
          marketType: 0,
          outcomes: draft.outcomes,
          timelineWindows: [],
          resolveTime: 0,
          tradingOpen: 0,
          tradingClose: 0,
        },
        claimerSig: "0x",
      });

      expect(result.ok).toBe(false);
      expect((result as { reason: string }).reason).toContain("expired");
    });

    test("fails when draftId mismatch", async () => {
      const repo = isolatedRepo();
      const draft = makeDraft(0);
      const policy: PolicyDecision = { status: "ALLOW", reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any };
      const record = await writeDraftRecord({
        repo,
        observation: makeObservation(),
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: makeResolutionPlan(),
        policy,
        draft,
      });
      const result = revalidateForPublish(record, {
        draftId: "0xdifferent",
        creator: "0xcreator",
        params: {
          question: draft.canonicalQuestion,
          marketType: 0,
          outcomes: draft.outcomes,
          timelineWindows: [],
          resolveTime: 0,
          tradingOpen: 0,
          tradingClose: 0,
        },
        claimerSig: "0x",
      });
      expect(result.ok).toBe(false);
      expect((result as { reason: string }).reason).toContain("draftId");
    });

    test("fails when status is REJECTED", async () => {
      const repo = isolatedRepo();
      const draft = makeDraft(0);
      const record = await writeDraftRecord({
        repo,
        observation: makeObservation(),
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: makeResolutionPlan(),
        policy: { status: "REVIEW", reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any },
        draft,
      });
      await repo.updateStatus({ draftId: draft.draftId, status: "REJECTED" });
      const updated = await repo.get(draft.draftId);
      const result = revalidateForPublish(updated!, {
        draftId: draft.draftId,
        creator: "0xcreator",
        params: {
          question: draft.canonicalQuestion,
          marketType: 0,
          outcomes: draft.outcomes,
          timelineWindows: [],
          resolveTime: 0,
          tradingOpen: 0,
          tradingClose: 0,
        },
        claimerSig: "0x",
      });
      expect(result.ok).toBe(false);
      expect((result as { reason: string }).reason).toContain("REJECTED");
    });

    test("fails when status is PUBLISHED", async () => {
      const repo = isolatedRepo();
      const draft = makeDraft(0);
      const policy: PolicyDecision = { status: "ALLOW", reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any };
      await writeDraftRecord({
        repo,
        observation: makeObservation(),
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: makeResolutionPlan(),
        policy,
        draft,
      });
      await markDraftPublished({ repo, draftId: draft.draftId });
      const updated = await repo.get(draft.draftId);
      const result = revalidateForPublish(updated!, {
        draftId: draft.draftId,
        creator: "0xcreator",
        params: {
          question: draft.canonicalQuestion,
          marketType: 0,
          outcomes: draft.outcomes,
          timelineWindows: [],
          resolveTime: 0,
          tradingOpen: 0,
          tradingClose: 0,
        },
        claimerSig: "0x",
      });
      expect(result.ok).toBe(false);
      expect((result as { reason: string }).reason).toContain("PUBLISHED");
    });

    test("fails when status is REVIEW_REQUIRED", async () => {
      const repo = isolatedRepo();
      const draft = makeDraft(0);
      const record = await writeDraftRecord({
        repo,
        observation: makeObservation(),
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: makeResolutionPlan(),
        policy: { status: "REVIEW", reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any },
        draft,
      });
      const result = revalidateForPublish(record, {
        draftId: draft.draftId,
        creator: "0xcreator",
        params: {
          question: draft.canonicalQuestion,
          marketType: 0,
          outcomes: draft.outcomes,
          timelineWindows: [],
          resolveTime: 0,
          tradingOpen: 0,
          tradingClose: 0,
        },
        claimerSig: "0x",
      });
      expect(result.ok).toBe(false);
      expect((result as { reason: string }).reason).toContain("REVIEW_REQUIRED");
    });

    test("fails when marketType mismatch", async () => {
      const repo = isolatedRepo();
      const draft = makeDraft(0);
      const policy: PolicyDecision = { status: "ALLOW", reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any };
      const record = await writeDraftRecord({
        repo,
        observation: makeObservation(),
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: makeResolutionPlan(),
        policy,
        draft,
      });
      const result = revalidateForPublish(record, {
        draftId: draft.draftId,
        creator: "0xcreator",
        params: {
          question: draft.canonicalQuestion,
          marketType: 1,
          outcomes: draft.outcomes,
          timelineWindows: [],
          resolveTime: 0,
          tradingOpen: 0,
          tradingClose: 0,
        },
        claimerSig: "0x",
      });
      expect(result.ok).toBe(false);
      expect((result as { reason: string }).reason).toContain("marketType");
    });

    test("fails when outcomes mismatch", async () => {
      const repo = isolatedRepo();
      const draft = makeDraft(0);
      const policy: PolicyDecision = { status: "ALLOW", reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any };
      const record = await writeDraftRecord({
        repo,
        observation: makeObservation(),
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: makeResolutionPlan(),
        policy,
        draft,
      });
      const result = revalidateForPublish(record, {
        draftId: draft.draftId,
        creator: "0xcreator",
        params: {
          question: draft.canonicalQuestion,
          marketType: 0,
          outcomes: ["No", "Yes"],
          timelineWindows: [],
          resolveTime: 0,
          tradingOpen: 0,
          tradingClose: 0,
        },
        claimerSig: "0x",
      });
      expect(result.ok).toBe(false);
      expect((result as { reason: string }).reason).toContain("outcomes");
    });

    test("fails when resolveTime mismatch", async () => {
      const repo = isolatedRepo();
      const resolveTime = Math.floor(Date.now() / 1000) + 86400 * 365;
      const obs = makeObservation();
      (obs.raw as any).resolveTime = resolveTime;
      const draft = makeDraft(resolveTime);
      const policy: PolicyDecision = { status: "ALLOW", reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any };
      const record = await writeDraftRecord({
        repo,
        observation: obs,
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: makeResolutionPlan(),
        policy,
        draft,
      });
      const result = revalidateForPublish(record, {
        draftId: draft.draftId,
        creator: "0xcreator",
        params: {
          question: draft.canonicalQuestion,
          marketType: 0,
          outcomes: draft.outcomes,
          timelineWindows: [],
          resolveTime: resolveTime + 1,
          tradingOpen: 0,
          tradingClose: resolveTime + 1,
        },
        claimerSig: "0x",
      });
      expect(result.ok).toBe(false);
      expect((result as { reason: string }).reason).toContain("resolveTime");
    });

    test("fails when unresolvedCheckPassed is false", async () => {
      const repo = isolatedRepo();
      const resolveTime = Math.floor(Date.now() / 1000) + 86400 * 365;
      const obs = makeObservation();
      (obs.raw as any).resolveTime = resolveTime;
      obs.eventTime = resolveTime;
      const rp = makeResolutionPlan();
      rp.unresolvedCheckPassed = false;
      const draft = makeDraft(resolveTime);
      draft.resolutionPlan = rp;
      const policy: PolicyDecision = { status: "ALLOW", reasons: [], policyVersion: "v1", ruleHits: [], scores: {} as any };
      const record = await writeDraftRecord({
        repo,
        observation: obs,
        understanding: makeUnderstanding(),
        risk: makeRisk(),
        evidence: makeEvidence(),
        resolutionPlan: rp,
        policy,
        draft,
      });
      const expectedResolve =
        (record.observation.raw as { resolveTime?: number })?.resolveTime ??
        record.observation.eventTime ??
        0;
      const result = revalidateForPublish(record, {
        draftId: draft.draftId,
        creator: "0xcreator",
        params: {
          question: draft.canonicalQuestion,
          marketType: 0,
          outcomes: draft.outcomes,
          timelineWindows: [],
          resolveTime: expectedResolve,
          tradingOpen: 0,
          tradingClose: expectedResolve,
        },
        claimerSig: "0x",
      });
      expect(result.ok).toBe(false);
      expect((result as { reason: string }).reason).toContain("unresolved");
    });

    test("passes when status is CLAIMED", async () => {
      const repo = isolatedRepo();
      const resolveTime = Math.floor(Date.now() / 1000) + 86400 * 365;
      const obs = makeObservation();
      (obs.raw as any).resolveTime = resolveTime;
      const draft = makeDraft(resolveTime);
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
      await markDraftClaimed({ repo, draftId: draft.draftId });
      const record = await repo.get(draft.draftId);
      const result = revalidateForPublish(record!, {
        draftId: draft.draftId,
        creator: "0xcreator",
        params: {
          question: draft.canonicalQuestion,
          marketType: 0,
          outcomes: draft.outcomes,
          timelineWindows: [],
          resolveTime,
          tradingOpen: Math.floor(Date.now() / 1000),
          tradingClose: resolveTime,
        },
        claimerSig: "0x",
      });
      expect(result.ok).toBe(true);
    });
  });
});
