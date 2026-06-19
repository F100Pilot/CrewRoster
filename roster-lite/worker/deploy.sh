#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "=== CrewRoster Proxy — Deploy ==="
echo ""

# 1. Install dependencies
echo "1/3  A instalar dependências..."
npm install --silent

# 2. Check if logged in to Cloudflare
if ! npx wrangler whoami &>/dev/null; then
  echo ""
  echo "2/3  Precisas de autenticar no Cloudflare."
  echo "     Vai abrir o browser — faz login e autoriza."
  echo ""
  npx wrangler login
else
  echo "2/3  Já autenticado no Cloudflare."
fi

# 3. Deploy
echo "3/3  A fazer deploy do worker..."
echo ""
DEPLOY_OUTPUT=$(npx wrangler deploy 2>&1)
echo "$DEPLOY_OUTPUT"

# Extract the worker URL from deploy output
WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep -oP 'https://[^\s]+\.workers\.dev' | head -1)

if [ -n "$WORKER_URL" ]; then
  echo ""
  echo "========================================="
  echo "  Deploy concluído!"
  echo "  Worker URL: $WORKER_URL"
  echo "========================================="
  echo ""

  # Update the .env file in roster-lite
  ENV_FILE="../.env.local"
  echo "VITE_API_URL=$WORKER_URL" > "$ENV_FILE"
  echo "Ficheiro $ENV_FILE atualizado com VITE_API_URL=$WORKER_URL"
  echo ""
  echo "Próximos passos:"
  echo "  1. cd roster-lite"
  echo "  2. npm run build"
  echo "  3. git add -A && git commit -m 'Configure worker URL' && git push"
  echo "  4. Espera ~1 min pelo deploy no GitHub Pages"
  echo "  5. Abre https://f100pilot.github.io/CrewRoster/"
else
  echo ""
  echo "Não consegui extrair o URL do worker."
  echo "Copia o URL do output acima e cria o ficheiro roster-lite/.env.local:"
  echo "  VITE_API_URL=https://crewroster-proxy.TEUUSER.workers.dev"
fi
