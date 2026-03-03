import { encodeAbiParameters, parseAbiParameters } from "viem";

/** CREReceiver outcome report params: (address market, uint256 marketId, uint8 outcomeIndex, uint16 confidence). No 0x01 prefix - SettlementRouter adds it. */
const OUTCOME_REPORT_PARAMS = parseAbiParameters(
  "address market, uint256 marketId, uint8 outcomeIndex, uint16 confidence"
);

/**
 * Encode outcome report for CREReceiver.submitResult path.
 * CREReceiver decodes and calls oracleCoordinator.submitResult(market, marketId, outcomeIndex, confidence).
 */
export function encodeOutcomeReport(
  market: `0x${string}`,
  marketId: bigint,
  outcomeIndex: number,
  confidence: number
): `0x${string}` {
  return encodeAbiParameters(OUTCOME_REPORT_PARAMS, [
    market,
    marketId,
    outcomeIndex,
    confidence,
  ]) as `0x${string}`;
}

/** DraftPublishParams for CREPublishReceiver createFromDraft. marketType: 0=binary, 1=categorical, 2=timeline */
export interface DraftPublishParams {
  question: string;
  marketType: number;
  outcomes: string[];
  timelineWindows: number[];
  resolveTime: number;
  tradingOpen: number;
  tradingClose: number;
}

/** CREPublishReceiver report params: (bytes32 draftId, address creator, DraftPublishParams params, bytes claimerSig). Prefix 0x04 is added by encodePublishReport. */
const PUBLISH_REPORT_PARAMS = parseAbiParameters(
  "bytes32 draftId, address creator, (string question, uint8 marketType, string[] outcomes, uint48[] timelineWindows, uint48 resolveTime, uint48 tradingOpen, uint48 tradingClose) params, bytes claimerSig"
);

/**
 * Encode publish-from-draft report for CREPublishReceiver.
 * Format: 0x04 || abi.encode(draftId, creator, params, claimerSig)
 * CREPublishReceiver validates EIP-712 PublishFromDraft signature and calls MarketFactory.createFromDraft.
 */
export function encodePublishReport(
  draftId: `0x${string}`,
  creator: `0x${string}`,
  params: DraftPublishParams,
  claimerSig: `0x${string}`
): `0x${string}` {
  const tuple: [string, number, string[], number[], number, number, number] = [
    params.question,
    params.marketType,
    params.outcomes,
    params.timelineWindows.map((t) => t),
    params.resolveTime,
    params.tradingOpen,
    params.tradingClose,
  ];
  const payload = encodeAbiParameters(PUBLISH_REPORT_PARAMS, [
    draftId,
    creator,
    tuple,
    claimerSig,
  ]);
  return (`0x04${payload.slice(2)}` as `0x${string}`);
}
