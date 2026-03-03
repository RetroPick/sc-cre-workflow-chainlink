import type { WorkflowConfig, ResolutionMode } from "../types/config";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const VALID_RESOLUTION_MODES: ResolutionMode[] = ["log", "schedule", "both"];

export function validateWorkflowConfig(config: WorkflowConfig): void {
  if (!config.evms || config.evms.length === 0) {
    throw new Error("Config must have at least one evms entry");
  }

  // Checkpoint jobs (submit, finalize, cancel) always run and require relayerUrl
  const relayerUrl = config.relayerUrl?.replace(/\/$/, "");
  if (!relayerUrl || relayerUrl.length < 10) {
    throw new Error(
      "relayerUrl is required for checkpoint jobs (submit/finalize/cancel). Set to relayer base URL, e.g. https://backend-relayer-production.up.railway.app"
    );
  }

  const evm = config.evms[0];

  // resolution.mode validation
  if (config.resolution?.mode) {
    if (!VALID_RESOLUTION_MODES.includes(config.resolution.mode)) {
      throw new Error(
        `Invalid resolution.mode: ${config.resolution.mode}. Must be one of: ${VALID_RESOLUTION_MODES.join(", ")}`
      );
    }

    if (
      (config.resolution.mode === "schedule" || config.resolution.mode === "both") &&
      (!evm.marketRegistryAddress || evm.marketRegistryAddress === ZERO_ADDRESS)
    ) {
      throw new Error(
        "resolution.mode includes 'schedule' but marketRegistryAddress is not set or is zero"
      );
    }
    // marketIds can be empty; schedule resolver will no-op

    if (
      (config.resolution.mode === "log" || config.resolution.mode === "both") &&
      (!evm.marketAddress || evm.marketAddress === ZERO_ADDRESS)
    ) {
      throw new Error(
        "resolution.mode includes 'log' but marketAddress is not set or is zero"
      );
    }
  }

  // curatedPath validation
  if (config.curatedPath?.enabled) {
    if (config.curatedPath.crePublishReceiverAddress && !config.curatedPath.draftBoardAddress) {
      throw new Error("curatedPath.enabled with crePublishReceiverAddress requires draftBoardAddress");
    }
  }
}

export function resolveMode(config: WorkflowConfig): ResolutionMode {
  return config.resolution?.mode ?? "log";
}

export function shouldRegisterLogTrigger(config: WorkflowConfig): boolean {
  const mode = resolveMode(config);
  const evm = config.evms?.[0];
  return (
    (mode === "log" || mode === "both") &&
    !!evm?.marketAddress &&
    evm.marketAddress !== ZERO_ADDRESS
  );
}

export function shouldRegisterScheduleResolver(config: WorkflowConfig): boolean {
  const mode = resolveMode(config);
  const evm = config.evms?.[0];
  return (
    (mode === "schedule" || mode === "both") &&
    !!evm?.marketRegistryAddress &&
    evm.marketRegistryAddress !== ZERO_ADDRESS
  );
}
