/**
 * Default privacy providers for backward compatibility.
 * Returns mock implementations when no real provider is configured.
 */
import { MockConfidentialEvidenceProvider } from "./confidentialFetch";
import { MockEligibilityProvider } from "./eligibilityCheck";
import { MockConfidentialSettlementProvider } from "./privateSettlement";
import type { ConfidentialEvidenceProvider } from "./confidentialFetch";
import type { EligibilityProvider } from "./eligibilityCheck";
import type { ConfidentialSettlementProvider } from "./privateSettlement";

let defaultConfidentialEvidence: ConfidentialEvidenceProvider | undefined;
let defaultEligibility: EligibilityProvider | undefined;
let defaultConfidentialSettlement: ConfidentialSettlementProvider | undefined;

export function getDefaultConfidentialEvidenceProvider(): ConfidentialEvidenceProvider {
  if (!defaultConfidentialEvidence) {
    defaultConfidentialEvidence = new MockConfidentialEvidenceProvider();
  }
  return defaultConfidentialEvidence;
}

export function getDefaultEligibilityProvider(): EligibilityProvider {
  if (!defaultEligibility) {
    defaultEligibility = new MockEligibilityProvider();
  }
  return defaultEligibility;
}

export function getDefaultConfidentialSettlementProvider(): ConfidentialSettlementProvider {
  if (!defaultConfidentialSettlement) {
    defaultConfidentialSettlement = new MockConfidentialSettlementProvider();
  }
  return defaultConfidentialSettlement;
}
