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
    // Schedule mode: require either marketIds non-empty or useRelayerMarkets true
    if (config.resolution.mode === "schedule" || config.resolution.mode === "both") {
      const hasMarketIds =
        config.resolution.marketIds && config.resolution.marketIds.length > 0;
      const useRelayerMarkets = config.resolution.useRelayerMarkets === true;
      if (!hasMarketIds && !useRelayerMarkets) {
        throw new Error(
          "resolution.mode includes 'schedule' but neither marketIds nor useRelayerMarkets is set. Set resolution.marketIds to a non-empty array or resolution.useRelayerMarkets to true"
        );
      }
    }

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

  // Feeds require marketFactoryAddress and creatorAddress for scheduleTrigger (fail fast instead of silent no-op)
  const feeds = config.feeds;
  if (feeds && feeds.length > 0) {
    const hasFactory =
      config.marketFactoryAddress &&
      config.marketFactoryAddress !== "" &&
      config.marketFactoryAddress !== ZERO_ADDRESS;
    if (!hasFactory) {
      throw new Error(
        "feeds is non-empty but marketFactoryAddress is not set. Set marketFactoryAddress to the deployed MarketFactory for feed-driven creation, or remove feeds"
      );
    }
    const hasCreator =
      config.creatorAddress && config.creatorAddress !== ZERO_ADDRESS;
    if (!hasCreator) {
      throw new Error(
        "feeds is non-empty but creatorAddress is not set. Set creatorAddress for feed-driven market creation"
      );
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
