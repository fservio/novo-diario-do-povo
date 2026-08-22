# REFINAMENTO VISUAL — Tema AllType v1.3 baseado em Modern Editorial Brutalism

A implementação do tema AllType como opção no CMS está conceitualmente aprovada. Agora é necessário refinar a direção visual com base no design system anexado chamado:

```text
Modern Editorial Brutalism
```

Este design system passa a ser a referência principal do tema AllType.

## 1. Nova definição do AllType

O AllType NÃO deve ser tratado como um tema simplesmente dark.

O AllType deve ser uma interface editorial brutalista moderna, com base clara, tipografia dominante, grid aparente e estética de jornal impresso contemporâneo.

A personalidade visual correta é:

* jornalística;
* institucional;
* urgente;
* editorial;
* brutalista;
* tipográfica;
* monocromática com uso pontual de azul institucional;
* inspirada em capa de jornal e não em portal magazine;
* sem excesso de fotos;
* sem cards arredondados;
* sem sombras;
* sem estética SaaS;
* sem aparência de blog.

## 2. Fonte de verdade visual

O Markdown anexado “Modern Editorial Brutalism” é a fonte de verdade para o refinamento visual do AllType.

Os HTMLs anteriores continuam úteis como referência estrutural de tela, mas o design system atual prevalece sobre eles.

Prioridade visual:

1. Modern Editorial Brutalism — design system principal;
2. Minimalista Google Style — base funcional a preservar;
3. HTMLs de referência — apenas inspiração de composição;
4. Padrão Magazine — descartado.

## 3. Paleta oficial do AllType

Atualizar `public/static/alltype.css` com base nos seguintes tokens:

```css
:root {
  --alltype-surface: #FDF8F8;
  --alltype-surface-dim: #DDD9D8;
  --alltype-surface-bright: #FDF8F8;

  --alltype-surface-container-lowest: #FFFFFF;
  --alltype-surface-container-low: #F7F3F2;
  --alltype-surface-container: #F1EDEC;
  --alltype-surface-container-high: #EBE7E6;
  --alltype-surface-container-highest: #E5E2E1;

  --alltype-background: #FDF8F8;
  --alltype-on-background: #1C1B1B;

  --alltype-text: #1C1B1B;
  --alltype-text-variant: #444748;

  --alltype-black: #1A1A1A;
  --alltype-deep-black: #000000;

  --alltype-outline: #747878;
  --alltype-outline-variant: #C4C7C7;

  --alltype-primary: #000000;
  --alltype-on-primary: #FFFFFF;

  --alltype-primary-container: #1C1B1B;
  --alltype-on-primary-container: #858383;

  --alltype-brand-blue: #004A99;
  --alltype-secondary: #255DAD;
  --alltype-secondary-container: #79A9FD;
  --alltype-on-secondary-container: #003C7E;

  --alltype-error: #BA1A1A;
  --alltype-on-error: #FFFFFF;

  --alltype-border: #1A1A1A;
  --alltype-border-muted: #C4C7C7;

  --alltype-radius: 0px;
  --alltype-line: 1px;
  --alltype-heavy-line: 4px;
}
```

## 4. Regra sobre dark mode

Não aplicar AllType como tema dark principal.

O AllType deve ser predominantemente claro/off-white, com blocos invertidos em preto ou azul apenas para ênfase editorial.

Usar preto ou azul institucional apenas em:

* masthead;
* breaking news;
* blocos especiais;
* chamadas editoriais de alta importância;
* botões primários;
* marcações institucionais.

O fundo principal deve lembrar papel editorial, não tela dark.

## 5. Tipografia oficial do AllType

Substituir a proposta anterior de Bodoni/Literata/Fira como fonte principal por:

```css
:root {
  --alltype-font-display: "Playfair Display", Georgia, "Times New Roman", serif;
  --alltype-font-headline: "Playfair Display", Georgia, "Times New Roman", serif;
  --alltype-font-body: "Source Serif 4", Georgia, "Times New Roman", serif;
  --alltype-font-ui: "Inter", Arial, Helvetica, sans-serif;
}
```

Escala tipográfica recomendada:

```css
:root {
  --alltype-display-xl-size: 72px;
  --alltype-display-xl-line: 76px;
  --alltype-display-xl-weight: 900;
  --alltype-display-xl-tracking: -0.02em;

  --alltype-display-lg-size: 48px;
  --alltype-display-lg-line: 52px;
  --alltype-display-lg-weight: 800;
  --alltype-display-lg-tracking: -0.01em;

  --alltype-display-mobile-size: 36px;
  --alltype-display-mobile-line: 40px;

  --alltype-headline-md-size: 32px;
  --alltype-headline-md-line: 36px;
  --alltype-headline-md-weight: 700;

  --alltype-headline-sm-size: 24px;
  --alltype-headline-sm-line: 28px;
  --alltype-headline-sm-weight: 700;

  --alltype-body-lg-size: 20px;
  --alltype-body-lg-line: 32px;

  --alltype-body-md-size: 17px;
  --alltype-body-md-line: 26px;

  --alltype-ui-label-size: 14px;
  --alltype-ui-label-line: 16px;
  --alltype-ui-label-weight: 700;

  --alltype-ui-label-sm-size: 12px;
  --alltype-ui-label-sm-line: 14px;
  --alltype-ui-label-sm-tracking: 0.05em;

  --alltype-metadata-size: 13px;
  --alltype-metadata-line: 16px;
}
```

## 6. Carregamento de fontes

Antes de carregar fontes externas, verificar CSP e performance.

Fontes desejadas:

* Playfair Display;
* Source Serif 4;
* Inter.

Se usar Google Fonts, utilizar estratégia performática:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

E usar `display=optional` ou equivalente.

Não quebrar CSP, anúncios, consentimento ou Core Web Vitals.

Se houver risco, usar fallback nativo primeiro e documentar.

## 7. Layout e grid

O AllType deve usar grid editorial brutalista.

Regras:

* 12 colunas no desktop;
* 8 colunas no tablet;
* 4 colunas no mobile;
* gutter de 1px;
* bordas visíveis;
* separadores estruturais;
* blocos assimétricos;
* zero sombra;
* zero radius;
* blocos com aparência de página diagramada.

Tokens de spacing:

```css
:root {
  --alltype-grid-margin: 24px;
  --alltype-grid-gutter: 1px;

  --alltype-stack-xs: 4px;
  --alltype-stack-sm: 8px;
  --alltype-stack-md: 16px;
  --alltype-stack-lg: 32px;
  --alltype-stack-xl: 64px;
}
```

## 8. Bordas e divisores

As bordas são o elemento estrutural central do tema.

Implementar classes utilitárias em `alltype.css`:

```css
.alltype-border {
  border: 1px solid var(--alltype-border);
}

.alltype-border-bottom {
  border-bottom: 1px solid var(--alltype-border);
}

.alltype-border-top {
  border-top: 1px solid var(--alltype-border);
}

.alltype-heavy-border-bottom {
  border-bottom: 4px solid var(--alltype-border);
}

.alltype-grid {
  display: grid;
  gap: 1px;
  background: var(--alltype-border);
}

.alltype-grid > * {
  background: var(--alltype-background);
}
```

Evitar border radius em todos os componentes.

```css
.theme-alltype *,
.theme-alltype *::before,
.theme-alltype *::after {
  border-radius: 0 !important;
}
```

Usar `!important` apenas se necessário para neutralizar o estilo herdado do tema Minimalista Google Style.

## 9. Elevação e profundidade

Não usar:

* shadow;
* box-shadow;
* blur decorativo;
* glassmorphism;
* gradientes decorativos;
* glow;
* cards flutuantes.

A sensação de profundidade deve vir apenas de:

* blocos invertidos;
* contraste;
* hierarquia tipográfica;
* bordas;
* grid;
* empilhamento visual.

## 10. Botões

Botões AllType:

```css
.theme-alltype .btn-primary {
  background: var(--alltype-black);
  color: var(--alltype-surface);
  border: 1px solid var(--alltype-black);
  border-radius: 0;
  font-family: var(--alltype-font-ui);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.theme-alltype .btn-secondary {
  background: transparent;
  color: var(--alltype-black);
  border: 1px solid var(--alltype-black);
  border-radius: 0;
  font-family: var(--alltype-font-ui);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

Hover:

* inversão imediata de cor;
* transição muito curta, no máximo 50ms;
* sem animação decorativa.

## 11. Inputs e campos

Campos do AllType:

* border-bottom de 1px por padrão;
* ou retângulo 1px para busca;
* labels em Inter Bold;
* labels em caixa alta;
* sem cantos arredondados;
* sem sombra;
* sem fundo colorido decorativo.

## 12. Chips e tags

Tags de editoria:

* não usar pílulas;
* usar retângulos pequenos;
* texto em Inter uppercase;
* categoria pode usar azul institucional ou preto;
* evitar excesso de cores.

Exemplo:

```css
.theme-alltype .category-chip {
  display: inline-block;
  background: var(--alltype-black);
  color: var(--alltype-surface);
  padding: 4px 6px;
  font-family: var(--alltype-font-ui);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

## 13. Masthead

O cabeçalho do AllType deve parecer institucional e jornalístico.

Opções visuais aceitáveis:

1. Masthead em fundo off-white com bordas pretas fortes;
2. Masthead invertido em preto;
3. Masthead com faixa azul institucional `#004A99`.

Usar azul institucional com parcimônia.

Não criar header com aparência SaaS.

Não usar sombra.

Não usar bordas arredondadas.

## 14. Homepage AllType

Refinar a homepage com base no sistema Modern Editorial Brutalism.

Requisitos:

* fundo off-white;
* masthead forte;
* linha inferior de 4px no topo ou na separação da dobra principal;
* manchete principal em Playfair Display 72px no desktop;
* grid assimétrico de 12 colunas;
* notícias como células de grid;
* bordas de 1px;
* lead story com borda inferior pesada de 4px;
* blocos invertidos para breaking news ou destaque;
* ausência de imagem dominante;
* ausência de card arredondado;
* ausência de sombra;
* mais lidas numeradas;
* opinião em bloco tipográfico;
* editorias separadas por linhas.

A homepage deve funcionar visualmente mesmo sem fotografias.

## 15. Página de editoria

Refinar a página de editoria com:

* título monumental;
* fundo off-white;
* grid assimétrico;
* feed com células tipográficas;
* bordas 1px;
* título da editoria em caixa alta ou serifada monumental;
* coluna lateral para “Mais Lidas” ou “Opinião”, se houver dados;
* paginação preservada;
* IDs preservados.

Preservar obrigatoriamente:

```text
categoryTitle
categoryList
pagination
```

## 16. Página de artigo

A página de artigo deve ser o ponto mais refinado do AllType.

Direção:

* fundo geral off-white;
* corpo de matéria em Source Serif 4;
* largura de leitura entre 680px e 760px;
* H1 em Playfair Display;
* metadados em Inter;
* borda superior/inferior estrutural;
* citações com borda forte;
* imagens sem radius;
* legendas em Inter;
* paywall preservado;
* anúncios preservados.

Não usar superfície creme separada com cara de card arredondado. A página inteira já deve parecer papel editorial.

Preservar obrigatoriamente:

```text
articleTitle
articleBody
```

## 17. Últimas notícias

A página de últimas notícias deve ser simples e robusta.

Direção:

* timeline cronológica;
* horários em Inter;
* títulos em Playfair Display;
* corpo/resumo em Source Serif 4;
* divisores de 1px;
* sem scripts inline;
* sem alternância complexa se isso aumentar risco;
* linha vertical opcional;
* fallback em lista brutalista linear.

Prioridade: estabilidade, responsividade e dados reais.

## 18. Relação com Minimalista Google Style

O AllType é uma opção nova no CMS.

Não substituir o Minimalista Google Style.

Não apagar `/static/minimal.css`.

Não apagar CSS funcional existente.

Não alterar tema padrão.

Fallback obrigatório:

```typescript
const activeTheme = themeFromCms === "alltype" ? "alltype" : "minimal";
```

ou equivalente conforme arquitetura real.

## 19. CMS

No CMS, o campo “Tema do Site” deve oferecer apenas:

```text
minimal — Minimalista (Google Style)
alltype — AllType
```

Não permitir:

* magazine;
* default;
* valores arbitrários;
* URLs externas;
* nomes livres de CSS.

Se o CMS receber valor inválido, normalizar para `minimal`.

## 20. Arquivos autorizados

Alterar preferencialmente:

```text
packages/core/admin/settings.ts
packages/core/web/layout.ts
packages/core/web/home.ts
packages/core/web/category.ts
packages/core/web/article.ts
packages/core/web/ultimas.ts
public/static/alltype.css
tests/unit/public-layout.test.ts
```

Se precisar alterar outro arquivo, justificar antes.

Não alterar sem necessidade:

```text
functions/index.ts
wrangler.toml
package.json
package-lock.json
packages/core/db/
.env
.env.local
scripts de deploy
bindings
rotas críticas
```

## 21. Proibições técnicas

Não copiar dos protótipos:

* Tailwind CDN;
* script `tailwind-config`;
* scripts inline;
* imagens mockadas;
* notícias mockadas;
* `href="#"`;
* Material Symbols se comprometer CSP/performance;
* dados fictícios;
* estruturas estáticas substituindo SSR.

## 22. IDs críticos

Preservar:

```text
mainContent
coverBtn
coverOverlay
coverPanel
coverClose
articleTitle
articleBody
categoryTitle
categoryList
pagination
```

## 23. Testes obrigatórios

Atualizar testes apenas para cobrir:

1. tema `minimal`;
2. tema `alltype`;
3. tema inválido caindo para `minimal`;
4. CSS correto carregado para cada tema;
5. IDs críticos preservados.

Não reduzir cobertura.

Não apagar testes importantes.

## 24. Validação final

Executar:

```bash
npm test
npm run typecheck
npm run build
git status
git diff --stat
git diff --name-only
```

A tarefa só estará pronta se:

* AllType aparecer como opção no CMS;
* Minimalista continuar como padrão;
* fallback funcionar;
* `alltype.css` existir;
* AllType seguir o Modern Editorial Brutalism;
* não houver Tailwind CDN;
* não houver scripts inline copiados;
* não houver dados mockados;
* testes passarem;
* typecheck passar;
* build passar.

## 25. Commit

Não usar:

```bash
git add .
```

Usar staging seletivo.

Commit sugerido:

```bash
git commit -m "feat: refine AllType theme with modern editorial brutalism"
```

Não fazer merge na main.

Não fazer deploy em produção.

## 26. Relatório final

Entregar:

1. Branch atual;
2. Arquivos alterados;
3. Confirmação de AllType como opção no CMS;
4. Confirmação de Minimalista como padrão;
5. Confirmação do fallback;
6. Confirmação de que o AllType usa base off-white, não dark;
7. Confirmação da tipografia Playfair Display, Source Serif 4 e Inter;
8. Confirmação da política zero-radius;
9. Confirmação de bordas 1px e masthead com separação forte;
10. Confirmação de que Tailwind CDN não foi adicionado;
11. Confirmação de que scripts inline não foram copiados;
12. Confirmação de que dados mockados não foram inseridos;
13. Resultado de `npm test`;
14. Resultado de `npm run typecheck`;
15. Resultado de `npm run build`;
16. Resultado de `git status`;
17. Riscos residuais.
