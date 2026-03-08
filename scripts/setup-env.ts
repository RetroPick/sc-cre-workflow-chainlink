#!/usr/bin/env bun
/**
 * Distributes root .env to app-specific .env files.
 * Run after: cp .env.example .env && (edit .env with your values)
 * Usage: bun run scripts/setup-env.ts
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const envPath = join(ROOT, ".env");
const examplePath = join(ROOT, ".env.example");

const RELAYER_VARS = [
  "CHANNEL_SETTLEMENT_ADDRESS",
  "RPC_URL",
  "CHAIN_ID",
  "OPERATOR_PRIVATE_KEY",
  "FINALIZER_PRIVATE_KEY",
  "HOST",
  "PORT",
];

const FRONTEND_VARS = [
  "VITE_RELAYER_URL",
  "VITE_WLD_APP_ID",
  "VITE_WLD_ACTION",
  "VITE_POLYMARKET_API_KEY",
  "VITE_WORKFLOW_HTTP_URL",
];

const WORKFLOW_VARS = [
  "CRE_ETH_PRIVATE_KEY",
  "RPC_URL",
  "POLYMARKET_API_KEY",
  "POLYMARKET_SECRET",
  "POLYMARKET_PASSPHRASE",
];

function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function filterAndFormat(vars: string[], env: Record<string, string>): string {
  const lines: string[] = [];
  for (const key of vars) {
    const v = env[key];
    if (v !== undefined && v !== "") {
      lines.push(`${key}=${v}`);
    }
  }
  return lines.join("\n");
}

function main() {
  const sourcePath = existsSync(envPath) ? envPath : examplePath;
  if (!existsSync(sourcePath)) {
    console.error("No .env or .env.example found at root. Run: cp .env.example .env");
    process.exit(1);
  }

  const content = readFileSync(sourcePath, "utf-8");
  const env = parseEnv(content);

  const relayerEnv = filterAndFormat(RELAYER_VARS, env);
  const frontendEnv = filterAndFormat(FRONTEND_VARS, env);
  const workflowEnv = filterAndFormat(WORKFLOW_VARS, env);

  writeFileSync(join(ROOT, "apps/relayer/.env"), relayerEnv);
  writeFileSync(join(ROOT, "apps/front-end-v2/.env"), frontendEnv);
  writeFileSync(join(ROOT, "apps/workflow/.env"), workflowEnv);

  console.log("Env synced to apps/relayer/.env, apps/front-end-v2/.env, apps/workflow/.env");
}

main();
