/**
 * Verifier provider for claim verification (unresolved checks, settlement).
 * Stub implementation uses LLM when available; otherwise returns AMBIGUOUS.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "../../types/config";
import type { VerifierProvider } from "../interfaces";
import { createLlmProvider } from "./llmProvider";

const VERIFY_SYSTEM_PROMPT = `
You verify whether a claim is supported by the given sources.
Return a JSON object: {"verdict": "SUPPORTED" | "UNSUPPORTED" | "AMBIGUOUS", "confidence": <0-1>, "evidence": [<string>]}
- SUPPORTED: sources clearly support the claim
- UNSUPPORTED: sources contradict or do not support the claim
- AMBIGUOUS: insufficient or conflicting evidence
Output ONLY the JSON object, no markdown.
`;

/**
 * Creates a VerifierProvider that uses the LLM for claim verification.
 */
export function createVerifierProvider(runtime: Runtime<WorkflowConfig>): VerifierProvider {
  const llm = createLlmProvider(runtime);
  return {
    async verifyClaim(args: {
      claim: string;
      sources: string[];
      allowedOutcomes?: string[];
    }): Promise<{
      verdict: "SUPPORTED" | "UNSUPPORTED" | "AMBIGUOUS";
      confidence: number;
      evidence: string[];
    }> {
      const user = `Claim: ${args.claim}\nSources: ${JSON.stringify(args.sources)}\n${
        args.allowedOutcomes ? `Allowed outcomes: ${JSON.stringify(args.allowedOutcomes)}` : ""
      }`;
      const result = await llm.completeJson<{
        verdict: "SUPPORTED" | "UNSUPPORTED" | "AMBIGUOUS";
        confidence: number;
        evidence: string[];
      }>({
        system: VERIFY_SYSTEM_PROMPT,
        user,
        schemaName: "VerifyClaim",
        temperature: 0,
      });
      return {
        verdict: result.verdict,
        confidence: typeof result.confidence === "number" ? result.confidence : 0.5,
        evidence: Array.isArray(result.evidence) ? result.evidence : [],
      };
    },
  };
}
