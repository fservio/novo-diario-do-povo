// Script para criar usuário admin usando fetch direto para o banco
// Executar no console do navegador ou via curl

async function createAdminUser() {
  try {
    // Primeiro, vamos verificar se há algum endpoint de debug
    const debugResponse = await fetch('/api/debug/db');
    const debugData = await debugResponse.json();
    console.log('Debug DB:', debugData);
    
    // Se não houver endpoint específico, vamos tentar criar via formulário
    // Vamos tentar acessar a página de criação de usuários
    const usersResponse = await fetch('/admin/users/new');
    console.log('Users response:', usersResponse.status);
    
    // Como alternativa, vamos tentar criar um post diretamente
    // Mas primeiro precisamos entender o problema real
    
    console.log('Para resolver o problema de salvamento de posts, você precisa:');
    console.log('1. Criar um usuário admin no banco de dados');
    console.log('2. Fazer login com esse usuário');
    console.log('3. Acessar /admin/posts/new para criar posts');
    console.log('');
    console.log('O problema atual é que não há nenhum usuário admin criado.');
    console.log('O sistema de bootstrap não está funcionando corretamente.');
    
  } catch (error) {
    console.error('Erro:', error);
  }
}

createAdminUser();