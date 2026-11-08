#!/usr/bin/env bash
# Build the program, boot a local validator if needed, deploy, and write public/program.json.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${HOME}/.local/share/solana/install/active_release/bin:${PATH}"
RPC="http://127.0.0.1:8899"
LEDGER="${ROOT}/.localnet/ledger"
KEYPAIR="${HOME}/.config/solana/id.json"

cd "${ROOT}/program"
cargo build-sbf

SO="${ROOT}/program/target/deploy/fog_of_war.so"
PROG="${ROOT}/program/target/deploy/fog_of_war-keypair.json"
if [[ ! -f "${SO}" || ! -f "${PROG}" ]]; then
  echo "cargo build-sbf did not produce fog_of_war.so" >&2
  exit 1
fi

mkdir -p "${HOME}/.config/solana" "${ROOT}/.localnet" "${ROOT}/public"
if [[ ! -f "${KEYPAIR}" ]]; then
  solana-keygen new --no-bip39-passphrase --force -o "${KEYPAIR}" >/dev/null
fi

if ! solana -u "${RPC}" cluster-version >/dev/null 2>&1; then
  nohup solana-test-validator \
    --reset \
    --quiet \
    --ledger "${LEDGER}" \
    --bind-address 127.0.0.1 \
    --rpc-port 8899 \
    --faucet-port 9900 \
    >"${ROOT}/.localnet/validator.log" 2>&1 &
  disown || true
  for _ in $(seq 1 60); do
    if solana -u "${RPC}" cluster-version >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

solana -u "${RPC}" airdrop 20 "$(solana-keygen pubkey "${KEYPAIR}")" >/dev/null
solana program deploy "${SO}" \
  --program-id "${PROG}" \
  --url "${RPC}" \
  --upgrade-authority "${KEYPAIR}" >"${ROOT}/.localnet/deploy.log" 2>&1
PUB="$(solana-keygen pubkey "${PROG}")"
cat > "${ROOT}/public/program.json" <<EOF
{
  "programId": "${PUB}",
  "cluster": "localnet",
  "rpc": "${RPC}"
}
EOF
echo "Deployed ${PUB} to ${RPC}"
