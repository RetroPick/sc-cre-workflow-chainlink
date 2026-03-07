/**
 * Compliance audit record for Risk Monitoring & Compliance Enforcement Layer.
 * Per 06_RiskMonitoringComplienceEnforcementLayer.md §12.
 */
export type ComplianceAuditEventType =
  | "RISK_CHECK"
  | "ALERT"
  | "PAUSE"
  | "DELIST"
  | "BLOCK_NEW_TRADES"
  | "REVIEW_REQUIRED"
  | "SETTLEMENT_REPORT"
  | "POLICY_UPDATE";

export type ComplianceAuditTrigger = "CRON" | "HTTP" | "EVENT";

export type ComplianceAuditRecord = {
  recordId: string;
  marketId?: string;
  eventType: ComplianceAuditEventType;
  triggeredBy: ComplianceAuditTrigger;
  reasons: string[];
  metrics?: Record<string, string | number | boolean>;
  actionTaken: string;
  createdAt: number;
};
