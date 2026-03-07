/**
 * Demo analysis pipeline — uses mock services only (no LLM).
 * Same flow as analyzeCandidate but wired to demo mocks.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import type { SourceObservation } from "../src/domain/candidate";
import type { AnalysisResult } from "../src/domain/analysisResult";
import type { WorkflowConfig } from "../src/types/config";
import { mockClassify } from "./mocks/mockClassifier";
import { mockScoreRisk } from "./mocks/mockRiskScorer";
import { mockFetchEvidence } from "./mocks/mockEvidenceProvider";
import { mockBuildBrochure } from "./mocks/mockBrochure";
import { mockBuildResolutionPlan } from "./mocks/mockResolutionPlan";
import { evaluatePolicy } from "../src/policy/evaluate";
import { saveResolutionPlan } from "../src/pipeline/persistence/resolutionPlanStore";
import { logDraftDecision } from "../src/pipeline/audit/auditLogger";
import { keccak256, toHex } from "viem";
import type { DraftArtifact } from "../src/domain/draft";
import type { PolicyDecision } from "../src/domain/policy";
import type { ResolutionPlan } from "../src/domain/resolutionPlan";

/** Demo draft synthesis — no LLM, deterministic. */
function demoSynthesizeDraft(
  observation: SourceObservation,
  understanding: { candidateQuestion: string; marketType: string; category: string; outcomes?: string[] },
  risk: { overallRisk: number },
  evidence: { primary: Array<{ url: string }> },
  resolutionPlan: ResolutionPlan,
  policy: PolicyDecision
): DraftArtifact {
  // Use predictable ID for ETH 6000 fixture so publish-safe.json works out of the box (bytes32 = keccak256 of label)
  const isEth6000Fixture = /eth exceed \$6000|eth.*6000/i.test(understanding.candidateQuestion);
  const draftId = isEth6000Fixture
    ? ("0x3c37c2c1d9bfd2bfe058983a55ac0c0f609f2e7706be7db6175f4075120fc494" as `0x${string}`)
    : keccak256(toHex(`${observation.externalId}:${observation.observedAt}:${understanding.candidateQuestion}`));
  const canonicalQuestion = understanding.candidateQuestion;
  const outcomes = understanding.outcomes && understanding.outcomes.length >= 2 ? understanding.outcomes : ["Yes", "No"];
  const explanation = `Market from ${observation.sourceType}: ${observation.title}`;
  const evidenceLinks = evidence.primary.map((e) => e.url);

  return {
    draftId,
    canonicalQuestion,
    marketType: (understanding.marketType === "invalid" ? "binary" : understanding.marketType) as "binary" | "categorical" | "timeline",
    outcomes,
    category: understanding.category,
    explanation,
    evidenceLinks,
    policyVersion: policy.policyVersion,
    policyDecision: policy.status,
    policyReasons: policy.reasons,
    resolutionPlan,
    confidence: {
      topic: 0.85,
      risk: 1 - risk.overallRisk,
      oracleability: resolutionPlan.oracleabilityScore,
      explanation: 0.8,
    },
    createdAt: Math.floor(Date.now() / 1000),
  };
}

export async function demoAnalyzeCandidate(
  runtime: Runtime<WorkflowConfig>,
  observation: SourceObservation
): Promise<AnalysisResult> {
  const understanding = mockClassify(observation);
  const risk = mockScoreRisk(observation, understanding);
  const evidence = mockFetchEvidence(observation, understanding);
  const resolutionPlan = mockBuildResolutionPlan(observation, understanding, evidence);

  const policy = evaluatePolicy({
    observation,
    understanding,
    risk,
    evidence,
    resolutionPlan,
  });

  let draft: DraftArtifact | undefined;
  let marketBrief;

  if (policy.status !== "REJECT") {
    draft = demoSynthesizeDraft(
      observation,
      understanding,
      risk,
      evidence,
      resolutionPlan,
      policy
    );
    marketBrief = mockBuildBrochure(draft, evidence);
  }

  const draftAuditRecord = {
    candidateId: observation.externalId,
    sourceType: observation.sourceType,
    sourceId: observation.sourceId,
    externalId: observation.externalId,
    observedAt: observation.observedAt,
    understanding: {
      category: understanding.category,
      eventType: understanding.eventType,
      candidateQuestion: understanding.candidateQuestion,
      marketType: understanding.marketType,
      ambiguityScore: understanding.ambiguityScore,
      marketabilityScore: understanding.marketabilityScore,
    },
    risk: {
      overallRisk: risk.overallRisk,
      gamblingLanguageRisk: risk.gamblingLanguageRisk,
      flaggedTerms: risk.flaggedTerms ?? [],
    },
    resolutionPlan: {
      resolutionMode: resolutionPlan.resolutionMode,
      oracleabilityScore: resolutionPlan.oracleabilityScore,
      unresolvedCheckPassed: resolutionPlan.unresolvedCheckPassed,
      primarySourceCount: resolutionPlan.primarySources?.length ?? 0,
    },
    policy: {
      status: policy.status,
      reasons: policy.reasons,
      ruleHits: policy.ruleHits ?? [],
      policyVersion: policy.policyVersion,
    },
    draftId: draft?.draftId,
    createdAt: Math.floor(Date.now() / 1000),
  };
  logDraftDecision(draftAuditRecord as import("../src/domain/audit").DraftAuditRecord, runtime);

  if (draft && resolutionPlan) {
    saveResolutionPlan(resolutionPlan, {
      question: understanding.candidateQuestion,
      draftId: draft.draftId,
    });
  }

  return {
    observation,
    understanding,
    risk,
    evidence,
    resolutionPlan,
    policy,
    draft,
    marketBrief,
  };
}
