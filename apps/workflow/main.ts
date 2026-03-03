// prediction-market/my-workflow/main.ts

import { cre, Runner, getNetwork } from "@chainlink/cre-sdk";
import { keccak256, toHex } from "viem";
import { onHttpTrigger } from "./httpCallback";
import { onLogTrigger } from "./pipeline/resolution/logTrigger";
import { onScheduleResolver } from "./pipeline/resolution/scheduleResolver";
import { onScheduleTrigger } from "./pipeline/creation/scheduleTrigger";
import { onDraftProposer } from "./pipeline/creation/draftProposer";
import { onSessionSnapshot } from "./jobs/sessionSnapshot";
import { onCheckpointSubmit } from "./pipeline/checkpoint/checkpointSubmit";
import { onCheckpointFinalize } from "./pipeline/checkpoint/checkpointFinalize";
import { onCheckpointCancel } from "./pipeline/checkpoint/checkpointCancel";
import type { WorkflowConfig } from "./types/config";
import { validateWorkflowConfig, shouldRegisterLogTrigger, shouldRegisterScheduleResolver } from "./config/schema";

const SETTLEMENT_REQUESTED_SIGNATURE = "SettlementRequested(uint256,string)";

const initWorkflow = (config: WorkflowConfig) => {
  validateWorkflowConfig(config);
  const httpCapability = new cre.capabilities.HTTPCapability();
  const httpTrigger = httpCapability.trigger({});
  const cronCapability = new cre.capabilities.CronCapability();
  const cronTrigger = cronCapability.trigger({
    schedule: config.cronSchedule || "*/15 * * * *",
  });
  const cronFinalize = cronCapability.trigger({
    schedule: config.cronScheduleFinalize || config.cronSchedule || "*/15 * * * *",
  });
  const cronCancel = cronCapability.trigger({
    schedule: config.cronScheduleCancel || "0 0 */8 * * *",
  });

  const handlers = [
    cre.handler(cronTrigger, onScheduleTrigger),
    cre.handler(cronTrigger, onDraftProposer),
    cre.handler(cronTrigger, onSessionSnapshot),
    cre.handler(cronTrigger, onCheckpointSubmit),
    cre.handler(cronFinalize, onCheckpointFinalize),
    cre.handler(cronCancel, onCheckpointCancel),
    cre.handler(httpTrigger, onHttpTrigger),
  ];

  if (shouldRegisterLogTrigger(config)) {
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
        onLogTrigger
      )
    );
  }

  if (shouldRegisterScheduleResolver(config)) {
    handlers.push(cre.handler(cronTrigger, onScheduleResolver));
  }

  return handlers;
};

export async function main() {
  const runner = await Runner.newRunner<WorkflowConfig>();
  await runner.run(initWorkflow);
}

main();
