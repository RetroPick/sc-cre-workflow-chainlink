import { encodeAbiParameters, parseAbiParameters } from "viem";

export type SessionPayloadInput = {
  marketId: bigint;
  sessionId: `0x${string}`;
  participants: `0x${string}`[];
  balances: bigint[];
  signatures: `0x${string}`[];
  backendSignature: `0x${string}`;
};

const SESSION_PAYLOAD_PARAMS = parseAbiParameters(
  "uint256 marketId, bytes32 sessionId, address[] participants, uint256[] balances, bytes[] signatures, bytes backendSignature"
);

export function buildFinalStateRequest(input: SessionPayloadInput): `0x${string}` {
  const encoded = encodeAbiParameters(SESSION_PAYLOAD_PARAMS, [
    input.marketId,
    input.sessionId,
    input.participants,
    input.balances,
    input.signatures,
    input.backendSignature,
  ]);

  // Prefix 0x03 to route to session finalization.
  return ("0x03" + encoded.slice(2)) as `0x${string}`;
}
