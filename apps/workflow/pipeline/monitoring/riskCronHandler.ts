/**
 * CRE cron handler for Risk Monitoring & Compliance Enforcement Layer.
 * Per 06_RiskMonitoringComplienceEnforcementLayer.md.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import { cre, getNetwork } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "../../types/config";
import { runRiskCron } from "./riskCron";
import { createOnchainMarketMetricsProvider, resolveMonitoringMarketIds } from "./onchainProvider";
import { createConsoleComplianceReporter } from "./reporting";
import { NoopEnforcementApplier } from "./applyEnforcement";
import { shouldRegisterRiskCron } from "../../config/schema";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function onRiskCron(runtime: Runtime<WorkflowConfig>): Promise<string> {
  if (!shouldRegisterRiskCron(runtime.config)) {
    runtime.log("[RiskMonitoring] Not enabled (monitoring.enabled or marketRegistryAddress).");
    return "Risk monitoring not enabled";
  }

  const evm = runtime.config.evms[0];
  const marketRegistryAddress = evm.marketRegistryAddress;
  if (!marketRegistryAddress || marketRegistryAddress === ZERO_ADDRESS) {
    runtime.log("[RiskMonitoring] marketRegistryAddress not set.");
    return "marketRegistryAddress not set";
  }

  const marketIds = resolveMonitoringMarketIds(runtime);
  if (marketIds.length === 0) {
    runtime.log("[RiskMonitoring] No marketIds (config or relayer).");
    return "No marketIds";
  }

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: evm.chainSelectorName,
    isTestnet: true,
  });
  if (!network) {
    throw new Error(`Unknown chain: ${evm.chainSelectorName}`);
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const provider = createOnchainMarketMetricsProvider(
    runtime,
    evmClient,
    marketRegistryAddress,
    marketIds
  );
  const reporter = createConsoleComplianceReporter(runtime);

  const result = await runRiskCron({
    provider,
    reporter,
    applier: NoopEnforcementApplier,
  });

  runtime.log(`[RiskMonitoring] Scanned ${result.scanned} markets, took ${result.actions} actions.`);
  return `Scanned ${result.scanned}, actions ${result.actions}`;
}
