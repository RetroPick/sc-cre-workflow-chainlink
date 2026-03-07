/**
 * Controlled data release — policy boundary for private workflows.
 * Per 07_PrivacyPreservingExtensions.md §8.
 * Ensures only safe public outputs are released from confidential steps.
 */
import type { ControlledRelease } from "../../domain/controlledRelease";

export type DisclosurePolicy =
  | "MINIMAL_DISCLOSURE"
  | "ALLOW_DENY_ONLY"
  | "SETTLEMENT_ONLY"
  | "HASH_ONLY";

export function applyControlledRelease(args: {
  policy: DisclosurePolicy;
  rawOutput: Record<string, unknown>;
  privateReferenceId?: string;
  outputHash?: string;
}): ControlledRelease {
  let publicOutput: Record<string, string | number | boolean> = {};

  switch (args.policy) {
    case "ALLOW_DENY_ONLY":
      if (typeof args.rawOutput.allowed === "boolean") {
        publicOutput.allowed = args.rawOutput.allowed;
      }
      if (typeof args.rawOutput.reasonCode === "string") {
        publicOutput.reasonCode = args.rawOutput.reasonCode;
      }
      break;

    case "SETTLEMENT_ONLY":
      if (typeof args.rawOutput.outcomeIndex === "number") {
        publicOutput.outcomeIndex = args.rawOutput.outcomeIndex;
      }
      if (typeof args.rawOutput.confidenceBps === "number") {
        publicOutput.confidenceBps = args.rawOutput.confidenceBps;
      }
      break;

    case "HASH_ONLY":
      if (args.outputHash) {
        publicOutput.outputHash = args.outputHash;
      }
      break;

    case "MINIMAL_DISCLOSURE":
    default:
      for (const [k, v] of Object.entries(args.rawOutput)) {
        if (
          typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean"
        ) {
          publicOutput[k] = v;
        }
      }
      break;
  }

  return {
    publicOutput,
    privateReferenceId: args.privateReferenceId,
    outputHash: args.outputHash,
    disclosurePolicy: args.policy,
  };
}
