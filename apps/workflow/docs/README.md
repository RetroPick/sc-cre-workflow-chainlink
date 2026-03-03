# CRE Workflow Documentation

Comprehensive documentation for the RetroPick Chainlink CRE (Request-and-Execute) workflow. This workflow orchestrates market creation, session finalization, checkpoint settlement, and market resolution via the Chainlink Forwarder.

## Quick Start

1. **Install:** `cd apps/workflow && bun install`
2. **Config:** Copy `config.example.json` to `config.staging.json` or `config.production.json`
3. **Simulate:** From project root: `cre workflow simulate ./apps/workflow --target=staging-settings`

See [Configuration](Configuration.md) for full config reference.

## Documentation Index

| Document | Description |
|----------|-------------|
| [Architecture](Architecture.md) | High-level system design, component diagram, report routing |
| [Configuration](Configuration.md) | Full config reference, validation rules, examples |
| [Handlers Reference](HandlersReference.md) | Per-handler documentation (triggers, config, purpose) |
| [Resolution Flow](ResolutionFlow.md) | End-to-end market resolution: trigger → AI → chain |
| [Checkpoint Flow](CheckpointFlow.md) | V3 checkpoint submit, challenge window, finalize, cancel |
| [Relayer Integration](RelayerIntegration.md) | Workflow ↔ Relayer API contract and usage |
| [Contract Integration](ContractIntegration.md) | Report formats, receivers, on-chain routing |
| [Creation Flows](CreationFlows.md) | Market creation paths (feed, publish-from-draft, draftProposer) |
| [Troubleshooting](Troubleshooting.md) | Common failure modes and resolutions |

## Prerequisites

- **Relayer:** [apps/relayer](../relayer) — Session state, checkpoint build, finalize/cancel. See [Relayer CRE API](../relayer/docs/development/cre/API_REFERENCE.md)
- **Contracts:** [packages/contracts](../../packages/contracts) — CREReceiver, ChannelSettlement, MarketRegistry. See [CRE docs](../../packages/contracts/docs/abi/docs/cre/)

## Key Concepts

- **CRE Workflow:** Chainlink DON-run workflow with cron, HTTP, and log triggers
- **CREReceiver:** On-chain entrypoint for outcome reports (resolution) and checkpoint reports (0x03)
- **CREPublishReceiver:** Separate entrypoint for publish-from-draft (market creation)
- **Relayer:** Off-chain trading engine; builds checkpoint payloads; CRE fetches and delivers on-chain
