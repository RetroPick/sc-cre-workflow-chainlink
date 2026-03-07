/**
 * HTTP Callback direct create (non-orchestration) tests.
 * Verifies that direct create path returns JSON with ok and message.
 * Uses mock.module to stub createMarkets since it depends on CRE SDK.
 */
import { describe, test, expect, mock } from "bun:test";

mock.module("../src/pipeline/creation/marketCreator", () => ({
  createMarkets: () => "Created 1 markets",
}));

const { onHttpTrigger } = await import("../src/httpCallback");

function mockRuntime(overrides: Record<string, unknown> = {}) {
  return {
    config: {
      creatorAddress: "0xbeaA395506D02d20749d8E39ddb996ACe1C85Bfc" as `0x${string}`,
      evms: [{ chainSelectorName: "ethereum-testnet-sepolia", gasLimit: "500000" }],
      orchestration: { enabled: false },
      marketFactoryAddress: "0x1234567890123456789012345678901234567890",
      ...overrides,
    },
    log: () => {},
    ...overrides,
  } as any;
}

function httpPayload(input: unknown) {
  const str = typeof input === "string" ? input : JSON.stringify(input);
  return {
    input: new TextEncoder().encode(str),
  } as any;
}

describe("HTTP Callback Direct Create", () => {
  test("returns JSON with ok and message for non-orchestration create", async () => {
    const runtime = mockRuntime();
    const payload = httpPayload({
      question: "Will BTC hit 100k?",
      requestedBy: "0xbeaA395506D02d20749d8E39ddb996ACe1C85Bfc",
    });
    const result = await onHttpTrigger(runtime, payload);
    const parsed = JSON.parse(result);
    expect(parsed.ok).toBe(true);
    expect(parsed.message).toContain("Created");
  });
});
