# Publicação direta pelo Instagram Login

O feed usa o JPEG 1080 × 1350 já gerado pelo navegador. Ao publicar, o diretor envia esse arquivo ao CMS, que salva no R2 e cria uma tarefa única por publicação e versão. O worker executa o envio pela API oficial, sem n8n. Stories continuam com o fluxo existente de download.

## Configuração

1. Aplicar `migrations/0046_instagram_direct.sql` no D1 antes de disponibilizar a aplicação.
2. Configurar os segredos `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET` no projeto Pages. Usar as credenciais do produto Instagram Login, não credenciais de Facebook Login.
3. Cadastrar no aplicativo a URL HTTPS exata `https://diario.dopovo.com.br/admin/instagram/connect/callback` (substituir pelo domínio de PUBLIC_BASE_URL quando necessário).
   Se PUBLIC_BASE_URL usar o endereço pages.dev, definir `INSTAGRAM_REDIRECT_URI` no Pages com essa URL do domínio público. O login deve iniciar no mesmo domínio para preservar a sessão e o cookie de autorização.
4. Habilitar `instagram_business_basic` e `instagram_business_content_publish`. A conta deve ser profissional e autorizada para o nível de acesso do aplicativo. Conferir no painel da Meta os requisitos de acesso e revisão aplicáveis à conta.
5. Entrar como diretor em Integrações e clicar em **Conectar ou renovar Instagram**. O token fica criptografado no D1; nunca é enviado à interface.
6. Configurar `INSTAGRAM_TOKEN_SECRET` com o mesmo valor no Pages e no worker `diario-instagram-scheduler`, usado para criptografar os tokens. Não alterar `JWT_SECRET`. Não trocar a chave do Instagram sem reconectar a conta. O fallback para JWT_SECRET existe apenas para ambientes sem a chave exclusiva.
7. Conferir `PUBLIC_BASE_URL` e `INSTAGRAM_GRAPH_VERSION` em `wrangler.instagram-scheduler.jsonc` e no Pages. O padrão é v22.0; ambos devem usar a mesma versão suportada pelo aplicativo.
8. Publicar o worker com `npx wrangler deploy --config wrangler.instagram-scheduler.jsonc` e disponibilizar o build do Pages. A integração requer DB e R2 no Pages; o worker usa DB e INSTAGRAM_TOKEN_SECRET.

## Execução e limites

O cron roda a cada minuto e processa uma tarefa por execução. O envio imediato também passa por essa fila. Uma matéria agendada precisa estar efetivamente publicada no site no momento do envio. O token é renovado automaticamente quando faltam menos de sete dias de validade; autorizações revogadas ou expiradas exigem reconexão.

A imagem fica disponível por uma URL aleatória HTTPS para que a Meta possa buscá-la. A versão aprovada é conferida novamente no servidor. Envios simultâneos da mesma versão são bloqueados por restrição única no banco e o processamento é adquirido atomicamente.

Se uma resposta de publicação se perder, a tarefa fica `uncertain` e não é reenviada automaticamente: é necessário conferir o Instagram antes de reconciliar o registro. Falhas anteriores à chamada de publicação podem ser reenviadas pelo botão após corrigir a causa. O identificador do contêiner e o erro ficam no D1. Tarefas com resultado incerto bloqueiam novos envios dessa publicação, inclusive de versões novas, até reconciliação manual. Tarefas interrompidas ficam sinalizadas após dez minutos.

O webhook legado não deve alterar publicações que têm uma tarefa direta. Ele continua disponível para o fluxo anterior e para legendas. Não há publicação de Stories ou Reels pela integração direta nesta versão.

## Validação de operação

Depois da configuração, conectar a conta, publicar uma arte aprovada de teste e verificar status, imagem e legenda no Instagram. Depois testar um agendamento. Testes locais simulam a API e não substituem essa validação com as credenciais reais.

## Preparação em produção em 3 de novembro de 2026

- Migração 0046 aplicada e registrada no D1; as outras migrações pendentes (0044/0045) não foram reaplicadas.
- Worker `diario-instagram-scheduler` publicado com cron a cada minuto e chave exclusiva INSTAGRAM_TOKEN_SECRET, também configurada no Pages.
- Aplicativo escolhido pelo titular: InautoDP - IG (Instagram app ID 2235349453974024).
- URL de retorno cadastrada no aplicativo e INSTAGRAM_REDIRECT_URI configurada para o domínio diario.dopovo.com.br.
- Pacote isolado gerado por `scripts/package-instagram-direct-release.mjs`, a partir do artefato da versão publicada, alterando somente o worker e o JavaScript do Instagram.
- INSTAGRAM_APP_SECRET cadastrado como segredo criptografado no Pages, após autorização e reautenticação do titular na Meta. A conexão da conta e a primeira publicação ainda dependem da autorização OAuth e da validação operacional.

### Validação do login real

O deploy de 3/11/2026 abriu o Instagram Login com as credenciais de produção. As permissões instagram_business_basic e instagram_business_content_publish estão “Ready for testing”. A Meta retornou “Função de desenvolvedor é insuficiente” porque a conta @jordiariodopovo não está cadastrada como Instagram Tester no aplicativo ainda não publicado. A inclusão e a autorização de acesso aguardam confirmação específica do titular. Nenhuma postagem foi feita.

### Conexão concluída em 3 de novembro de 2026 (Fortaleza)

O titular autorizou a inclusão de @jordiariodopovo como Instagram Tester, o aceite do convite e dos termos exibidos, e as permissões de perfil/mídias e publicação. O convite foi aceito e o OAuth concluído. O D1 confirmou a conta jordiariodopovo com token criptografado, e o CMS exibiu “Publicação configurada”. Nenhuma postagem foi realizada nesta ativação. Evidência: artifacts/instagram-conectado.jpg.
