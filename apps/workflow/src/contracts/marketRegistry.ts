/**
 * MarketRegistry contract client for V3 schedule-based resolution.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import { cre, bytesToHex, encodeCallMsg } from "@chainlink/cre-sdk";
import { encodeFunctionData, decodeFunctionResult, zeroAddress } from "viem";

export type MarketRegistryStatus = 0 | 1 | 2 | 3; // Draft, Open, Frozen, Resolved

export interface MarketRegistryMarket {
  creator: string;
  createdAt: bigint;
  expiry: bigint;
  tradingOpen: bigint;
  tradingClose: bigint;
  resolveTime: bigint;
  settledAt: bigint;
  settled: boolean;
  frozen: boolean;
  confidence: number;
  outcome: number; // 0 = Yes, 1 = No
  question: string;
}

export type MarketType = 0 | 1 | 2; // Binary=0, Categorical=1, Timeline=2

const MARKET_REGISTRY_ABI = [
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
          { name: "expiry", type: "uint48" },
          { name: "tradingOpen", type: "uint48" },
          { name: "tradingClose", type: "uint48" },
          { name: "resolveTime", type: "uint48" },
          { name: "settledAt", type: "uint48" },
          { name: "settled", type: "bool" },
          { name: "frozen", type: "bool" },
          { name: "confidence", type: "uint16" },
          { name: "outcome", type: "uint8" },
          { name: "question", type: "string" },
        ],
      },
    ],
  },
  {
    name: "status",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

export function readMarket(
  runtime: Runtime,
  evmClient: { callContract: (runtime: unknown, opts: unknown) => unknown },
  marketRegistryAddress: string,
  marketId: bigint
): MarketRegistryMarket {
  const callData = encodeFunctionData({
    abi: MARKET_REGISTRY_ABI,
    functionName: "getMarket",
    args: [marketId],
  });

  const readResult = (evmClient as { callContract: (r: unknown, o: unknown) => { result: () => { data: Uint8Array } } })
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: marketRegistryAddress as `0x${string}`,
        data: callData,
      }),
    })
    .result();

  const market = decodeFunctionResult({
    abi: MARKET_REGISTRY_ABI,
    functionName: "getMarket",
    data: bytesToHex(readResult.data),
  }) as MarketRegistryMarket;

  return market;
}

export function readStatus(
  runtime: Runtime,
  evmClient: { callContract: (runtime: unknown, opts: unknown) => unknown },
  marketRegistryAddress: string,
  marketId: bigint
): MarketRegistryStatus {
  const callData = encodeFunctionData({
    abi: MARKET_REGISTRY_ABI,
    functionName: "status",
    args: [marketId],
  });

  const readResult = (evmClient as { callContract: (r: unknown, o: unknown) => { result: () => { data: Uint8Array } } })
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: marketRegistryAddress as `0x${string}`,
        data: callData,
      }),
    })
    .result();

  const status = decodeFunctionResult({
    abi: MARKET_REGISTRY_ABI,
    functionName: "status",
    data: bytesToHex(readResult.data),
  }) as MarketRegistryStatus;

  return status;
}

/** Status enum: Draft=0, Open=1, Frozen=2, Resolved=3 */
export const MarketRegistryStatusEnum = {
  Draft: 0,
  Open: 1,
  Frozen: 2,
  Resolved: 3,
} as const;

/** MarketType enum: Binary=0, Categorical=1, Timeline=2 */
export const MarketTypeEnum = {
  Binary: 0,
  Categorical: 1,
  Timeline: 2,
} as const;

function contractCall(
  runtime: Runtime,
  evmClient: { callContract: (runtime: unknown, opts: unknown) => unknown },
  marketRegistryAddress: string,
  callData: `0x${string}`
): Uint8Array {
  const readResult = (evmClient as { callContract: (r: unknown, o: unknown) => { result: () => { data: Uint8Array } } })
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: marketRegistryAddress as `0x${string}`,
        data: callData,
      }),
    })
    .result();
  return readResult.data;
}

export function readMarketType(
  runtime: Runtime,
  evmClient: { callContract: (runtime: unknown, opts: unknown) => unknown },
  marketRegistryAddress: string,
  marketId: bigint
): MarketType {
  const callData = encodeFunctionData({
    abi: MARKET_REGISTRY_ABI,
    functionName: "marketType",
    args: [marketId],
  });
  const data = contractCall(runtime, evmClient, marketRegistryAddress, callData);
  const result = decodeFunctionResult({
    abi: MARKET_REGISTRY_ABI,
    functionName: "marketType",
    data: bytesToHex(data),
  }) as number;
  return result as MarketType;
}

export function readCategoricalOutcomes(
  runtime: Runtime,
  evmClient: { callContract: (runtime: unknown, opts: unknown) => unknown },
  marketRegistryAddress: string,
  marketId: bigint
): string[] {
  const callData = encodeFunctionData({
    abi: MARKET_REGISTRY_ABI,
    functionName: "getCategoricalOutcomes",
    args: [marketId],
  });
  const data = contractCall(runtime, evmClient, marketRegistryAddress, callData);
  return decodeFunctionResult({
    abi: MARKET_REGISTRY_ABI,
    functionName: "getCategoricalOutcomes",
    data: bytesToHex(data),
  }) as string[];
}

export function readTimelineWindows(
  runtime: Runtime,
  evmClient: { callContract: (runtime: unknown, opts: unknown) => unknown },
  marketRegistryAddress: string,
  marketId: bigint
): bigint[] {
  const callData = encodeFunctionData({
    abi: MARKET_REGISTRY_ABI,
    functionName: "getTimelineWindows",
    args: [marketId],
  });
  const data = contractCall(runtime, evmClient, marketRegistryAddress, callData);
  return decodeFunctionResult({
    abi: MARKET_REGISTRY_ABI,
    functionName: "getTimelineWindows",
    data: bytesToHex(data),
  }) as bigint[];
}
