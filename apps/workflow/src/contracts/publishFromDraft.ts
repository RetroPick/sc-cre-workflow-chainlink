/**
 * EIP-712 helpers for PublishFromDraft. Used by frontend/creator tooling to compute
 * paramsHash and typed data for signing before calling the publish HTTP endpoint.
 *
 * Domain: CREPublishReceiver, 1
 * Type: PublishFromDraft(bytes32 draftId, bytes32 paramsHash, uint256 chainId, uint256 nonce)
 */
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import type { DraftPublishParams } from "./reportFormats";

const PARAMS_ENCODE = parseAbiParameters(
  "string question, uint8 marketType, bytes32 outcomesHash, bytes32 timelineHash, uint48 resolveTime, uint48 tradingOpen, uint48 tradingClose"
);

const EIP712_DOMAIN = {
  name: "CREPublishReceiver",
  version: "1",
  chainId: 0, // set at runtime
} as const;

const PUBLISH_FROM_DRAFT_TYPE = {
  PublishFromDraft: [
    { name: "draftId", type: "bytes32" },
    { name: "paramsHash", type: "bytes32" },
    { name: "chainId", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

/**
 * Compute paramsHash for PublishFromDraft. Must match CREPublishReceiver validation.
 * paramsHash = keccak256(abi.encode(question, marketType, keccak256(outcomes), keccak256(timelineWindows), resolveTime, tradingOpen, tradingClose))
 */
export function computeParamsHash(params: DraftPublishParams): `0x${string}` {
  const outcomesHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters("string[]"),
      [params.outcomes]
    ) as `0x${string}`
  );
  const timelineHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters("uint48[]"),
      [params.timelineWindows.map((t) => BigInt(t))]
    ) as `0x${string}`
  );

  const encoded = encodeAbiParameters(PARAMS_ENCODE, [
    params.question,
    params.marketType,
    outcomesHash,
    timelineHash,
    BigInt(params.resolveTime),
    BigInt(params.tradingOpen),
    BigInt(params.tradingClose),
  ]);

  return keccak256(encoded as `0x${string}`);
}

/**
 * Get EIP-712 typed data for PublishFromDraft. Use with signTypedData (viem/wagmi).
 * Creator must sign this; nonce should be read from CREPublishReceiver.publishNonces(creator).
 */
export function getPublishFromDraftTypedData(
  draftId: `0x${string}`,
  paramsHash: `0x${string}`,
  chainId: number,
  nonce: bigint
) {
  return {
    domain: {
      ...EIP712_DOMAIN,
      chainId,
    },
    types: PUBLISH_FROM_DRAFT_TYPE,
    primaryType: "PublishFromDraft" as const,
    message: {
      draftId,
      paramsHash,
      chainId: BigInt(chainId),
      nonce,
    },
  };
}
