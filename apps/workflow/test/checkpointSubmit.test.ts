/**
 * Checkpoint submit tests.
 * Mocks relayer HTTP responses; asserts early exits and payload validation.
 * Per docs/CheckpointFlow.md and docs/RelayerIntegration.md.
 */
import { describe, test, expect, mock } from "bun:test";

let mockHttpHandler: (
  runtime: unknown,
  request: { url: string; method?: string }
) => { statusCode: number; bodyText: string } = () => {
  throw new Error("mockHttpHandler not set");
};

mock.module("../src/utils/http", () => ({
  httpJsonRequest: (runtime: unknown, request: { url: string; method?: string }) => {
    return mockHttpHandler(runtime, request);
  },
}));

const { onCheckpointSubmit } = await import("../src/pipeline/checkpoint/checkpointSubmit");

function mockRuntime(configOverrides: Record<string, unknown> = {}) {
  const defaultConfig = {
    relayerUrl: "https://relayer.example.com",
    creReceiverAddress: "0x1234567890123456789012345678901234567890",
    evms: [{ chainSelectorName: "ethereum-testnet-sepolia", gasLimit: "500000" }],
  };
  return {
    config: { ...defaultConfig, ...configOverrides },
    log: () => {},
    report: () => ({ result: () => ({}) }),
  } as any;
}

describe("Checkpoint Submit", () => {
  test("returns Missing relayerUrl when not configured", () => {
    const runtime = mockRuntime({ relayerUrl: undefined });
    const result = onCheckpointSubmit(runtime);
    expect(result).toBe("Missing relayerUrl");
  });

  test("returns Missing creReceiverAddress when not configured", () => {
    const runtime = mockRuntime({
      creReceiverAddress: "0x0000000000000000000000000000000000000000",
    });
    const result = onCheckpointSubmit(runtime);
    expect(result).toBe("Missing creReceiverAddress");
  });

  test("returns Relayer unhealthy when health check returns ok: false", () => {
    mockHttpHandler = (_, req) => {
      if (req.url.endsWith("/health")) {
        return { statusCode: 200, bodyText: JSON.stringify({ ok: false }) };
      }
      throw new Error(`Unmocked: ${req.url}`);
    };
    const runtime = mockRuntime();
    const result = onCheckpointSubmit(runtime);
    expect(result).toBe("Relayer unhealthy");
  });

  test("returns No sessions with deltas when list is empty", () => {
    mockHttpHandler = (_, req) => {
      if (req.url.endsWith("/health")) {
        return { statusCode: 200, bodyText: JSON.stringify({ ok: true }) };
      }
      if (req.url.includes("/cre/checkpoints") && !req.url.includes("/sigs") && req.method !== "POST") {
        return { statusCode: 200, bodyText: JSON.stringify({ checkpoints: [] }) };
      }
      throw new Error(`Unmocked: ${req.method} ${req.url}`);
    };
    const runtime = mockRuntime();
    const result = onCheckpointSubmit(runtime);
    expect(result).toBe("No sessions with deltas");
  });

  test("skips session when payload does not start with 0x03", () => {
    mockHttpHandler = (_, req) => {
      if (req.url.endsWith("/health")) {
        return { statusCode: 200, bodyText: JSON.stringify({ ok: true }) };
      }
      if (req.url.includes("/cre/checkpoints") && !req.url.includes("/sigs")) {
        if (req.method === "GET") {
          return {
            statusCode: 200,
            bodyText: JSON.stringify({
              checkpoints: [{ sessionId: "s1", marketId: "m1", hasDeltas: true }],
            }),
          };
        }
        if (req.method === "POST") {
          return {
            statusCode: 200,
            bodyText: JSON.stringify({ payload: "0x99invalid", format: "ChannelSettlement" }),
          };
        }
      }
      if (req.url.includes("/sigs")) {
        return { statusCode: 404, bodyText: "{}" };
      }
      throw new Error(`Unmocked: ${req.method} ${req.url}`);
    };
    const runtime = mockRuntime();
    const result = onCheckpointSubmit(runtime);
    expect(result).toBe("Submitted 0 checkpoints");
  });
});
