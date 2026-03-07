/**
 * Private counterpart to event-driven settlement for PRIVATE_INPUT markets.
 * Per 07_PrivacyPreservingExtensions.md §9.
 */
import type { ControlledRelease } from "../../domain/controlledRelease";
import { applyControlledRelease } from "./controlledRelease";

export type PrivateSettlementArgs = {
  marketId: string;
  resolutionPlanHash: string;
  inputRef: string;
};

export interface ConfidentialSettlementProvider {
  computeSettlement(args: PrivateSettlementArgs): Promise<ControlledRelease>;
}

export class MockConfidentialSettlementProvider
  implements ConfidentialSettlementProvider
{
  async computeSettlement(args: PrivateSettlementArgs): Promise<ControlledRelease> {
    const rawOutput = {
      outcomeIndex: 0,
      confidenceBps: 9500,
    };

    return applyControlledRelease({
      policy: "SETTLEMENT_ONLY",
      rawOutput,
      privateReferenceId: `settle:${args.marketId}`,
      outputHash: "0xmocksettlement",
    });
  }
}
