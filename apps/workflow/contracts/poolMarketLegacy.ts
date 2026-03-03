/**
 * PoolMarketLegacy contract client for log-trigger resolution.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import { bytesToHex, encodeCallMsg } from "@chainlink/cre-sdk";
import { encodeFunctionData, decodeFunctionResult, zeroAddress } from "viem";

export interface PoolMarketLegacyMarket {
  creator: string;
  createdAt: bigint;
  settledAt: bigint;
  settled: boolean;
  confidence: number;
  outcome: number; // 0 = YES, 1 = NO
  totalYesPool: bigint;
  totalNoPool: bigint;
  question: string;
}

const POOL_MARKET_ABI = [
  {
    name: "marketType",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "getCategoricalOutcomes",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "string[]" }],
  },
  {
    name: "getTimelineWindows",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "uint48[]" }],
  },
  {
    name: "getMarket",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "createdAt", type: "uint48" },
          { name: "settledAt", type: "uint48" },
          { name: "settled", type: "bool" },
          { name: "confidence", type: "uint16" },
          { name: "outcome", type: "uint8" },
          { name: "totalYesPool", type: "uint256" },
          { name: "totalNoPool", type: "uint256" },
          { name: "question", type: "string" },
        ],
      },
    ],
  },
] as const;

function contractCall(
  runtime: Runtime,
  evmClient: { callContract: (runtime: unknown, opts: unknown) => unknown },
  marketAddress: string,
  callData: `0x${string}`
): Uint8Array {
  const readResult = (evmClient as { callContract: (r: unknown, o: unknown) => { result: () => { data: Uint8Array } } })
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: marketAddress as `0x${string}`,
        data: callData,
      }),
    })
    .result();
  return readResult.data;
}

export function readMarket(
  runtime: Runtime,
  evmClient: { callContract: (runtime: unknown, opts: unknown) => unknown },
  marketAddress: string,
  marketId: bigint
): PoolMarketLegacyMarket {
  const callData = encodeFunctionData({
    abi: POOL_MARKET_ABI,
    functionName: "getMarket",
    args: [marketId],
  });
  const data = contractCall(runtime, evmClient, marketAddress, callData);
  return decodeFunctionResult({
    abi: POOL_MARKET_ABI,
    functionName: "getMarket",
    data: bytesToHex(data),
  }) as PoolMarketLegacyMarket;
}

export type PoolMarketType = 0 | 1 | 2;

export function readMarketType(
  runtime: Runtime,
  evmClient: { callContract: (runtime: unknown, opts: unknown) => unknown },
  marketAddress: string,
  marketId: bigint
): PoolMarketType {
  const callData = encodeFunctionData({
    abi: POOL_MARKET_ABI,
    functionName: "marketType",
    args: [marketId],
  });
  const data = contractCall(runtime, evmClient, marketAddress, callData);
  return decodeFunctionResult({
    abi: POOL_MARKET_ABI,
    functionName: "marketType",
    data: bytesToHex(data),
  }) as PoolMarketType;
}

export function readCategoricalOutcomes(
  runtime: Runtime,
  evmClient: { callContract: (runtime: unknown, opts: unknown) => unknown },
  marketAddress: string,
  marketId: bigint
): string[] {
  const callData = encodeFunctionData({
    abi: POOL_MARKET_ABI,
    functionName: "getCategoricalOutcomes",
    args: [marketId],
  });
  const data = contractCall(runtime, evmClient, marketAddress, callData);
  return decodeFunctionResult({
    abi: POOL_MARKET_ABI,
    functionName: "getCategoricalOutcomes",
    data: bytesToHex(data),
  }) as string[];
}

export function readTimelineWindows(
  runtime: Runtime,
  evmClient: { callContract: (runtime: unknown, opts: unknown) => unknown },
  marketAddress: string,
  marketId: bigint
): bigint[] {
  const callData = encodeFunctionData({
    abi: POOL_MARKET_ABI,
    functionName: "getTimelineWindows",
    args: [marketId],
  });
  const data = contractCall(runtime, evmClient, marketAddress, callData);
  return decodeFunctionResult({
    abi: POOL_MARKET_ABI,
    functionName: "getTimelineWindows",
    data: bytesToHex(data),
  }) as bigint[];
}
