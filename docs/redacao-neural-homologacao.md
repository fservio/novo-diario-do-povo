# Piloto da Redação Neural em Política

O piloto registra marcos e falhas da apuração documental de Política. A trilha fica em `neural_events` e o estado de cada execução em `neural_executions`. O identificador da execução é o mesmo do n8n.

Na [execução de homologação 5424918](https://n8n.srv797269.hstgr.cloud/workflow/SIu6TIuEk2Ya5uPD/executions/5424918), o piloto produziu o dossiê e os dois rascunhos. O Worker respondeu HTTP 201 aos seis envios, e a consulta ao D1 confirmou os seis eventos e o estado `completed`. O nó **Apurar documentos** usou o limite de 4.096 tokens de saída.

No CMS com `CF_ENV=staging` e `NEURAL_ENABLED=true`, editores e diretores podem abrir **Redação IA → Mesa de Política → Voto distrital misto**. Para validar a trilha específica em homologação, abra `/admin/redacao-neural/missoes/politica-distrital-misto-2026-11?execucao=5424918` após entrar no CMS. A tela deve mostrar seis eventos, o estado **Concluída**, horários de Fortaleza e o link para a execução no n8n.

O CMS de produção oferece a mesma tela a editores e diretores quando recebe o binding `NEURAL_PILOT_DB` para o D1 do piloto. Esse binding é usado pelas consultas do painel. O deploy inicial foi publicado sobre a revisão `bde91b2` em [Cloudflare Pages](https://5d494146.novo-diario-do-povo.pages.dev). A [pauta em produção](https://diario.dopovo.com.br/admin/redacao-neural/missoes/politica-distrital-misto-2026-11?execucao=5424918) exige a sessão do CMS.

O Worker de homologação `redacao-neural-hml` está vinculado ao banco `do-povo-cms-hml`. Use `https://redacao-neural-hml.fabioservio.workers.dev` como origem ao gerar o workflow. A migração 0068 e o cadastro da missão já foram aplicados nesse banco. O teste direto registrou a execução de teste `1794794899` com HTTP 201. O reenvio recebeu HTTP 200 com `duplicate: true` e a consulta ao D1 confirmou uma única linha. A execução pelo n8n depende da configuração das duas credenciais desse ambiente no n8n.

1. No D1 de homologação, confirme que a categoria com slug `politica` existe e aplique a migração `0068_neural_events.sql`. Se a categoria foi cadastrada depois da migração, execute os dois `INSERT INTO ... SELECT` da migração para cadastrar o agente e a missão.
2. Configure o CMS de homologação com `CF_ENV=staging`, `NEURAL_ENABLED=true` e o segredo exclusivo `NEURAL_EVENTS_SECRET`. O ambiente local aceita `CF_ENV=dev`.
3. Gere o JSON e importe como workflow separado no n8n de teste. Use a origem HTTPS efetiva do CMS de homologação.

   ```powershell
   node scripts/build-neural-politica-workflow.mjs https://cms-homologacao.example |
     Set-Content -Encoding utf8NoBOM redacao-neural-politica.workflow.json
   ```

4. Nos nós HTTP de telemetria, selecione a credencial **Redação Neural · CMS homologação** do tipo Header Auth, com o cabeçalho `X-API-Key` e o mesmo valor do segredo `N8N_API_KEY` do Worker de teste. Nos nós Crypto v2, selecione **Redação Neural · assinatura homologação** do tipo Crypto, com o campo **Hmac Secret** igual ao `NEURAL_EVENTS_SECRET` do Worker. Como os valores usados no primeiro teste foram gerados em memória, gere um novo par e atualize os dois serviços. Confirme também a credencial OpenAI da cópia importada. [Credencial Crypto no n8n](https://docs.n8n.io/integrations/builtin/credentials/crypto/)
5. Dispare manualmente **Iniciar piloto**. Confirme que os nós de telemetria devolveram HTTP 201 ou 200 em reenvio e que **Resultado do piloto** contém o dossiê e os dois rascunhos. Use o ID daquela execução para consultar a trilha no D1 de homologação.

```sql
SELECT id, event_type, stage, occurred_at, received_at
FROM neural_events
WHERE mission_id = 'politica-distrital-misto-2026-11' AND execution_id = '<id n8n>'
ORDER BY occurred_at, id;

SELECT * FROM neural_executions WHERE execution_id = '<id n8n>';
```

O contrato deste piloto assina `<timestamp Unix em segundos>.<corpo JSON exato>` com HMAC-SHA256 em hexadecimal minúsculo. A janela da assinatura é de cinco minutos e a rota aceita corpos de até 4 KiB. O CMS monta a chave do evento a partir de origem, execução, etapa e tipo. A validação aceita somente os campos e valores do piloto, limitando a telemetria a metadados operacionais.

Uma falha nos nós de telemetria fica visível na execução do n8n. Para reenviar um evento, use os mesmos dados do acontecimento e uma assinatura com timestamp atual. A rota limita novas gravações a 120 eventos por minuto e aceita o reenvio de eventos já registrados. Para desativar a ingestão, remova `NEURAL_ENABLED=true` do CMS de teste.

### Telemetria das editorias

A migração 0074 registra um agente e uma missão para cada editoria cadastrada no banco de telemetria. O workflow usa o slug da editoria que processou a pauta. Em Cidades, envie `correlation_id: editorial-cidades`, `agent_id: reporter-editorial-cidades` e `source_id: diario-editorial-cidades`. A rota de ingestão e a assinatura HMAC são as mesmas do piloto.

Emita os marcos nos pontos em que o workflow executa o trabalho correspondente. O contrato de telemetria das editorias transporta etapa, tipo de evento, execução e horário. O piloto documental de Política aceita também o dossiê na etapa de evidências.
