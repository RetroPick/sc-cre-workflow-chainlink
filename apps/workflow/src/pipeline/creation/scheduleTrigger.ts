/**
 * scheduleTrigger — delegates to discoveryCron for backward compatibility.
 * The CRE Orchestration Layer uses discoveryCron as the primary discovery handler.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "../../types/config";
import { onDiscoveryCron } from "../orchestration/discoveryCron";

export function onScheduleTrigger(runtime: Runtime<WorkflowConfig>): string {
  return onDiscoveryCron(runtime);
}
