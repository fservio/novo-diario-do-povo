# Piloto de apuração documental em Política

O workflow `IFjhJUTCGPTlo4db` pode ser disparado manualmente no n8n. A missão analisa a proposta de voto distrital misto noticiada pelo Diário do Povo em novembro de 2026. O fluxo consulta as duas matérias, o Senado e uma busca delimitada de PECs na Câmara, confirma o modelo `gpt-6-luna` e gera um dossiê e dois rascunhos internos. A redação dos dois rascunhos usa o mesmo modelo e as mesmas instruções. O segundo recebe também as evidências e pendências do dossiê.

O nó **Conferir evidências** exige que o trecho citado apareça no texto recuperado de uma fonte institucional. O Editor Executivo ainda precisa conferir se a passagem sustenta a afirmação e se o ganho informativo vale a inclusão. Uma busca sem resultados permanece uma consulta delimitada. Ela não prova que uma PEC inexiste.

O último nó entrega o resultado na execução do n8n. Para guardar esse resultado em um CMS de teste, aplique a migração `0067_editorial_reporter_pilot.sql` e envie o JSON desse nó a `POST /api/n8n/reporter-pilot/runs` usando a credencial interna do n8n. Consulte o registro por `GET /api/n8n/reporter-pilot/runs/{execution_id}`. Cada execução tem um registro. Repetir o mesmo envio devolve o mesmo identificador.

Abra os rascunhos lado a lado e marque os trechos em que B acrescenta um fato útil ou esclarece uma dúvida de A. Confira cada achado com a fonte registrada no dossiê. A comparação faz parte do piloto e os rascunhos ficam na saída do workflow ou no registro interno do teste.

## Fluxo em produção

Os Redatores por Editoria chamam o workflow `Sx4gG8Kjb8kBnemf` para pautas de Política. A apuração começa quando a fonte traz uma referência única a PL, PLP ou PEC no formato número/ano. A primeira consulta localiza a proposição e a segunda recupera a ficha da Câmara. O dossiê segue com o briefing e a ficha entra entre as fontes da revisão. Uma resposta incompleta do modelo, uma ficha indisponível ou uma referência ambígua permite que a redação use o briefing original.

Em produção, consulte o dossiê nas execuções do repórter e dos redatores no n8n. A API e o D1 descritos acima serviram ao piloto local.
