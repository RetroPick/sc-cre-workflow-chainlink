/**
 * E2E test harness for workflow CRE integration.
 * Validates workflow structure, handler registration, and contract integration.
 *
 * To run full E2E against Anvil:
 * 1. Start Anvil: anvil
 * 2. Deploy contracts: cd packages/contracts && forge script script/DeployAnvilRelayerTest.s.sol
 * 3. Set RPC_URL, CREReceiver, ChannelSettlement, etc. in config
 * 4. cre workflow simulate ./apps/workflow --target=staging-settings
 */
import { describe, test, expect } from "bun:test";
import { runIntegrationTest } from "../integration.test";
import { encodeOutcomeReport } from "../../contracts/reportFormats";
import { decodeAbiParameters, parseAbiParameters } from "viem";

describe("Workflow CRE Integration", () => {
  test("integration test passes", () => {
    runIntegrationTest();
  });

  test("encodeOutcomeReport produces valid ABI-encodable payload", () => {
    const market = "0x1111111111111111111111111111111111111111" as `0x${string}`;
    const marketId = 42n;
    const outcomeIndex = 0;
    const confidence = 9000;

    const encoded = encodeOutcomeReport(market, marketId, outcomeIndex, confidence);
    expect(encoded).toMatch(/^0x[a-fA-F0-9]+$/);

    const decoded = decodeAbiParameters(
      parseAbiParameters("address market, uint256 marketId, uint8 outcomeIndex, uint16 confidence"),
      encoded
    );
    expect(decoded[0].toLowerCase()).toBe(market.toLowerCase());
    expect(decoded[1]).toBe(marketId);
    expect(decoded[2]).toBe(outcomeIndex);
    expect(decoded[3]).toBe(confidence);
  });
});
