/**
 * Controlled release types for privacy-preserving workflows.
 * Per 07_PrivacyPreservingExtensions.md §9.
 */
export type ControlledRelease = {
  publicOutput: Record<string, string | number | boolean>;
  privateReferenceId?: string;
  outputHash?: string;
  disclosurePolicy: string;
};
