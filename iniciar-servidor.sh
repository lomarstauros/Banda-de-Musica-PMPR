#!/bin/bash

# ─────────────────────────────────────────────
#  Banda de Música PMPR — Servidor de Desenvolvimento
# ─────────────────────────────────────────────

# Carrega o nvm para ter acesso ao node/npm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Vai para a pasta do projeto
cd "$(dirname "$0")"

# Verifica se node está disponível
if ! command -v node &> /dev/null; then
  echo "❌ Node.js não encontrado. Verifique a instalação do nvm."
  read -p "Pressione ENTER para fechar..."
  exit 1
fi

echo "✅ Node $(node -v) | npm $(npm -v)"
echo "🚀 Iniciando servidor de desenvolvimento..."
echo "🌐 Acesse: http://localhost:3000"
echo ""
echo "  Para encerrar, feche esta janela ou pressione Ctrl+C"
echo "─────────────────────────────────────────────"

# Mata qualquer processo na porta 3000 antes de iniciar
lsof -ti :3000 | xargs kill -9 2>/dev/null

npm run dev
