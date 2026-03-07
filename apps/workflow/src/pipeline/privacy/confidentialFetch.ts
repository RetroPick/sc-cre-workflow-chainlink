/**
 * Confidential HTTP-style source access for protected-source markets.
 * Per 07_PrivacyPreservingExtensions.md §7.
 */
import type { ControlledRelease } from "../../domain/controlledRelease";
import type { PrivacyProfile } from "../../domain/privacy";

export type ConfidentialFetchArgs = {
  marketId?: string;
  queryType: string;
  parameters: Record<string, string | number | boolean>;
  privacyProfile: "PROTECTED_SOURCE" | "PRIVATE_INPUT" | "COMPLIANCE_GATED";
};

export interface ConfidentialEvidenceProvider {
  fetchConfidential(args: ConfidentialFetchArgs): Promise<ControlledRelease>;
}

export class MockConfidentialEvidenceProvider
  implements ConfidentialEvidenceProvider
{
  async fetchConfidential(args: ConfidentialFetchArgs): Promise<ControlledRelease> {
    return {
      publicOutput: {
        status: "ok",
        queryType: args.queryType,
      },
      privateReferenceId: `privref:${Date.now()}`,
      outputHash: "0xmock",
      disclosurePolicy: "MINIMAL_DISCLOSURE",
    };
  }
}
