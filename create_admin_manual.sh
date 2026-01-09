#!/bin/bash

# Script para criar usuário admin manualmente
# Executar: bash create_admin_manual.sh

echo "Criando usuário admin..."

# Hash da senha Admin123!@# (SHA-256)
# Senha: Admin123!@#
PASSWORD_HASH="a8d51fc6a058bfeacb77818d42d420ac1bf31529393a784ec60f7c2443047462"

# Usar wrangler para inserir diretamente no banco
npx wrangler d1 execute webapp-production --local --command="
INSERT INTO users (email, password_hash, name, role, is_active, created_at, updated_at)
VALUES ('admin@jornal.local', '${PASSWORD_HASH}', 'Administrador', 'admin', 1, datetime('now'), datetime('now'))
ON CONFLICT(email) DO UPDATE SET 
  password_hash = '${PASSWORD_HASH}',
  name = 'Administrador',
  role = 'admin',
  is_active = 1,
  updated_at = datetime('now');
"

echo "Usuário admin criado com sucesso!"
echo "Email: admin@jornal.local"
echo "Senha: Admin123!@#"