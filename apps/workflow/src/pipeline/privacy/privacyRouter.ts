/**
 * Privacy router — dispatches to public vs confidential providers based on privacyProfile.
 * Per 07_PrivacyPreservingExtensions.md.
 */
import type { PrivacyProfile } from "../../domain/privacy";

export function requiresConfidentialFetch(profile: PrivacyProfile): boolean {
  return profile === "PROTECTED_SOURCE" || profile === "PRIVATE_INPUT";
}

export function requiresEligibilityCheck(profile: PrivacyProfile): boolean {
  return profile === "COMPLIANCE_GATED";
}

export function requiresPrivateSettlement(profile: PrivacyProfile): boolean {
  return profile === "PRIVATE_INPUT";
}
