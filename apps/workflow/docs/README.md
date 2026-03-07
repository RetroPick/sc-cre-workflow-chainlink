# CRE Workflow Documentation

Comprehensive documentation for the RetroPick Chainlink CRE (Request-and-Execute) workflow. This workflow orchestrates market creation, session finalization, checkpoint settlement, and market resolution via the Chainlink Forwarder.

## Quick Start

1. **Install:** `cd apps/workflow && bun install`
2. **Config:** Copy `config.example.json` to `config.staging.json` or `config.production.json`
3. **Simulate:** From project root: `cre workflow simulate ./apps/workflow --target=staging-settings`

## Full Documentation

**[DOCUMENTATION.md](DOCUMENTATION.md)** — Single consolidated document containing:

- Architecture, component roles, report routing
- Configuration reference, validation rules, examples
- Handlers reference (triggers, config, purpose)
- Resolution flow (trigger → AI → chain)
- Checkpoint flow (submit, challenge window, finalize, cancel)
- Relayer integration (API contract and usage)
- Contract integration (report formats, receivers, on-chain routing)
- Creation flows (feed, publish-from-draft, draftProposer)
- Troubleshooting (common failure modes and resolutions)

## Prerequisites

- **Relayer:** [apps/relayer](../relayer) — Session state, checkpoint build, finalize/cancel. See [Relayer CRE API](../relayer/docs/development/cre/API_REFERENCE.md)
- **Contracts:** [packages/contracts](../../packages/contracts) — CREReceiver, ChannelSettlement, MarketRegistry. See [CRE docs](../../packages/contracts/docs/abi/docs/cre/)

## Key Concepts

- **CRE Workflow:** Chainlink DON-run workflow with cron, HTTP, and log triggers
- **CREReceiver:** On-chain entrypoint for outcome reports (resolution) and checkpoint reports (0x03)
- **CREPublishReceiver:** Separate entrypoint for publish-from-draft (market creation)
- **Relayer:** Off-chain trading engine; builds checkpoint payloads; CRE fetches and delivers on-chain
