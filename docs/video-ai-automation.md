# Produção automática de roteiros

Ao criar um projeto, o Estúdio gera e revisa o roteiro automaticamente. Projetos existentes podem executar o mesmo ciclo pelo botão **Executar produção automática**. O fluxo mantém o modelo e as credenciais configurados na integração editorial.

## Critérios e reescrita

- O prompt estabelece seleção de fatos, lide concreto, atribuição, linguagem oral e estruturas próprias para boletim, reportagem, explicador e comentário. A seleção editorial é registrada nas notas da geração.
- Uma chamada separada revisa a fonte e o roteiro completo, incluindo cartelas e orientações visuais. Exige fidelidade 5/5 e relevância, estrutura e oralidade de pelo menos 4/5, veredito positivo e ausência de problemas pendentes.
- O servidor também verifica duração máxima de 110% do alvo, funções disponíveis, sequência, transparência, lacunas e existência literal das citações na fonte. Roteiros podem ser mais curtos quando a fonte não sustenta a duração.
- Reprovação editorial provoca reescrita usando o roteiro e o parecer anteriores. Há no máximo três gerações e três revisões por execução. Cada chamada conta para o limite diário compartilhado com a Redação IA.
- Erros da API, respostas incompletas/recusas, limite diário e problemas persistentes bloqueiam a saída. As versões e operações ficam no histórico. Não há liberação baseada em resolução humana de alertas.
- Apenas a versão mais recente, liberada automaticamente e com a matéria-fonte ainda atual e disponível, pode ser copiada ou baixada. Versões legadas precisam passar pelo novo fluxo.

## Implantação e operação

Aplicar `migrations/0042_video_ai_automation.sql` antes de disponibilizar o código. A tabela de leases impede duas execuções simultâneas no mesmo projeto. O lease expira em dez minutos caso uma execução seja interrompida; o encerramento normal o remove.

A execução é síncrona à requisição: a página informa o processamento e deve permanecer aberta. Cada chamada à IA tem limite de 55 segundos; seis chamadas podem levar vários minutos. Não há fila persistente nem retomada automática após fechamento da conexão. Uma falha deixa o projeto bloqueado e permite uma nova execução. O estado `review` representa processamento ou bloqueio; `ready` representa liberação automática. Aprovações automáticas não são atribuídas a um editor humano.

A produção de vídeo e o envio ao HeyGen continuam fora deste fluxo: a saída é o roteiro TXT/CSV ou as falas para copiar. Não há publicação automática de vídeo.

## Validação e limites

Os testes cobrem aprovação, reescrita, limite de tentativas, orçamento, erro de API, concorrência, dados antigos e bloqueio de exportações. As respostas da IA são simuladas nos testes; isso valida a orquestração e os controles, não mede a qualidade real de um modelo. Comparar roteiros reais de diferentes editorias é necessário para calibrar os critérios editoriais. A revisão verifica fidelidade à matéria, não a veracidade externa da matéria.

O tratamento de resposta incompleta e recusa segue a [documentação oficial de saídas estruturadas](https://developers.openai.com/api/docs/guides/structured-outputs).
