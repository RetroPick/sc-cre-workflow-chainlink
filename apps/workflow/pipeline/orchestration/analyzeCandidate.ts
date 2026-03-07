/**
 * Analysis Core entrypoint — orchestrates full analysis pipeline.
 * Used by discoveryCron and HTTP proposal handlers.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import type { SourceObservation } from "../../domain/candidate";
import type { AnalysisResult } from "../../domain/analysisResult";
import type { WorkflowConfig } from "../../types/config";
import type { LlmProvider } from "../../models/interfaces";
import type { PrivacyProfile } from "../../domain/privacy";
import type { ConfidentialEvidenceProvider } from "../privacy/confidentialFetch";
import { createLlmProvider } from "../../models/providers/llmProvider";
import { classifyCandidate } from "../../analysis/classify";
import { enrichContext } from "../../analysis/enrich";
import { scoreRisk } from "../../analysis/riskScore";
import { fetchEvidence } from "../../analysis/evidenceFetcher";
import { buildResolutionPlan } from "../../analysis/buildResolutionPlan";
import { evaluatePolicy } from "../../policy/evaluate";
import { synthesizeDraft } from "../../analysis/draftSynthesis";
import { generateMarketBrief } from "../../analysis/explain";
import { logDraftDecision } from "../audit/auditLogger";
import { saveResolutionPlan } from "../persistence/resolutionPlanStore";
import { requiresConfidentialFetch } from "../privacy/privacyRouter";
import { makePrivacyAuditRecord, logPrivacyAudit } from "../privacy/privacyAudit";

export type AnalysisServices = {
  classify: typeof classifyCandidate;
  enrich: typeof enrichContext;
  risk: typeof scoreRisk;
  evidence: typeof fetchEvidence;
  resolution: typeof buildResolutionPlan;
  policy: typeof evaluatePolicy;
  draft: typeof synthesizeDraft;
  explain: typeof generateMarketBrief;
};

export type AnalyzeCandidateOptions = {
  services?: AnalysisServices;
  config?: WorkflowConfig;
  llm?: LlmProvider;
  /** When provided and privacyProfile requires it, used for protected-source evidence fetch. */
  confidentialEvidenceProvider?: ConfidentialEvidenceProvider;
};

/** Resolve privacy profile from observation or config default. */
function resolvePrivacyProfile(
  observation: SourceObservation,
  config?: WorkflowConfig
): PrivacyProfile {
  if (observation.privacyProfile) return observation.privacyProfile;
  return config?.privacy?.defaultProfile ?? "PUBLIC";
}

function buildServices(): AnalysisServices {
  return {
    classify: classifyCandidate,
    enrich: enrichContext,
    risk: scoreRisk,
    evidence: fetchEvidence,
    resolution: buildResolutionPlan,
    policy: evaluatePolicy,
    draft: synthesizeDraft,
    explain: generateMarketBrief,
  };
}

export async function analyzeCandidate(
  runtime: Runtime<WorkflowConfig>,
  observation: SourceObservation,
  options?: AnalyzeCandidateOptions
): Promise<AnalysisResult> {
  const services = options?.services ?? buildServices();
  const useLlm = options?.config?.analysis?.useLlm ?? false;
  const useExplainability = options?.config?.analysis?.useExplainability ?? false;
  const llm = options?.llm ?? (useLlm ? createLlmProvider(runtime) : undefined);

  const privacyProfile = resolvePrivacyProfile(observation, options?.config);
  const confidentialProvider = options?.confidentialEvidenceProvider;
  if (
    requiresConfidentialFetch(privacyProfile) &&
    confidentialProvider
  ) {
    const controlled = await confidentialProvider.fetchConfidential({
      marketId: undefined,
      queryType: "PREMIUM_RESEARCH_LOOKUP",
      parameters: { subject: observation.title },
      privacyProfile,
    });
    const auditRecord = makePrivacyAuditRecord({
      workflowType: "CONFIDENTIAL_FETCH",
      privacyProfile,
      providerType: "ConfidentialEvidenceProvider",
      actionTaken: "fetchConfidential",
      disclosedOutput: controlled.publicOutput,
      privateReferenceId: controlled.privateReferenceId,
    });
    logPrivacyAudit(auditRecord, runtime);
  }

  const classifyOpts = llm && useLlm ? { llm, useLlm: true } : undefined;
  const understanding = await services.classify(observation, classifyOpts);
  const risk = await services.risk(observation, understanding, classifyOpts);
  const evidence = await services.evidence(observation, understanding);
  const resolutionPlan = services.resolution(observation, understanding, evidence);

  const policy = services.policy({
    observation,
    understanding,
    risk,
    evidence,
    resolutionPlan,
  });

  let draft;
  let marketBrief;
  if (policy.status !== "REJECT") {
    draft = await services.draft({
      observation,
      understanding,
      risk,
      evidence,
      resolutionPlan,
      policy,
      llm,
      useLlm: !!llm && useLlm,
    });
    if (draft && useExplainability && llm) {
      marketBrief = await services.explain(draft, evidence, { llm });
    }
  }

  const draftAuditRecord: import("../../domain/audit").DraftAuditRecord = {
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
  logDraftDecision(draftAuditRecord, runtime);

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
