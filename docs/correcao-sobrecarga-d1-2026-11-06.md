# Sobrecarga do D1 e recomendações nas últimas 24 horas

Publicado em 6 de novembro de 2026, deployment `2d8871f0`, sobre a base `8443dfea`.

## Diagnóstico

O erro informado ocorreu na leitura do usuário pelo ID no middleware de autenticação. Essa consulta usa a chave primária; a falha indica indisponibilidade temporária do banco compartilhado.

No D1 Insights, a consulta pública de matérias relacionadas era o principal consumo observado na janela de uma hora: 1.618 execuções, 131.153.136 linhas lidas, média de 81.058 linhas e 178 ms por execução. A condição com OR e a ordenação por prioridade percorriam o acervo antes de devolver quatro matérias. Esses valores identificam um gargalo relevante, sem provar que ele foi a única origem de todos os episódios.

Referência do provedor: https://developers.cloudflare.com/d1/observability/debug-d1/ . O erro de recursos numa janela de dez segundos representa sobrecarga temporária de CPU/memória.

## Comportamento publicado

- As recomendações usam exclusivamente matérias publicadas nas últimas 24 horas, incluindo o limite inicial, e excluem publicações futuras, rascunhos e noindex.
- Vínculos explícitos nas duas direções têm prioridade dentro desse intervalo. O restante vem da mesma editoria, por data decrescente, sem duplicatas.
- A data é interpretada em UTC, aceitando timestamps ISO e SQLite; a janela acompanha o instante da consulta.
- A busca usa os índices existentes de editoria e relacionamentos. Os metadados completos só são associados depois da seleção limitada.
- Falhas de sobrecarga que chegam ao tratamento global retornam HTTP 503, Retry-After de 15 segundos e no-store. Navegações HTML recebem uma mensagem legível; APIs recebem DB_TEMPORARILY_BUSY, sem stack. Operações de escrita não são repetidas automaticamente pelo servidor.

## Validação

A consulta final, com janela de 24 horas, devolveu quatro matérias em uma execução remota: 158 linhas lidas, zero escritas e 1,0268 ms de SQL. Comparada à média anterior, essa amostra representa aproximadamente 99,8% menos leituras. O consumo varia com a quantidade de matérias da editoria no período.

Passaram 17 testes de recomendações, caminho de leitura e respostas de sobrecarga, além da verificação TypeScript. Os testes incluem limites de tempo, formatos de data, prioridade, vínculo reverso, exclusão de rascunhos/noindex/futuros e plano de consulta com os índices.

Após a publicação, a página de login, uma notícia e /guias responderam HTTP 200, sem erro D1. A verificação do login cobre a abertura do formulário, sem simular uma sessão autenticada. O pacote preservou 333 rotas e os arquivos estáticos da produção; somente _worker.js mudou.

Evidências: artifacts/db-overload/reads-1h.json, related-24h-result.json, tests.txt, typecheck.txt e live-check.json. Manifesto publicado: artifacts/db-overload-release-v2/release.json. Não foram alterados fluxos n8n nem executadas migrações para esta correção.
