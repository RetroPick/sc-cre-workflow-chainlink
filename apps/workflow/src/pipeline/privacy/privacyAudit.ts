/**
 * Privacy audit helpers and reporter for confidential workflow traceability.
 * Per 07_PrivacyPreservingExtensions.md §15.
 */
import crypto from "crypto";
import type { Runtime } from "@chainlink/cre-sdk";
import type { PrivacyAuditRecord } from "../../domain/privacyAudit";

export interface PrivacyAuditReporter {
  record(entry: PrivacyAuditRecord): Promise<void>;
}

/**
 * Create a privacy audit record with a deterministic recordId.
 */
export function makePrivacyAuditRecord(args: {
  marketId?: string;
  workflowType: PrivacyAuditRecord["workflowType"];
  privacyProfile: string;
  providerType: string;
  actionTaken: string;
  disclosedOutput?: Record<string, string | number | boolean>;
  privateReferenceId?: string;
}): PrivacyAuditRecord {
  const createdAt = Math.floor(Date.now() / 1000);
  const recordId = crypto
    .createHash("sha256")
    .update(
      `${args.marketId ?? ""}:${args.workflowType}:${createdAt}:${args.actionTaken}`
    )
    .digest("hex");

  return {
    recordId,
    marketId: args.marketId,
    workflowType: args.workflowType,
    privacyProfile: args.privacyProfile,
    providerType: args.providerType,
    actionTaken: args.actionTaken,
    disclosedOutput: args.disclosedOutput,
    privateReferenceId: args.privateReferenceId,
    createdAt,
  };
}

/**
 * Log privacy audit record to runtime and console. Does not expose raw sensitive payloads.
 */
export function logPrivacyAudit(
  record: PrivacyAuditRecord,
  runtime?: Runtime
): void {
  const formatted = JSON.stringify({
    type: "PRIVACY_AUDIT",
    recordId: record.recordId,
    marketId: record.marketId,
    workflowType: record.workflowType,
    privacyProfile: record.privacyProfile,
    providerType: record.providerType,
    actionTaken: record.actionTaken,
    disclosedOutput: record.disclosedOutput,
    privateReferenceId: record.privateReferenceId,
    timestamp: record.createdAt,
  });
  if (runtime) {
    runtime.log(`[Audit] ${formatted}`);
  }
  if (typeof console !== "undefined" && console.info) {
    console.info(`[PrivacyAudit] ${formatted}`);
  }
}
