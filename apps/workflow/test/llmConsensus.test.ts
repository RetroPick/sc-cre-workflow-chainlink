/**
 * Tests for multi-LLM consensus engine.
 * Per 05_AIEventDrivenLayer.md — unanimous and majority consensus rules.
 */
import { describe, test, expect } from "bun:test";
import { runLLMConsensus } from "../pipeline/resolution/llmConsensus";
import type { LlmProvider } from "../models/interfaces";

const mockRuntime = {
  config: {},
  log: () => {},
} as any;

function createMockLlmProvider(outcomeIndex: number, confidence: number): LlmProvider {
  return {
    async completeJson() {
      return {
        status: "RESOLVED",
        selectedOutcomeIndex: outcomeIndex,
        confidence,
        justification: ["Test"],
        sourceEvidence: ["https://example.com"],
      };
    },
  };
}

function createMockLlmProviderEscalate(): LlmProvider {
  return {
    async completeJson() {
      return {
        status: "ESCALATE",
        confidence: 0,
        justification: [],
        sourceEvidence: [],
      };
    },
  };
}

describe("LLM Consensus", () => {
  test("single provider with RESOLVED returns result", async () => {
    const provider = createMockLlmProvider(1, 8000);
    const result = await runLLMConsensus(mockRuntime, {
      question: "Will BTC exceed 100k?",
      outcomes: ["Yes", "No"],
      resolutionPredicate: "Price at resolve",
      evidenceLinks: ["https://api.example.com"],
    }, {
      providers: [provider],
      consensusQuorum: 1,
      minConfidence: 7000,
    });
    expect(result).not.toBeNull();
    expect(result!.outcomeIndex).toBe(1);
    expect(result!.confidence).toBe(8000);
  });

  test("unanimous agreement returns result", async () => {
    const provider = createMockLlmProvider(0, 9000);
    const result = await runLLMConsensus(mockRuntime, {
      question: "Will ETH hit 5k?",
      outcomes: ["Yes", "No"],
      resolutionPredicate: "Price check",
      evidenceLinks: [],
    }, {
      providers: [provider, provider, provider],
      consensusQuorum: 2,
      minConfidence: 7000,
    });
    expect(result).not.toBeNull();
    expect(result!.outcomeIndex).toBe(0);
    expect(result!.confidence).toBe(9000);
  });

  test("majority agreement with quorum returns result", async () => {
    const yesProvider = createMockLlmProvider(1, 8500);
    const noProvider = createMockLlmProvider(0, 8000);
    const result = await runLLMConsensus(mockRuntime, {
      question: "Will BTC exceed 100k?",
      outcomes: ["Yes", "No"],
      resolutionPredicate: "Price at resolve",
      evidenceLinks: [],
    }, {
      providers: [yesProvider, yesProvider, noProvider],
      consensusQuorum: 2,
      minConfidence: 7000,
    });
    expect(result).not.toBeNull();
    expect(result!.outcomeIndex).toBe(1);
    expect(result!.confidence).toBe(8500);
  });

  test("below quorum returns null", async () => {
    const yesProvider = createMockLlmProvider(1, 9000);
    const noProvider = createMockLlmProvider(0, 9000);
    const result = await runLLMConsensus(mockRuntime, {
      question: "Will BTC exceed 100k?",
      outcomes: ["Yes", "No"],
      resolutionPredicate: "Price",
      evidenceLinks: [],
    }, {
      providers: [yesProvider, noProvider],
      consensusQuorum: 2,
      minConfidence: 7000,
    });
    expect(result).toBeNull();
  });

  test("below minConfidence returns null", async () => {
    const provider = createMockLlmProvider(1, 5000);
    const result = await runLLMConsensus(mockRuntime, {
      question: "Will BTC exceed 100k?",
      outcomes: ["Yes", "No"],
      resolutionPredicate: "Price",
      evidenceLinks: [],
    }, {
      providers: [provider, provider],
      consensusQuorum: 2,
      minConfidence: 7000,
    });
    expect(result).toBeNull();
  });

  test("all providers ESCALATE returns ESCALATE status", async () => {
    const provider = createMockLlmProviderEscalate();
    const result = await runLLMConsensus(mockRuntime, {
      question: "Will BTC exceed 100k?",
      outcomes: ["Yes", "No"],
      resolutionPredicate: "Price",
      evidenceLinks: [],
    }, {
      providers: [provider, provider],
      consensusQuorum: 2,
      minConfidence: 7000,
    });
    expect(result).not.toBeNull();
    expect(result).toEqual({ status: "ESCALATE", reason: "" });
  });

  test("invalid selectedOutcomeIndex is treated as non-RESOLVED", async () => {
    const invalidProvider: LlmProvider = {
      async completeJson() {
        return {
          status: "RESOLVED",
          selectedOutcomeIndex: 99,
          confidence: 9000,
          justification: [],
          sourceEvidence: [],
        };
      },
    };
    const validProvider = createMockLlmProvider(1, 9000);
    const result = await runLLMConsensus(mockRuntime, {
      question: "Will BTC exceed 100k?",
      outcomes: ["Yes", "No"],
      resolutionPredicate: "Price",
      evidenceLinks: [],
    }, {
      providers: [invalidProvider, validProvider],
      consensusQuorum: 2,
      minConfidence: 7000,
    });
    expect(result).toBeNull();
  });
});
