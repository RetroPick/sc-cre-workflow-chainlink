// prediction-market/my-workflow/main.ts

import { cre, Runner, type Runtime } from "@chainlink/cre-sdk";
import { onHttpTrigger } from "./httpCallback";

type Config = {
  geminiModel: string;
  evms: Array<{
    marketAddress: string;
    chainSelectorName: string;
    gasLimit: string;
  }>;
};

const initWorkflow = (config: Config) => {
  const httpCapability = new cre.capabilities.HTTPCapability();
  const httpTrigger = httpCapability.trigger({});

  return [
    cre.handler(
      httpTrigger,
      onHttpTrigger
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
