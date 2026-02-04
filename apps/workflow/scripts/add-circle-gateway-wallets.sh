#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
RELAYER_DIR="$ROOT/apps/relayer"
WEB_DIR="$ROOT/apps/web"

echo "==> Repo root: $ROOT"

# Ensure expected monorepo folders exist
mkdir -p "$ROOT/apps" "$ROOT/packages" "$ROOT/scripts"

# Check frontend exists
if [ ! -d "$WEB_DIR" ]; then
  echo "ERROR: $WEB_DIR not found. Your frontend must be at apps/web."
  echo "Run: ls apps"
  exit 1
fi

# Create relayer skeleton
mkdir -p "$RELAYER_DIR/src/circle/gateway" "$RELAYER_DIR/src/server"
mkdir -p "$WEB_DIR/src/circle/wallets"

# Initialize relayer if missing
if [ ! -f "$RELAYER_DIR/package.json" ]; then
  echo "==> Creating apps/relayer (bun init)"
  (cd "$RELAYER_DIR" && bun init -y >/dev/null)
fi

echo "==> Installing deps into apps/relayer"
(cd "$RELAYER_DIR" && bun add viem dotenv zod fastify @fastify/cors >/dev/null)

# Gateway client (simple fetch wrapper)
cat > "$RELAYER_DIR/src/circle/gateway/gatewayClient.ts" <<'TS'
export class GatewayClient {
  static BASE_URL = "https://gateway-api-testnet.circle.com/v1";

  async info() {
    return this.#get("/info");
  }

  async balances(token: string, depositor: string, domains?: number[]) {
    // domains are CCTP domains, optional. If omitted, you can decide server-side behavior later.
    return this.#post("/balances", {
      token,
      sources: (domains ?? []).map((domain) => ({ depositor, domain })),
    });
  }

  async #get(path: string) {
    const res = await fetch(GatewayClient.BASE_URL + path);
    if (!res.ok) throw new Error(`Gateway GET ${path} failed: ${res.status}`);
    return res.json();
  }

  async #post(path: string, body: any) {
    const res = await fetch(GatewayClient.BASE_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    });
    if (!res.ok) throw new Error(`Gateway POST ${path} failed: ${res.status}`);
    return res.json();
  }
}
TS

# Relayer server exposing Gateway endpoints (frontend will call this)
cat > "$RELAYER_DIR/src/server/index.ts" <<'TS'
import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { GatewayClient } from "../circle/gateway/gatewayClient";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const gateway = new GatewayClient();

app.get("/health", async () => ({ ok: true }));

app.get("/circle/gateway/info", async () => {
  return gateway.info();
});

app.post("/circle/gateway/balances", async (req) => {
  const schema = z.object({
    token: z.string(),
    depositor: z.string(),
    domains: z.array(z.number()).optional(),
  });
  const body = schema.parse(req.body);
  return gateway.balances(body.token, body.depositor, body.domains);
});

const port = Number(process.env.RELAYER_PORT ?? "8787");
await app.listen({ port, host: "0.0.0.0" });
TS

# Ensure relayer has a dev script
node - <<'NODE'
const fs = require("fs");
const path = "apps/relayer/package.json";
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
pkg.type = "module";
pkg.scripts = pkg.scripts || {};
pkg.scripts.dev = "bun run src/server/index.ts";
fs.writeFileSync(path, JSON.stringify(pkg, null, 2));
NODE

echo "==> Installing Modular Wallets into apps/web"
(cd "$WEB_DIR" && bun add viem dotenv @circle-fin/modular-wallets-core >/dev/null)

# Wallet stub (frontend)
cat > "$WEB_DIR/src/circle/wallets/modularWallet.ts" <<'TS'
export function isCircleWalletEnabled() {
  return import.meta.env.VITE_CIRCLE_WALLETS_ENABLED === "true";
}
TS

# Env templates
[ -f "$ROOT/.env.example" ] || touch "$ROOT/.env.example"
grep -q "RELAYER_PORT" "$ROOT/.env.example" || cat >> "$ROOT/.env.example" <<'ENV'

# --- Relayer ---
RELAYER_PORT=8787

# --- Frontend (Vite) ---
VITE_RELAYER_URL=http://localhost:8787
VITE_CIRCLE_WALLETS_ENABLED=false
ENV

[ -f "$RELAYER_DIR/.env.example" ] || cat > "$RELAYER_DIR/.env.example" <<'ENV'
RELAYER_PORT=8787
ENV

echo ""
echo "✅ Done."
echo "Next:"
echo "  1) cd apps/relayer && cp .env.example .env && bun run dev"
echo "  2) curl http://localhost:8787/health"
echo "  3) curl http://localhost:8787/circle/gateway/info"
echo "  4) cd ../web && bun dev"
