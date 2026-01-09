/**
 * Script para verificar e criar usuário admin
 * Executar no navegador console ou via fetch
 */

// Função para criar hash de senha (igual ao do backend)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Verificar se há usuários
async function checkUsers() {
  try {
    const response = await fetch('/api/admin/users', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Users:', data);
  } catch (error) {
    console.error('Error checking users:', error);
  }
}

// Criar usuário admin manualmente (se tiver acesso)
async function createAdminUser() {
  const passwordHash = await hashPassword('Admin123!@#');
  
  try {
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@jornal.local',
        password_hash: passwordHash,
        name: 'Administrador',
        role: 'admin',
        is_active: 1
      })
    });
    
    console.log('Create response status:', response.status);
    const result = await response.json();
    console.log('Create result:', result);
  } catch (error) {
    console.error('Error creating admin:', error);
  }
}

// Executar verificação
console.log('Verificando usuários...');
checkUsers();