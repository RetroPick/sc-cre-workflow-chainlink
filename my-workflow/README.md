# Typescript Simple Workflow Example

This template provides a simple Typescript workflow example. It shows how to create a simple "Hello World" workflow using Typescript.

Steps to run the example

## 1. Update .env file

You need to add a private key to env file. This is specifically required if you want to simulate chain writes. For that to work the key should be valid and funded.
If your workflow does not do any chain write then you can just put any dummy key as a private key. e.g.

```
CRE_ETH_PRIVATE_KEY=0000000000000000000000000000000000000000000000000000000000000001
```

Note: Make sure your `workflow.yaml` file is pointing to the config.json, example:

```yaml
staging-settings:
  user-workflow:
    workflow-name: "hello-world"
  workflow-artifacts:
    workflow-path: "./main.ts"
    config-path: "./config.json"
```

## 2. Install dependencies

If `bun` is not already installed, see https://bun.com/docs/installation for installing in your environment.

```bash
cd <workflow-name> && bun install
```

Example: For a workflow directory named `hello-world` the command would be:

```bash
cd hello-world && bun install
```

## 3. Simulate the workflow

Run the command from <b>project root directory</b>

```bash
cre workflow simulate <path-to-workflow-directory> --target=staging-settings
```

Example: For workflow named `hello-world` the command would be:

```bash
cre workflow simulate ./hello-world --target=staging-settings
```

## 3.1 Cron-driven market creation

The workflow can also generate markets automatically from configured feeds using a cron trigger.
Configure these fields in `config.staging.json` or `config.production.json`:

- `cronSchedule`
- `marketFactoryAddress`
- `creatorAddress`
- `feeds`

For demo runs without a paid AI key, set:

```json
"useMockAi": true,
"mockAiResponse": "{\"result\":\"YES\",\"confidence\":10000}"
```

Market creation uses `MarketFactory` as the receiver for CRE reports. The factory then
creates a market in `PredictionMarket` and stores metadata for audits.

## 4. Trigger settlement (Log Trigger)

If you want to emit `SettlementRequested`, use the helper script so the
contract address is always resolved from the workflow config:

```bash
bash ./my-workflow/scripts/requestSettlement.sh
```

Optional overrides:

```bash
MARKET_ADDRESS=0xYourMarketAddress \
CRE_ETH_PRIVATE_KEY=0xYourKey \
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
bash ./my-workflow/scripts/requestSettlement.sh ./my-workflow/config.staging.json 0
```

## 5. Make a prediction

Use the helper script so the contract address and key are resolved consistently:

```bash
bash ./my-workflow/scripts/predict.sh
```

Optional overrides:

```bash
MARKET_ADDRESS=0xYourMarketAddress \
CRE_ETH_PRIVATE_KEY=0xYourKey \
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
bash ./my-workflow/scripts/predict.sh ./my-workflow/config.staging.json 0 0 0.01ether
```

## 6. Read market data

Use the helper script to read `getMarket` without worrying about `$MARKET_ADDRESS`:

```bash
bash ./my-workflow/scripts/getMarket.sh
```

Optional overrides:

```bash
MARKET_ADDRESS=0xYourMarketAddress \
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
bash ./my-workflow/scripts/getMarket.sh ./my-workflow/config.staging.json 0
```

## 7. Read prediction result

Use the helper script to read a user's prediction:

```bash
PREDICTOR=0xYourPredictorAddress \
bash ./my-workflow/scripts/getPrediction.sh ./my-workflow/config.staging.json 0
```

Optional overrides:

```bash
MARKET_ADDRESS=0xYourMarketAddress \
PREDICTOR=0xYourPredictorAddress \
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
bash ./my-workflow/scripts/getPrediction.sh ./my-workflow/config.staging.json 0
```
