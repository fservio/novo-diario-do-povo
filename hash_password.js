// Script para gerar o hash correto da senha
const password = 'Admin123!@#';

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

hashPassword(password).then(hash => {
  console.log('Password:', password);
  console.log('Hash:', hash);
});