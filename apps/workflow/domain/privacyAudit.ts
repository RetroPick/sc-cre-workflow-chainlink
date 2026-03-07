/**
 * Privacy audit record types for confidential workflow traceability.
 * Per 07_PrivacyPreservingExtensions.md §15.
 */
export type PrivacyAuditRecord = {
  recordId: string;
  marketId?: string;
  workflowType:
    | "CONFIDENTIAL_FETCH"
    | "ELIGIBILITY_CHECK"
    | "PRIVATE_SETTLEMENT"
    | "CONTROLLED_RELEASE";
  privacyProfile: string;
  providerType: string;
  actionTaken: string;
  disclosedOutput?: Record<string, string | number | boolean>;
  privateReferenceId?: string;
  createdAt: number;
};
