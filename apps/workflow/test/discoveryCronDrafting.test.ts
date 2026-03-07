/**
 * Discovery Cron drafting pipeline tests.
 * Covers early-exit paths and drafting pipeline integration per plan §7 Test E.
 */
import { describe, test, expect } from "bun:test";
import { onDiscoveryCron } from "../pipeline/orchestration/discoveryCron";

function mockRuntime(overrides: Record<string, unknown> = {}) {
  return {
    config: {
      creatorAddress: "0xbeaA395506D02d20749d8E39ddb996ACe1C85Bfc" as `0x${string}`,
      feeds: [{ id: "test", type: "coinGecko" as const, category: "crypto", mock: true }],
      evms: [{ chainSelectorName: "ethereum-testnet-sepolia", gasLimit: "500000" }],
      orchestration: { enabled: true, draftingPipeline: true },
      ...overrides,
    },
    log: () => {},
    ...overrides,
  } as any;
}

describe("Discovery Cron Drafting Pipeline", () => {
  test("returns No feeds when feeds config is empty", async () => {
    const runtime = mockRuntime({ config: { feeds: [], creatorAddress: "0x123" } });
    const result = await onDiscoveryCron(runtime);
    expect(result).toBe("No feeds");
  });

  test("returns Missing creatorAddress when creatorAddress not set", async () => {
    const runtime = mockRuntime({
      config: {
        feeds: [{ id: "test", type: "coinGecko", category: "crypto", mock: true }],
        creatorAddress: undefined,
        evms: [{ chainSelectorName: "ethereum-testnet-sepolia", gasLimit: "500000" }],
        orchestration: { enabled: true, draftingPipeline: true },
      },
    });
    const result = await onDiscoveryCron(runtime);
    expect(result).toBe("Missing creatorAddress");
  });
});
