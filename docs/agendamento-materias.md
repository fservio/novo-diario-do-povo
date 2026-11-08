# Agendamento de matérias

1. Crie e salve a matéria como rascunho.
2. Na edição, use **Publicar em — horário de Fortaleza (UTC−3)**, na seção de publicação.
3. Escolha uma data e hora futuras e clique em **Agendar publicação**.
4. A lista e o editor mostram a matéria como **Agendada**. Ela continua sem acesso público até ser publicada.

O horário digitado é convertido para UTC no servidor. O executor `diario-post-scheduler` roda a cada minuto, independentemente do navegador ou do n8n. Em condições normais, a publicação acontece em até um minuto após o horário escolhido. Uma execução posterior também processa os agendamentos vencidos, caso um disparo seja interrompido.

O editor permite alterar a data ou cancelar um agendamento pendente. **Publicar agora** remove o agendamento e publica imediatamente. Arquivar também remove o agendamento. Matérias já publicadas ou arquivadas não podem ser agendadas por essa ação.

Salve o texto antes de agendar: o formulário de agendamento não salva alterações pendentes do editor de conteúdo.

## Instagram da matéria agendada

Na edição da matéria, o atalho **Instagram da matéria** abre a peça social existente ou a seleção da matéria para preparar uma nova. A mesa social também lista matérias agendadas, com a data de entrada no ar. A criação exige imagem de capa e permite preparar o feed, o Story e a legenda antes da publicação no site.

O link do Story usa a data prevista de publicação. O agendamento no Instagram continua sendo uma ação separada, com aprovação editorial e envio ao n8n. Enquanto a matéria estiver agendada, escolha um horário pelo menos um minuto depois do horário do site. Se alterar a data da matéria depois de encaminhar o Instagram ao n8n, revise também o agendamento e os links da peça social.

## Operação

Em uma instalação nova, aplique `migrations/0044_post_scheduling_index.sql` antes de implantar o executor. O índice contém somente os rascunhos com agendamento, evitando varreduras de todo o acervo a cada minuto.

```powershell
npx wrangler d1 execute webapp-prod-v2 --remote --file migrations/0044_post_scheduling_index.sql
npm run deploy:post-scheduler
npm run deploy:prod
```

O executor publica até 100 matérias vencidas por execução. A mudança de status e a atualização da revisão de cache da home acontecem na mesma transação D1. As condições são verificadas novamente na atualização, preservando cancelamentos e alterações feitos depois da consulta inicial. Uma matéria já publicada não é processada novamente.

Não há endpoint público de execução nem credenciais compartilhadas adicionais. Para acompanhar os disparos:

```powershell
npx wrangler tail --config wrangler.post-scheduler.jsonc --format json
```
