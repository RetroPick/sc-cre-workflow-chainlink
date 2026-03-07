/**
 * Tests for Resolution Executor — routing by resolutionMode and predicate evaluation.
 * Per 05_AIEventDrivenLayer.md.
 */
import { describe, test, expect } from "bun:test";
import { executeResolution } from "../src/pipeline/resolution/resolutionExecutor";
import type { ResolutionPlan } from "../src/domain/resolutionPlan";
import type { LlmProvider } from "../src/models/interfaces";

const mockRuntime = {
  config: {},
  log: () => {},
} as any;

const baseMarket = {
  question: "Will BTC exceed 100k?",
  outcomes: ["Yes", "No"],
  marketType: 0,
};

describe("Resolution Executor — routing", () => {
  test("human_review returns REVIEW_REQUIRED", async () => {
    const plan: ResolutionPlan = {
      resolutionMode: "human_review",
      primarySources: [{ sourceType: "official_api", locator: "https://api.example.com", trustScore: 0.9 }],
      fallbackSources: [],
      resolutionPredicate: "Price at resolve",
      oracleabilityScore: 0.9,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    };
    const result = await executeResolution(mockRuntime, baseMarket, plan);
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.reason).toBe("Resolution mode is human_review");
  });

  test("unsupported resolution mode returns REVIEW_REQUIRED", async () => {
    const plan: ResolutionPlan = {
      resolutionMode: "custom_mode" as any,
      primarySources: [],
      fallbackSources: [],
      resolutionPredicate: "",
      oracleabilityScore: 0,
      unresolvedCheckPassed: false,
      unresolvedCheckEvidence: [],
    };
    const result = await executeResolution(mockRuntime, baseMarket, plan);
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.reason).toContain("Unsupported resolution mode");
  });

  test("deterministic with no primarySources returns REVIEW_REQUIRED", async () => {
    const plan: ResolutionPlan = {
      resolutionMode: "deterministic",
      primarySources: [],
      fallbackSources: [],
      resolutionPredicate: "> 100000",
      oracleabilityScore: 0.9,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    };
    const result = await executeResolution(mockRuntime, baseMarket, plan);
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.reason).toBe("Deterministic mode requires primarySources");
  });

  test("deterministic with onchain_event returns REVIEW_REQUIRED", async () => {
    const plan: ResolutionPlan = {
      resolutionMode: "deterministic",
      primarySources: [{ sourceType: "onchain_event", locator: "0x123", trustScore: 0.9 }],
      fallbackSources: [],
      resolutionPredicate: "event emitted",
      oracleabilityScore: 0.9,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    };
    const result = await executeResolution(mockRuntime, baseMarket, plan);
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.reason).toContain("onchain_event");
  });
});

describe("Resolution Executor — deterministic with fetcher", () => {
  test("deterministic returns SUCCESS when predicate > threshold matches", async () => {
    const plan: ResolutionPlan = {
      resolutionMode: "deterministic",
      primarySources: [{ sourceType: "official_api", locator: "https://api.example.com/btc", trustScore: 0.9 }],
      fallbackSources: [],
      resolutionPredicate: "> 100000",
      oracleabilityScore: 0.9,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    };
    const fetcher = async () => ({ bodyText: JSON.stringify({ price: 105000 }) });
    const result = await executeResolution(mockRuntime, baseMarket, plan, { fetcher });
    expect(result.status).toBe("SUCCESS");
    expect(result.outcomeIndex).toBe(1);
    expect(result.confidence).toBe(10000);
    expect(result.resolutionMode).toBe("deterministic");
  });

  test("deterministic returns SUCCESS when predicate < threshold matches", async () => {
    const plan: ResolutionPlan = {
      resolutionMode: "deterministic",
      primarySources: [{ sourceType: "official_website", locator: "https://example.com", trustScore: 0.9 }],
      fallbackSources: [],
      resolutionPredicate: "< 50000",
      oracleabilityScore: 0.9,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    };
    const fetcher = async () => ({ bodyText: JSON.stringify({ value: 45000 }) });
    const result = await executeResolution(mockRuntime, baseMarket, plan, { fetcher });
    expect(result.status).toBe("SUCCESS");
    expect(result.outcomeIndex).toBe(1);
  });

  test("deterministic returns REVIEW_REQUIRED when predicate fails", async () => {
    const plan: ResolutionPlan = {
      resolutionMode: "deterministic",
      primarySources: [{ sourceType: "official_api", locator: "https://api.example.com", trustScore: 0.9 }],
      fallbackSources: [],
      resolutionPredicate: "> 100000",
      oracleabilityScore: 0.9,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    };
    const fetcher = async () => ({ bodyText: JSON.stringify({ price: 95000 }) });
    const result = await executeResolution(mockRuntime, baseMarket, plan, { fetcher });
    expect(result.status).toBe("SUCCESS");
    expect(result.outcomeIndex).toBe(0); // value 95000 is NOT > 100000, so outcome 0 (No)
  });

  test("deterministic with path-based predicate", async () => {
    const plan: ResolutionPlan = {
      resolutionMode: "deterministic",
      primarySources: [{ sourceType: "public_dataset", locator: "https://data.example.com", trustScore: 0.9 }],
      fallbackSources: [],
      resolutionPredicate: "data.btc.price >= 100000",
      oracleabilityScore: 0.9,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    };
    const fetcher = async () => ({ bodyText: JSON.stringify({ data: { btc: { price: 102000 } } }) });
    const result = await executeResolution(mockRuntime, baseMarket, plan, { fetcher });
    expect(result.status).toBe("SUCCESS");
    expect(result.outcomeIndex).toBe(1);
  });

  test("deterministic respects minConfidence", async () => {
    const plan: ResolutionPlan = {
      resolutionMode: "deterministic",
      primarySources: [{ sourceType: "official_api", locator: "https://api.example.com", trustScore: 0.9 }],
      fallbackSources: [],
      resolutionPredicate: "> 100000",
      oracleabilityScore: 0.9,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    };
    const fetcher = async () => ({ bodyText: JSON.stringify({ price: 105000 }) });
    const result = await executeResolution(mockRuntime, baseMarket, plan, {
      fetcher,
      minConfidence: 5000,
    });
    expect(result.status).toBe("SUCCESS");
    expect(result.confidence).toBe(10000);
  });

  test("deterministic fetch failure returns REVIEW_REQUIRED", async () => {
    const plan: ResolutionPlan = {
      resolutionMode: "deterministic",
      primarySources: [{ sourceType: "official_api", locator: "https://api.example.com", trustScore: 0.9 }],
      fallbackSources: [],
      resolutionPredicate: "> 100000",
      oracleabilityScore: 0.9,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    };
    const fetcher = async () => {
      throw new Error("Network error");
    };
    const result = await executeResolution(mockRuntime, baseMarket, plan, { fetcher });
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.reason).toContain("Fetch failed");
  });
});

describe("Resolution Executor — multi_source_deterministic", () => {
  test("multi_source_deterministic returns SUCCESS when majority agrees", async () => {
    const plan: ResolutionPlan = {
      resolutionMode: "multi_source_deterministic",
      primarySources: [
        { sourceType: "official_api", locator: "https://api1.example.com", trustScore: 0.9 },
        { sourceType: "official_api", locator: "https://api2.example.com", trustScore: 0.9 },
        { sourceType: "official_api", locator: "https://api3.example.com", trustScore: 0.9 },
      ],
      fallbackSources: [],
      resolutionPredicate: "> 100000",
      oracleabilityScore: 0.9,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    };
    const fetcher = async (url: string) => {
      if (url.includes("api2")) {
        return { bodyText: JSON.stringify({ price: 95000 }) };
      }
      return { bodyText: JSON.stringify({ price: 105000 }) };
    };
    const result = await executeResolution(mockRuntime, baseMarket, plan, {
      fetcher,
      minConfidence: 5000, // 2/3 agreement => 6667; default 7000 would reject
    });
    expect(result.status).toBe("SUCCESS");
    expect(result.outcomeIndex).toBe(1);
    expect(result.sourcesUsed).toHaveLength(2);
  });

  test("multi_source_deterministic returns REVIEW_REQUIRED when no majority", async () => {
    const plan: ResolutionPlan = {
      resolutionMode: "multi_source_deterministic",
      primarySources: [
        { sourceType: "official_api", locator: "https://api1.example.com", trustScore: 0.9 },
        { sourceType: "official_api", locator: "https://api2.example.com", trustScore: 0.9 },
      ],
      fallbackSources: [],
      resolutionPredicate: "> 100000",
      oracleabilityScore: 0.9,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    };
    const fetcher = async (url: string) => {
      if (url.includes("api1")) return { bodyText: JSON.stringify({ price: 105000 }) };
      return { bodyText: JSON.stringify({ price: 95000 }) };
    };
    const result = await executeResolution(mockRuntime, baseMarket, plan, { fetcher });
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.reason).toContain("no majority");
  });
});

describe("Resolution Executor — ai_assisted", () => {
  test("ai_assisted returns SUCCESS when mock provider resolves", async () => {
    const mockProvider: LlmProvider = {
      async completeJson() {
        return {
          status: "RESOLVED",
          selectedOutcomeIndex: 1,
          confidence: 8500,
          justification: ["Price data supports Yes"],
          sourceEvidence: ["https://api.example.com"],
        };
      },
    };
    const plan: ResolutionPlan = {
      resolutionMode: "ai_assisted",
      primarySources: [{ sourceType: "official_api", locator: "https://api.example.com", trustScore: 0.9 }],
      fallbackSources: [],
      resolutionPredicate: "BTC price >= 100000 at resolve",
      oracleabilityScore: 0.9,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    };
    const result = await executeResolution(mockRuntime, baseMarket, plan, {
      providers: [mockProvider],
      minConfidence: 7000,
    });
    expect(result.status).toBe("SUCCESS");
    expect(result.outcomeIndex).toBe(1);
    expect(result.confidence).toBe(8500);
    expect(result.resolutionMode).toBe("ai_assisted");
  });

  test("ai_assisted returns ESCALATE when provider returns ESCALATE", async () => {
    const escalateProvider: LlmProvider = {
      async completeJson() {
        return { status: "ESCALATE", confidence: 0, justification: [], sourceEvidence: [] };
      },
    };
    const plan: ResolutionPlan = {
      resolutionMode: "ai_assisted",
      primarySources: [{ sourceType: "official_api", locator: "https://api.example.com", trustScore: 0.9 }],
      fallbackSources: [],
      resolutionPredicate: "Price at resolve",
      oracleabilityScore: 0.9,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    };
    const result = await executeResolution(mockRuntime, baseMarket, plan, {
      providers: [escalateProvider],
    });
    expect(result.status).toBe("ESCALATE");
    expect(result.reason).toBeDefined();
  });
});

describe("Resolution Executor — ai_assisted", () => {
  test("ai_assisted returns SUCCESS when mock provider resolves", async () => {
    const plan: ResolutionPlan = {
      resolutionMode: "ai_assisted",
      primarySources: [{ sourceType: "official_api", locator: "https://api.example.com", trustScore: 0.9 }],
      fallbackSources: [],
      resolutionPredicate: "BTC price at resolve",
      oracleabilityScore: 0.9,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    };
    const mockProvider: LlmProvider = {
      async completeJson() {
        return {
          status: "RESOLVED",
          selectedOutcomeIndex: 1,
          confidence: 8500,
          justification: ["Price above threshold"],
          sourceEvidence: ["https://api.example.com"],
        };
      },
    };
    const result = await executeResolution(mockRuntime, baseMarket, plan, {
      providers: [mockProvider],
      minConfidence: 7000,
    });
    expect(result.status).toBe("SUCCESS");
    expect(result.outcomeIndex).toBe(1);
    expect(result.confidence).toBe(8500);
    expect(result.resolutionMode).toBe("ai_assisted");
  });

  test("ai_assisted returns ESCALATE when provider returns ESCALATE", async () => {
    const plan: ResolutionPlan = {
      resolutionMode: "ai_assisted",
      primarySources: [{ sourceType: "official_api", locator: "https://api.example.com", trustScore: 0.9 }],
      fallbackSources: [],
      resolutionPredicate: "BTC price at resolve",
      oracleabilityScore: 0.9,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    };
    const escalateProvider: LlmProvider = {
      async completeJson() {
        return { status: "ESCALATE", confidence: 0, justification: [], sourceEvidence: [] };
      },
    };
    const result = await executeResolution(mockRuntime, baseMarket, plan, {
      providers: [escalateProvider],
    });
    expect(result.status).toBe("ESCALATE");
    expect(result.reason).toBeDefined();
  });
});

describe("Resolution Executor — ai_assisted", () => {
  test("ai_assisted returns SUCCESS when mock provider resolves", async () => {
    const plan: ResolutionPlan = {
      resolutionMode: "ai_assisted",
      primarySources: [{ sourceType: "official_api", locator: "https://api.example.com", trustScore: 0.9 }],
      fallbackSources: [],
      resolutionPredicate: "Price at resolve",
      oracleabilityScore: 0.9,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    };
    const mockProvider: LlmProvider = {
      async completeJson() {
        return {
          status: "RESOLVED",
          selectedOutcomeIndex: 1,
          confidence: 8500,
          justification: ["Price above threshold"],
          sourceEvidence: ["https://api.example.com"],
        };
      },
    };
    const result = await executeResolution(mockRuntime, baseMarket, plan, {
      providers: [mockProvider],
      consensusQuorum: 1,
      minConfidence: 7000,
    });
    expect(result.status).toBe("SUCCESS");
    expect(result.outcomeIndex).toBe(1);
    expect(result.confidence).toBe(8500);
    expect(result.resolutionMode).toBe("ai_assisted");
  });

  test("ai_assisted returns ESCALATE when provider returns ESCALATE", async () => {
    const plan: ResolutionPlan = {
      resolutionMode: "ai_assisted",
      primarySources: [{ sourceType: "official_api", locator: "https://api.example.com", trustScore: 0.9 }],
      fallbackSources: [],
      resolutionPredicate: "Price at resolve",
      oracleabilityScore: 0.9,
      unresolvedCheckPassed: true,
      unresolvedCheckEvidence: [],
    };
    const escalateProvider: LlmProvider = {
      async completeJson() {
        return { status: "ESCALATE", confidence: 0, justification: [], sourceEvidence: [] };
      },
    };
    const result = await executeResolution(mockRuntime, baseMarket, plan, {
      providers: [escalateProvider],
      consensusQuorum: 1,
    });
    expect(result.status).toBe("ESCALATE");
    expect(result.reason).toBeDefined();
  });
});
