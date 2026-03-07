/**
 * Privacy-preserving allow/deny decisions for compliance-gated markets.
 * Per 07_PrivacyPreservingExtensions.md §7.
 */
import type { EligibilityDecision } from "../../domain/eligibility";

export type EligibilityCheckArgs = {
  wallet: string;
  marketId: string;
  policyProfile: string;
};

export interface EligibilityProvider {
  checkEligibility(args: EligibilityCheckArgs): Promise<EligibilityDecision>;
}

export class MockEligibilityProvider implements EligibilityProvider {
  async checkEligibility(args: EligibilityCheckArgs): Promise<EligibilityDecision> {
    if (!args.wallet.startsWith("0x")) {
      return {
        allowed: false,
        reasonCode: "PROVIDER_ERROR",
      };
    }

    return {
      allowed: true,
      reasonCode: "OK",
      disclosedFields: {
        eligible: true,
      },
      privateReferenceId: `elig:${args.marketId}:${args.wallet}`,
    };
  }
}
