/**
 * Enforcement application for Risk Monitoring & Compliance Enforcement Layer.
 * Per 06_RiskMonitoringComplienceEnforcementLayer.md §10.
 * v1: NoopApplier logs only; onchain/admin calls added later.
 */
import type { EnforcementApplier } from "./riskCron";

/**
 * No-op enforcement applier for v1.
 * Logs the intended action; does not call onchain admin or external endpoints.
 */
export const NoopEnforcementApplier: EnforcementApplier = {
  async apply(args) {
    if (typeof console !== "undefined" && console.info) {
      console.info(
        `[RiskMonitoring] NoopEnforcementApplier: would apply ${args.action.type} for market ${args.snapshot.marketId}`,
        args.action.reasons
      );
    }
  },
};
