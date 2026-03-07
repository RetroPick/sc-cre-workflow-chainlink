/**
 * LlmProvider implementation wrapping GPTService (DeepSeek) for completeJson.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "../../types/config";
import type { LlmProvider } from "../interfaces";
import { GPTService } from "../../gpt";

/**
 * Creates an LlmProvider bound to the given CRE runtime.
 * Uses GPTService (DeepSeek) for HTTP completion; respects useMockAi.
 */
export function createLlmProvider(runtime: Runtime<WorkflowConfig>): LlmProvider {
  const service = new GPTService(runtime);
  return {
    async completeJson<T>(args: {
      system: string;
      user: string;
      schemaName: string;
      temperature?: number;
    }): Promise<T> {
      return Promise.resolve(service.completeJson<T>(args));
    },
  };
}
