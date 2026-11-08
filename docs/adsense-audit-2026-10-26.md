# AdSense — auditoria e correções de 26/10/2026

## Evidências da conta

Relatório dos últimos 30 dias, site verificado dopovo.com.br (não um recorte
exclusivo de diario.dopovo.com.br):

| Método | Impressões | Receita estimada | RPM de impressões | Active View |
|---|---:|---:|---:|---:|
| Automáticos | 12.255 | US$ 6,29 | US$ 0,51 | 86,45% |
| Manuais | 21.620 | US$ 3,56 | US$ 0,16 | 46,15% |

Domínio principal aprovado e ads.txt autorizado. Automáticos e otimização
automática ativados. Âncora, coluna lateral e vinheta ativos; in-page automático
inativo. Nenhuma alteração feita nesses controles da conta.

## Consentimento — pendência confirmada

A Central de políticas aponta “Requisito de consentimento: sem CMP” para
diario.dopovo.com.br, desde 20/10, com personalização restrita e aproximadamente
17 mil solicitações de anúncios no item (últimos sete dias).

A lista de mensagens mostrou que a mensagem publicada é de capitalteresina.com.br.
A “Mensagem do RGPD” associada a dopovo.com.br está em rascunho desde 27/04/2022,
em português pt-PT. O editor ficou em carregamento, mesmo após recarregar a
página. Não foi possível revisar nem publicar a mensagem. Nenhum consentimento
foi simulado, e nenhuma seleção de finalidade/fornecedor foi alterada.

Próximo passo: abrir a mensagem em rascunho, revisar domínio/subdomínio, política
de privacidade, idiomas e opções do leitor, publicar e testar a CMP. O alerta
permanece pendente até confirmar a implantação; não criar mensagem duplicada
sem revisar a existente.

Referência: https://support.google.com/adsense/answer/13554116?hl=pt-BR

## Correções técnicas

Consulta somente de leitura ao banco confirmou sete blocos ativos. Cinco têm
lazy=1: article_inread_1, article_footer, home_infeed_1, home_infeed_2 e
home_sidebar_1. A rotina anterior inicializava todos juntos, ignorando lazy.

- Respeitar lazy usando IntersectionObserver com margem de 300px, sem refresh
  de anúncios. Os blocos superiores continuam antecipados.
- Não solicitar anúncio em container sem largura; tentar quando visível.
- Evitar inicialização duplicada; fallback por scroll/resize para navegadores
  sem IntersectionObserver e remoção dos listeners após concluir.
- Remover limites fixos de 100px que podiam recortar anúncios no tema clássico.
- Preservar reservas de altura por bloco e remover recorte de pintura do wrapper
  editorial; atualizar a versão da folha CSS para evitar cache antigo.

Validação: 31 testes selecionados, incluindo execução do loader em ambiente
simulado para lazy/eager, duplicidade, containers ocultos e fallback; typecheck
aprovado e build concluído. Não houve clique em anúncios reais.

## Medição após implantação

Comparar períodos equivalentes e segmentar domínio, dispositivo e bloco.
Acompanhar receita total, RPM, Active View, impressões, CLS e LCP. A redução de
impressões fora da tela pode elevar a proporção de visibilidade sem garantir
mais receita; nenhum ganho financeiro foi comprovado nesta etapa.

Referências técnicas:
https://support.google.com/adsense/answer/9183362?hl=en
https://support.google.com/adsense/answer/6219980?hl=en-GB

## Publicação

Deploy de produção concluído em 26/10/2026: `4104ec7e`, projeto
`novo-diario-do-povo`, branch `Versão-1.2`. Verificação HTTP no domínio oficial:
home 200, observer e proteção de largura presentes no HTML, nova versão CSS e
wrapper editorial sem recorte de pintura confirmados. Isso verifica os arquivos
servidos; efeitos reais sobre anúncios e métricas permanecem em avaliação.
