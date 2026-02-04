// RetroPick/my-workflow/httpCallback.ts

import {
    cre, 
    type Runtime,
    type HTTPPayload,
    decodeJson,
} from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "./types/config";

// Interface for the HTTP Payload
interface CreateMarketPayload {
    question: string;
}
type Config = WorkflowConfig;

export function onHttpTrigger(runtime: Runtime<Config>, payload: HTTPPayload): string {
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    runtime.log("CRE Workflow: HTTP Trigger - Create Market");
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Step 1: Parse and validate the incoming payload
    if(!payload.input || payload.input.length === 0) {
        runtime.log("[ERROR] Invalid payload: empty input");
        return "Error: Empty Request";
    }

    const inputData = decodeJson(payload.input) as CreateMarketPayload;
    runtime.log(`[Step 1] Received question: ${inputData.question}`);

    if (!inputData.question || inputData.question.trim().length === 0) {
        runtime.log("[ERROR] Question is required");
        return "Error: Question is required";
    }

    // Steps 2-6: EVM Write (covered in next chapter)
    // We'll complete this in the EVM Write chapter

    return "Success";
}