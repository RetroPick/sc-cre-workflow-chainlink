#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_PATH="${1:-"$SCRIPT_DIR/config.staging.json"}"
MARKET_ID="${2:-0}"
PREDICTION="${3:-0}" # 0 = Yes, 1 = No
VALUE_ETH="${4:-0.01ether}"
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

if [[ -z "${CRE_ETH_PRIVATE_KEY:-}" ]]; then
  echo "Missing CRE_ETH_PRIVATE_KEY." >&2
  exit 1
fi

cast send "$MARKET_ADDRESS" "predict(uint256,uint8)" "$MARKET_ID" "$PREDICTION" \
  --value "$VALUE_ETH" \
  --rpc-url "$RPC_URL" \
  --private-key "$CRE_ETH_PRIVATE_KEY"
