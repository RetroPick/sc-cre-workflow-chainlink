/**
 * Compliance reporting for Risk Monitoring & Compliance Enforcement Layer.
 * Per 06_RiskMonitoringComplienceEnforcementLayer.md §12.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import type { ComplianceAuditRecord } from "../../domain/complianceAudit";
import type { ComplianceReporter } from "./riskCron";

/**
 * In-memory compliance reporter for tests.
 * Stores records for assertion; implements ComplianceReporter.
 */
export class InMemoryComplianceReporter implements ComplianceReporter {
  readonly records: ComplianceAuditRecord[] = [];

  async record(entry: ComplianceAuditRecord): Promise<void> {
    this.records.push(entry);
  }

  clear(): void {
    this.records.length = 0;
  }
}

/**
 * Creates a compliance reporter that logs to runtime and/or console.
 * Aligned with pipeline/audit/auditLogger.ts pattern.
 */
export function createConsoleComplianceReporter(
  runtime?: Runtime
): ComplianceReporter {
  return {
    async record(entry: ComplianceAuditRecord): Promise<void> {
      const formatted = JSON.stringify({
        type: "COMPLIANCE_AUDIT",
        ...entry,
      });
      if (runtime) {
        runtime.log(`[Audit] ${formatted}`);
      }
      if (typeof console !== "undefined" && console.info) {
        console.info(`[RiskMonitoring] ${formatted}`);
      }
    },
  };
}
