/**
 * MarketDraftBoard contract client for proposeDraft.
 * Used by draftProposer to propose drafts from Polymarket events.
 * Requires AI_ORACLE_ROLE on MarketDraftBoard for the signer.
 */
import { keccak256, toHex, encodeAbiParameters, parseAbiParameters } from "viem";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Hash, Hex } from "viem";

const DRAFT_BOARD_ABI = [
  {
    type: "function",
    name: "proposeDraft",
    inputs: [
      { name: "questionHash", type: "bytes32", internalType: "bytes32" },
      { name: "questionUri_", type: "string", internalType: "string" },
      { name: "marketType_", type: "uint8", internalType: "enum MarketDraftBoard.MarketType" },
      { name: "outcomesHash", type: "bytes32", internalType: "bytes32" },
      { name: "outcomesUri_", type: "string", internalType: "string" },
      { name: "resolveSpecHash_", type: "bytes32", internalType: "bytes32" },
      { name: "tradingOpen_", type: "uint48", internalType: "uint48" },
      { name: "tradingClose_", type: "uint48", internalType: "uint48" },
      { name: "resolveTime_", type: "uint48", internalType: "uint48" },
      { name: "settlementAsset_", type: "address", internalType: "address" },
      { name: "minSeed_", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "draftId", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "nonpayable",
  },
] as const;

/** MarketType: Binary=0, Categorical=1, Timeline=2 */
const MARKET_TYPE_BINARY = 0;

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface ProposeDraftParams {
  question: string;
  questionUri: string;
  outcomes: string[];
  outcomesUri: string;
  resolveTime: number;
  tradingOpen: number;
  tradingClose: number;
  settlementAsset?: Hex;
  minSeed?: bigint;
}

export function computeQuestionHash(question: string): Hex {
  return keccak256(toHex(question));
}

export function computeOutcomesHash(outcomes: string[]): Hex {
  const params = parseAbiParameters("string[]");
  return keccak256(encodeAbiParameters(params, [outcomes]));
}

/**
 * Propose a draft to MarketDraftBoard. Requires AI_ORACLE_ROLE for signer.
 */
export async function proposeDraft(
  params: ProposeDraftParams & {
    draftBoardAddress: Hex;
    rpcUrl: string;
    privateKey: Hex;
    chainId: number;
  }
): Promise<Hash> {
  const { draftBoardAddress, rpcUrl, privateKey, chainId } = params;

  const chainConfig = getChainConfig(chainId);
  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({
    chain: chainConfig as any,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    chain: chainConfig as any,
    transport: http(rpcUrl),
    account,
  });

  const questionHash = computeQuestionHash(params.question);
  const outcomesHash = computeOutcomesHash(params.outcomes);
  const settlementAsset = params.settlementAsset ?? (ZERO_ADDRESS as Hex);
  const minSeed = params.minSeed ?? 0n;

  const hash = await walletClient.writeContract({
    address: draftBoardAddress,
    abi: DRAFT_BOARD_ABI,
    functionName: "proposeDraft",
    args: [
      questionHash,
      params.questionUri,
      MARKET_TYPE_BINARY,
      outcomesHash,
      params.outcomesUri,
      ZERO_HASH, // resolveSpecHash - use zero for simple binary
      BigInt(params.tradingOpen),
      BigInt(params.tradingClose),
      BigInt(params.resolveTime),
      settlementAsset,
      minSeed,
    ],
  });

  return hash;
}

function getChainConfig(chainId: number) {
  switch (chainId) {
    case 43113:
      return {
        id: 43113,
        name: "Avalanche Fuji",
        nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
        rpcUrls: { default: { http: ["https://api.avax-test.network/ext/bc/C/rpc"] } },
      };
    case 11155111:
      return {
        id: 11155111,
        name: "Sepolia",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: ["https://ethereum-sepolia-rpc.publicnode.com"] } },
      };
    default:
      return {
        id: chainId,
        name: "Custom",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [] } },
      };
  }
}
