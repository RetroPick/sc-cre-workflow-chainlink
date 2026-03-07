/**
 * Audit logging for draft and settlement decisions.
 * Per 03_SafetyComplienceLayer.md §12.
 * Initially logs to console; later pluggable (Firestore, DB).
 */
import type { DraftAuditRecord, SettlementAuditRecord } from "../../domain/audit";
import type { SettlementArtifact } from "../../domain/settlementArtifact";
import type { Runtime } from "@chainlink/cre-sdk";

function formatDraftRecord(record: DraftAuditRecord): string {
  return JSON.stringify({
    type: "DRAFT_AUDIT",
    candidateId: record.candidateId,
    sourceType: record.sourceType,
    policyStatus: record.policy.status,
    ruleHits: record.policy.ruleHits,
    draftId: record.draftId,
    timestamp: record.createdAt,
  });
}

function formatSettlementRecord(record: SettlementAuditRecord): string {
  return JSON.stringify({
    type: "SETTLEMENT_AUDIT",
    marketId: record.marketId,
    question: record.question,
    status: record.settlementDecision,
    outcomeIndex: record.outcomeIndex,
    confidence: record.confidence,
    txHash: record.txHash,
    timestamp: record.createdAt,
  });
}

/**
 * Log draft-time decision for compliance audit trail.
 */
export function logDraftDecision(
  record: DraftAuditRecord,
  runtime?: Runtime
): void {
  const formatted = formatDraftRecord(record);
  if (runtime) {
    runtime.log(`[Audit] ${formatted}`);
  }
  if (typeof console !== "undefined" && console.info) {
    console.info(`[SafetyCompliance] ${formatted}`);
  }
}

/**
 * Log settlement-time decision for compliance audit trail.
 */
export function logSettlementDecision(
  record: SettlementAuditRecord,
  runtime?: Runtime
): void {
  const formatted = formatSettlementRecord(record);
  if (runtime) {
    runtime.log(`[Audit] ${formatted}`);
  }
  if (typeof console !== "undefined" && console.info) {
    console.info(`[SafetyCompliance] ${formatted}`);
  }
}

/**
 * Log full settlement artifact for AI Event-Driven Layer (05).
 * Per 05_AIEventDrivenLayer.md — persists complete artifact for transparency and dispute resolution.
 */
export function logSettlementArtifact(
  artifact: SettlementArtifact,
  runtime?: Runtime
): void {
  const formatted = JSON.stringify({
    type: "SETTLEMENT_ARTIFACT",
    marketId: artifact.marketId,
    question: artifact.question,
    outcomeIndex: artifact.outcomeIndex,
    confidence: artifact.confidence,
    timestamp: artifact.timestamp ?? Math.floor(Date.now() / 1000),
    modelsUsed: artifact.modelsUsed,
    sourcesUsed: artifact.sourcesUsed,
    resolutionMode: artifact.resolutionMode,
    reasoning: artifact.reasoning,
    reviewRequired: artifact.reviewRequired,
    txHash: artifact.txHash,
  });
  if (runtime) {
    runtime.log(`[Audit] ${formatted}`);
  }
  if (typeof console !== "undefined" && console.info) {
    console.info(`[SafetyCompliance] ${formatted}`);
  }
}
