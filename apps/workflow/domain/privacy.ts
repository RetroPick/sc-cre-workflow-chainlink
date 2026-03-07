/**
 * Privacy profile types for CRE Orchestration Layer.
 * Per 07_PrivacyPreservingExtensions.md §10.
 */
export type PrivacyProfile =
  | "PUBLIC"
  | "PROTECTED_SOURCE"
  | "PRIVATE_INPUT"
  | "COMPLIANCE_GATED";
