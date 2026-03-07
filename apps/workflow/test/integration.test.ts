import { generateMarketInput } from "../src/builders/generateMarket";
import { validateFeedItem, validateMarketInput } from "../src/builders/schemaValidator";
import type { FeedItem } from "../src/types/feed";
import { encodeOutcomeReport, encodePublishReport, type DraftPublishParams } from "../src/contracts/reportFormats";
import { computeParamsHash } from "../src/contracts/publishFromDraft";
import { validateWorkflowConfig, shouldRegisterLogTrigger, shouldRegisterScheduleResolver } from "../src/config/schema";
import type { WorkflowConfig } from "../src/types/config";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runIntegrationTest() {
  const feedItem: FeedItem = {
    feedId: "demo",
    question: "Will BTC be above 50000 USD tomorrow?",
    category: "crypto",
    resolveTime: Math.floor(Date.now() / 1000) + 3600,
    sourceUrl: "mock",
    externalId: "demo:btc",
  };

  validateFeedItem(feedItem);
  const marketInput = generateMarketInput(
    feedItem,
    "0xbeaA395506D02d20749d8E39ddb996ACe1C85Bfc"
  );
  validateMarketInput(marketInput);

  assert(marketInput.question.length > 0, "Question not set");

  // Report encoding
  const report = encodeOutcomeReport(
    "0x0000000000000000000000000000000000000001" as `0x${string}`,
    1n,
    0,
    9000
  );
  assert(report.startsWith("0x"), "Outcome report must be hex");
  assert(report.length > 10, "Outcome report must have encoded data");

  // Publish report encoding
  const params: DraftPublishParams = {
    question: "Will X happen?",
    marketType: 0,
    outcomes: ["Yes", "No"],
    timelineWindows: [],
    resolveTime: Math.floor(Date.now() / 1000) + 86400,
    tradingOpen: 0,
    tradingClose: Math.floor(Date.now() / 1000) + 86400,
  };
  const paramsHash = computeParamsHash(params);
  assert(paramsHash.startsWith("0x"), "Params hash must be hex");
  assert(paramsHash.length === 66, "Params hash must be 32 bytes (66 chars with 0x)");

  const publishReport = encodePublishReport(
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`,
    "0x0000000000000000000000000000000000000001" as `0x${string}`,
    params,
    "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" as `0x${string}`
  );
  assert(publishReport.startsWith("0x04"), "Publish report must have 0x04 prefix");
  assert(publishReport.length > 10, "Publish report must have encoded data");

  // Config schema
  const logConfig: WorkflowConfig = {
    relayerUrl: "https://backend-relayer-production.up.railway.app",
    evms: [
      {
        marketAddress: "0x0000000000000000000000000000000000000001",
        chainSelectorName: "ethereum-testnet-sepolia",
        gasLimit: "500000",
      },
    ],
    resolution: { mode: "log" },
  };
  assert(shouldRegisterLogTrigger(logConfig), "Log trigger should be enabled");
  assert(!shouldRegisterScheduleResolver(logConfig), "Schedule resolver should be disabled");

  const scheduleConfig: WorkflowConfig = {
    relayerUrl: "https://backend-relayer-production.up.railway.app",
    evms: [
      {
        marketAddress: "0x0000000000000000000000000000000000000000",
        marketRegistryAddress: "0x0000000000000000000000000000000000000002",
        chainSelectorName: "ethereum-testnet-sepolia",
        gasLimit: "500000",
      },
    ],
    resolution: { mode: "schedule", marketIds: [0, 1] },
  };
  assert(!shouldRegisterLogTrigger(scheduleConfig), "Log trigger should be disabled with zero marketAddress");
  assert(shouldRegisterScheduleResolver(scheduleConfig), "Schedule resolver should be enabled");

  const scheduleWithRelayerConfig: WorkflowConfig = {
    relayerUrl: "https://backend-relayer-production.up.railway.app",
    evms: [
      {
        marketAddress: "0x0000000000000000000000000000000000000000",
        marketRegistryAddress: "0x0000000000000000000000000000000000000002",
        chainSelectorName: "ethereum-testnet-sepolia",
        gasLimit: "500000",
      },
    ],
    resolution: { mode: "schedule", useRelayerMarkets: true },
  };
  validateWorkflowConfig(scheduleWithRelayerConfig);

  // Feeds validation: with feeds, marketFactoryAddress and creatorAddress required
  const feedsConfigNoFactory: WorkflowConfig = {
    relayerUrl: "https://backend-relayer-production.up.railway.app",
    feeds: [{ id: "x", type: "custom", url: "https://example.com", category: "test" }],
    evms: [
      {
        marketAddress: "0x0000000000000000000000000000000000000001",
        chainSelectorName: "ethereum-testnet-sepolia",
        gasLimit: "500000",
      },
    ],
  };
  try {
    validateWorkflowConfig(feedsConfigNoFactory);
    throw new Error("Expected validation to fail for feeds without marketFactoryAddress");
  } catch (e) {
    assert(
      String(e).includes("marketFactoryAddress"),
      "Should fail with marketFactoryAddress error"
    );
  }

  validateWorkflowConfig(logConfig);
  validateWorkflowConfig(scheduleConfig);
}
