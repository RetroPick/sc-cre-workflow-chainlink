/**
 * Publish-from-draft handler. Receives draftId, creator, DraftPublishParams, and claimerSig,
 * encodes 0x04 report, and delivers to CREPublishReceiver via Chainlink Forwarder.
 *
 * Flow: CREPublishReceiver.onReport → validates EIP-712 signature → MarketFactory.createFromDraft
 *
 * Prerequisites: Draft must be Claimed (claimAndSeed), creator must match claimer.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import { cre, bytesToHex, hexToBase64, TxStatus, getNetwork } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "../../types/config";
import {
  encodePublishReport,
  type DraftPublishParams,
} from "../../contracts/reportFormats";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface PublishFromDraftInput {
  draftId: `0x${string}`;
  creator: `0x${string}`;
  params: DraftPublishParams;
  claimerSig: `0x${string}`;
}

export function publishFromDraft(
  runtime: Runtime<WorkflowConfig>,
  input: PublishFromDraftInput
): string {
  const crePublishReceiverAddress =
    runtime.config.curatedPath?.crePublishReceiverAddress ??
    runtime.config.crePublishReceiverAddress;

  if (
    !crePublishReceiverAddress ||
    crePublishReceiverAddress.toLowerCase() === ZERO_ADDRESS
  ) {
    runtime.log(
      "[PublishFromDraft] Missing crePublishReceiverAddress (curatedPath.crePublishReceiverAddress or crePublishReceiverAddress)."
    );
    return "Missing crePublishReceiverAddress";
  }

  const evmConfig = runtime.config.evms[0];
  if (!evmConfig) {
    runtime.log("[PublishFromDraft] No evms config.");
    return "No evms config";
  }

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: evmConfig.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Unknown chain: ${evmConfig.chainSelectorName}`);
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

  const reportData = encodePublishReport(
    input.draftId,
    input.creator,
    input.params,
    input.claimerSig
  );

  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(reportData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: crePublishReceiverAddress,
      report: reportResponse,
      gasConfig: { gasLimit: evmConfig.gasLimit },
    })
    .result();

  if (writeResult.txStatus === TxStatus.SUCCESS) {
    const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
    runtime.log(`[PublishFromDraft] Published draft ${input.draftId}: ${txHash}`);
    return txHash;
  }

  throw new Error(`Publish failed: ${writeResult.txStatus}`);
}
