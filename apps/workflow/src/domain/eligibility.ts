/**
 * Eligibility decision types for privacy-preserving compliance gating.
 * Per 07_PrivacyPreservingExtensions.md §5.
 */
export type EligibilityDecision = {
  allowed: boolean;
  reasonCode:
    | "OK"
    | "KYC_REQUIRED"
    | "JURISDICTION_BLOCKED"
    | "ACCOUNT_RESTRICTED"
    | "NOT_IN_ALLOWLIST"
    | "PROVIDER_ERROR";
  disclosedFields?: Record<string, string | boolean>;
  privateReferenceId?: string;
};
