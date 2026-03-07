/**
 * Tests for Risk Monitoring & Compliance Enforcement Layer.
 * Per 06_RiskMonitoringComplienceEnforcementLayer.md §11.
 *
 * Case A: healthy market → NO_ACTION
 * Case B: medium spike → ALERT
 * Case C: stale source near resolution → REVIEW_REQUIRED
 * Case D: suspicious late trading + concentration → PAUSE_MARKET
 * Case E: blacklist hit → DELIST_MARKET
 */
import { describe, test, expect } from "bun:test";
import { runRiskCron } from "../src/pipeline/monitoring/riskCron";
import {
  MockMarketMetricsProvider,
  createMockSnapshotPreset,
} from "../src/pipeline/monitoring/mockProvider";
import { InMemoryComplianceReporter } from "../src/pipeline/monitoring/reporting";
import { NoopEnforcementApplier } from "../src/pipeline/monitoring/applyEnforcement";

describe("Risk Monitoring — policy cases", () => {
  test("Case A: healthy market → NO_ACTION", async () => {
    const snapshot = createMockSnapshotPreset("healthy", "1");
    const provider = new MockMarketMetricsProvider([snapshot]);
    const reporter = new InMemoryComplianceReporter();

    const result = await runRiskCron({
      provider,
      reporter,
      applier: NoopEnforcementApplier,
    });

    expect(result.scanned).toBe(1);
    expect(result.actions).toBe(0);

    const record = reporter.records[0];
    expect(record).toBeDefined();
    expect(record.eventType).toBe("RISK_CHECK");
    expect(record.actionTaken).toBe("NO_ACTION");
  });

  test("Case B: medium spike → ALERT", async () => {
    const snapshot = createMockSnapshotPreset("mediumSpike", "2");
    const provider = new MockMarketMetricsProvider([snapshot]);
    const reporter = new InMemoryComplianceReporter();

    const result = await runRiskCron({
      provider,
      reporter,
      applier: NoopEnforcementApplier,
    });

    expect(result.scanned).toBe(1);
    expect(result.actions).toBe(1);

    const record = reporter.records[0];
    expect(record).toBeDefined();
    expect(record.eventType).toBe("ALERT");
    expect(record.actionTaken).toBe("ALERT");
  });

  test("Case C: stale source near resolution → REVIEW_REQUIRED", async () => {
    const snapshot = createMockSnapshotPreset("staleSource", "3");
    const provider = new MockMarketMetricsProvider([snapshot]);
    const reporter = new InMemoryComplianceReporter();

    const result = await runRiskCron({
      provider,
      reporter,
      applier: NoopEnforcementApplier,
    });

    expect(result.scanned).toBe(1);
    expect(result.actions).toBe(1);

    const record = reporter.records[0];
    expect(record).toBeDefined();
    expect(record.eventType).toBe("REVIEW_REQUIRED");
    expect(record.actionTaken).toBe("REVIEW_REQUIRED");
  });

  test("Case D: suspicious late trading + concentration → PAUSE_MARKET", async () => {
    const snapshot = createMockSnapshotPreset("lateTradingConcentration", "4");
    const provider = new MockMarketMetricsProvider([snapshot]);
    const reporter = new InMemoryComplianceReporter();

    const result = await runRiskCron({
      provider,
      reporter,
      applier: NoopEnforcementApplier,
    });

    expect(result.scanned).toBe(1);
    expect(result.actions).toBe(1);

    const record = reporter.records[0];
    expect(record).toBeDefined();
    expect(record.eventType).toBe("PAUSE");
    expect(record.actionTaken).toBe("PAUSE_MARKET");
  });

  test("Case E: blacklist hit → DELIST_MARKET", async () => {
    const snapshot = createMockSnapshotPreset("blacklist", "5");
    const provider = new MockMarketMetricsProvider([snapshot]);
    const reporter = new InMemoryComplianceReporter();

    const result = await runRiskCron({
      provider,
      reporter,
      applier: NoopEnforcementApplier,
    });

    expect(result.scanned).toBe(1);
    expect(result.actions).toBe(1);

    const record = reporter.records[0];
    expect(record).toBeDefined();
    expect(record.eventType).toBe("DELIST");
    expect(record.actionTaken).toBe("DELIST_MARKET");
  });

  test("multiple markets scanned, only non-NO_ACTION counted as actions", async () => {
    const snapshots = [
      createMockSnapshotPreset("healthy", "1"),
      createMockSnapshotPreset("mediumSpike", "2"),
      createMockSnapshotPreset("healthy", "3"),
    ];
    const provider = new MockMarketMetricsProvider(snapshots);
    const reporter = new InMemoryComplianceReporter();

    const result = await runRiskCron({
      provider,
      reporter,
      applier: NoopEnforcementApplier,
    });

    expect(result.scanned).toBe(3);
    expect(result.actions).toBe(1);
    expect(reporter.records).toHaveLength(3);
  });
});
