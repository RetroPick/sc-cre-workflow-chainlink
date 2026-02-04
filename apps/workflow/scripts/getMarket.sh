#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG_PATH="${1:-"$ROOT_DIR/config.staging.json"}"
MARKET_ID="${2:-0}"
RPC_URL="${RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"

# Load .env from repo root if present
if [[ -f "$ROOT_DIR/.env" ]]; then
  # shellcheck disable=SC1091
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

MARKET_ADDRESS="${MARKET_ADDRESS:-}"
if [[ -z "$MARKET_ADDRESS" ]]; then
  MARKET_ADDRESS="$(node -e "const fs=require('fs');const p=process.argv[1];const c=JSON.parse(fs.readFileSync(p,'utf8'));process.stdout.write(c?.evms?.[0]?.marketAddress||'');" "$CONFIG_PATH")"
fi

if [[ -z "$MARKET_ADDRESS" ]]; then
  echo "Missing market address. Set MARKET_ADDRESS or check $CONFIG_PATH (evms[0].marketAddress)." >&2
  exit 1
fi

cast call "$MARKET_ADDRESS" \
  "getMarket(uint256) returns ((address,uint48,uint48,bool,uint16,uint8,uint256,uint256,string))" \
  "$MARKET_ID" \
  --rpc-url "$RPC_URL"
