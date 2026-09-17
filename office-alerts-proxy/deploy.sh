#!/usr/bin/env bash
# Deploy dansells-office-alerts. Secrets stay in your terminal — not in git.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="${PATH}:/workspace/.node/node-v22.19.0-linux-x64/bin"

if ! command -v node >/dev/null; then
  echo "Need Node.js 20+"
  exit 1
fi

if [[ ! -x node_modules/.bin/wrangler ]]; then
  npm install wrangler@3.112.0 --no-fund --no-audit
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  read -r -s -p "Cloudflare API token: " CLOUDFLARE_API_TOKEN
  echo
  export CLOUDFLARE_API_TOKEN
fi

echo "Deploying dansells-office-alerts…"
./node_modules/.bin/wrangler deploy

if [[ -z "${OFFICE_DISPLAY_SECRET:-}" ]]; then
  read -r -s -p "Office display secret: " OFFICE_DISPLAY_SECRET
  echo
fi
printf '%s' "$OFFICE_DISPLAY_SECRET" | ./node_modules/.bin/wrangler secret put OFFICE_DISPLAY_SECRET

echo
echo "Done. Note the workers.dev URL above, then tell Grok Bot:"
echo "  https://dansells-office-alerts.<your-subdomain>.workers.dev/alerts"
