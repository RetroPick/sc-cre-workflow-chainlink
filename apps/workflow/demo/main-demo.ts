/**
 * Demo CRE workflow entry point.
 * Registers only HTTP (proposal + publish) and EVM log (settlement) handlers.
 * Uses mock services only — no LLM, no external APIs.
 */
import { cre, Runner, getNetwork } from "@chainlink/cre-sdk";
import { keccak256, toHex } from "viem";
import type { WorkflowConfig } from "../src/types/config";
import { onDemoHttpTrigger } from "./demoHttpCallback";
import { onDemoLogTrigger } from "./demoLogTrigger";

const SETTLEMENT_REQUESTED_SIGNATURE = "SettlementRequested(uint256,string)";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function validateDemoConfig(config: WorkflowConfig): void {
  if (!config.evms || config.evms.length === 0) {
    throw new Error("Config must have at least one evms entry");
  }
}

function initDemoWorkflow(config: WorkflowConfig) {
  validateDemoConfig(config);

  const httpCapability = new cre.capabilities.HTTPCapability();
  const httpTrigger = httpCapability.trigger({});

  const handlers: ReturnType<typeof cre.handler>[] = [cre.handler(httpTrigger, onDemoHttpTrigger)];

  const evm = config.evms[0];
  const hasMarketAddress = evm.marketAddress && evm.marketAddress !== ZERO_ADDRESS;

  if (hasMarketAddress) {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.evms[0].chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Network not found: ${config.evms[0].chainSelectorName}`);
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const eventHash = keccak256(toHex(SETTLEMENT_REQUESTED_SIGNATURE));
  handlers.push(
    cre.handler(
      evmClient.logTrigger({
        addresses: [config.evms[0].marketAddress],
        topics: [{ values: [eventHash] }],
        confidence: "CONFIDENCE_LEVEL_FINALIZED",
      }),
      onDemoLogTrigger
    )
  );

  return handlers;
}

export async function main() {
  const runner = await Runner.newRunner<WorkflowConfig>();
  await runner.run(initDemoWorkflow);
}

main();
