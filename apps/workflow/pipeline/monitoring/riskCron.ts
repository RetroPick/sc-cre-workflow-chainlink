/**
 * Risk monitoring cron handler for Risk Monitoring & Compliance Enforcement Layer.
 * Per 06_RiskMonitoringComplienceEnforcementLayer.md §7.
 */
import crypto from "node:crypto";
import { collectAllMarketSnapshots, type MarketMetricsProvider } from "./collectMetrics";
import { computeSignals } from "./computeSignals";
import { enforcePolicy } from "./enforcePolicy";
import type { ComplianceAuditRecord } from "../../domain/complianceAudit";
import type { EnforcementAction } from "../../domain/enforcement";
import type { LiveMarketSnapshot } from "../../domain/monitoring";

export interface EnforcementApplier {
  apply(args: {
    snapshot: LiveMarketSnapshot;
    action: EnforcementAction;
  }): Promise<void>;
}

export interface ComplianceReporter {
  record(entry: ComplianceAuditRecord): Promise<void>;
}

function makeRecordId(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function toAuditRecord(args: {
  snapshot: LiveMarketSnapshot;
  action: EnforcementAction;
  signals: ReturnType<typeof computeSignals>;
}): ComplianceAuditRecord {
  const now = Math.floor(Date.now() / 1000);

  return {
    recordId: makeRecordId(
      `${args.snapshot.marketId}:${args.action.type}:${now}`
    ),
    marketId: args.snapshot.marketId,
    eventType:
      args.action.type === "NO_ACTION"
        ? "RISK_CHECK"
        : args.action.type === "ALERT"
          ? "ALERT"
          : args.action.type === "PAUSE_MARKET"
            ? "PAUSE"
            : args.action.type === "DELIST_MARKET"
              ? "DELIST"
              : args.action.type === "BLOCK_NEW_TRADES"
                ? "BLOCK_NEW_TRADES"
                : "REVIEW_REQUIRED",
    triggeredBy: "CRON",
    reasons: args.action.reasons,
    metrics: {
      overallRisk: args.signals.overallRisk,
      volumeSpikeScore: args.signals.volumeSpikeScore,
      concentrationScore: args.signals.concentrationScore,
      lateTradingSpikeScore: args.signals.lateTradingSpikeScore,
      staleSourceRisk: args.signals.staleSourceRisk,
      policyViolationRisk: args.signals.policyViolationRisk,
      legalSensitivityRisk: args.signals.legalSensitivityRisk,
    },
    actionTaken: args.action.type,
    createdAt: now,
  };
}

export async function runRiskCron(args: {
  provider: MarketMetricsProvider;
  reporter: ComplianceReporter;
  applier?: EnforcementApplier;
}): Promise<{
  scanned: number;
  actions: number;
}> {
  const snapshots = await collectAllMarketSnapshots(args.provider);

  let actions = 0;

  for (const snapshot of snapshots) {
    const signals = computeSignals(snapshot);
    const action = enforcePolicy({ snapshot, signals });

    const audit = toAuditRecord({ snapshot, action, signals });
    await args.reporter.record(audit);

    if (action.type !== "NO_ACTION" && args.applier) {
      await args.applier.apply({ snapshot, action });
      actions += 1;
    }
  }

  return {
    scanned: snapshots.length,
    actions,
  };
}
