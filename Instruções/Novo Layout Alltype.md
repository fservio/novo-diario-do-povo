According to a document from 2026-01-07, o caminho correto é **não começar o projeto do zero**. Você começa **o layout do zero**, mantendo intactos: banco D1, repositories, routes, APIs, paywall, ads, settings CMS, R2 e webhooks. O projeto já está estruturado com Hono, TypeScript, Cloudflare D1, KV, R2, Zod e Vitest, então o layout deve ser tratado como uma camada substituível acima do motor existente.

## Decisão técnica

Você deve fazer uma **refatoração de casca pública**, não uma reescrita.

O que fica preservado:

```txt
functions/index.ts       → rotas
packages/core/db/*       → consultas e banco
packages/core/paywall/*  → regras de acesso
packages/core/ads/*      → slots e anti-CLS
packages/core/seo/*      → JSON-LD, canonical, OG
packages/core/storage/*  → imagens/R2
api/*                    → endpoints existentes
```

O que pode ser reconstruído do zero:

```txt
packages/core/web/layout.ts
packages/core/web/home.ts
packages/core/web/category.ts
packages/core/web/article.ts
public/static/alltype.css
```

A documentação mostra que já existe uma separação saudável entre `packages/core/web` para renderização e `packages/core/db` para dados, com módulos como `layout.ts`, `home.ts`, `category.ts`, `article.ts`, `db/home.ts`, `db/category.ts` e `db/article.ts`.

---

# Plano seguro para começar o novo layout

## 1. Criar uma branch limpa

Não mexa direto na branch principal.

```bash
git checkout -b redesign/alltype-clean-shell
```

Antes de alterar, rode:

```bash
npm run typecheck
npm test
npm run build
node validate.js
```

Isso cria o “estado saudável” inicial.

---

## 2. Criar um novo layout público paralelo

Em vez de editar agressivamente o layout atual, crie um arquivo novo:

```txt
packages/core/web/layout-alltype.ts
```

Ele deve exportar:

```ts
export function renderAlltypeLayout(params: {
  title: string
  description?: string
  bodyHtml: string
  baseUrl: string
  siteName: string
  navItems: Array<{
    label: string
    href: string
    active?: boolean
  }>
  nonce: string
  canonicalUrl?: string
  ogImage?: string
  extraHeadHtml?: string
  extraScriptsHtml?: string
}): string
```

Esse arquivo vira a nova “casca” do site.

Regra: **nenhuma página pública deve montar header/menu/footer por conta própria**.

---

## 3. Criar o CSS do novo sistema visual

Crie um CSS limpo:

```txt
public/static/alltype.v2.css
```

Comece só com tokens e componentes globais:

```css
:root {
  --dp-bg: #FDF8F8;
  --dp-text: #1A1A1A;
  --dp-muted: #5F5F5F;
  --dp-border: #1A1A1A;
  --dp-gold: #D8CBA8;
  --dp-surface: #F2EFE7;

  --dp-max: 1280px;
  --dp-hairline: 1px solid var(--dp-border);
  --dp-thickline: 4px solid var(--dp-border);

  --dp-font-serif: Georgia, "Times New Roman", serif;
  --dp-font-sans: Arial, Helvetica, sans-serif;
}

body {
  margin: 0;
  background: var(--dp-bg);
  color: var(--dp-text);
  font-family: var(--dp-font-sans);
}

.dp-shell {
  max-width: var(--dp-max);
  margin: 0 auto;
  padding: 0 24px;
}

.dp-header {
  border-bottom: var(--dp-thickline);
}

.dp-nav {
  border-top: var(--dp-thickline);
  border-bottom: var(--dp-hairline);
}
```

Não use classe antiga misturada com nova. Nada de `verge-card`, `orange`, `rounded`, `shadow`, se a decisão for AllType.

---

## 4. Preservar a nav pelo CMS

O menu não deve ser hardcoded. Ele deve continuar vindo de `home.fixed_sections`.

A documentação mostra que `home.fixed_sections` já controla nav e blocos da home, com fallback determinístico e validação por Zod.  Também há exemplos de reordenar seções, adicionar categoria, desabilitar seção e adicionar seção por tag via CMS.

Então o novo layout deve receber `navItems` já prontos, por exemplo:

```ts
const navItems = sections
  .filter((s) => s.enabled)
  .map((s) => ({
    label: s.title,
    href: s.type === 'tag'
      ? `/tag/${s.tagSlug}`
      : `/categoria/${s.slug}`,
    active: currentPath === `/categoria/${s.slug}`
  }))
```

---

## 5. Migrar página por página

Não refaça tudo de uma vez.

Ordem recomendada:

| Ordem | Página                  | Motivo                   |
| ----- | ----------------------- | ------------------------ |
| 1     | Categoria               | Mais simples que Home    |
| 2     | Artigo                  | Valida paywall, ads, SEO |
| 3     | Home                    | Mais complexa            |
| 4     | Tag/Autor/Assinar/Conta | Padronização final       |

A documentação confirma que Categoria e Artigo já usam renderer próprio, ads, SEO, paywall e markers de validação.  A Home é a mais arriscada porque concentra hot rail, blocos CMS-driven, drawer e múltiplos ads.

---

# Arquitetura-alvo

A estrutura ideal fica assim:

```txt
packages/core/web/
  layout-alltype.ts       ← shell público único
  components/
    header.ts             ← header único
    nav.ts                ← menu único
    footer.ts             ← footer único
    ad.ts                 ← wrapper visual de ads
    article-card.ts       ← card editorial
    newsletter.ts         ← box newsletter
  home.ts                 ← só conteúdo da home
  category.ts             ← só conteúdo da categoria
  article.ts              ← só conteúdo do artigo

public/static/
  alltype.v2.css          ← design system novo
```

A regra é simples:

```txt
Data Layer → Renderer da Página → Layout AllType → HTML final
```

Nunca:

```txt
Renderer da Página → query direta no DB
CSS da Página → header exclusivo
Home → menu próprio
Article → layout próprio
```

---

# Como preservar banco, rotas e APIs

## Banco

Não alterar migrations.

Não mexer em:

```txt
migrations/*
packages/core/db/*
```

A menos que falte algum dado editorial real. O banco já cobre posts, categorias, tags, autores, mídia, ads, settings, paywall, Asaas, newsletter e push.

## Rotas

Manter as mesmas URLs:

```txt
/
 /categoria/:slug
 /tag/:slug
 /autor/:slug
 /noticia/:slug
 /assinar
 /conta
 /rss.xml
 /sitemap-news.xml
 /api/*
```

As rotas SSR públicas já existem e devem continuar respondendo nos mesmos caminhos.

## APIs

Não tocar nas APIs.

Principalmente:

```txt
/api/health
/api/public/plans
/api/webhooks/asaas
/api/admin/*
```

A mudança de layout não deve afetar contratos JSON, autenticação, webhook, settings ou admin.

---

# Estratégia de feature flag

Para não quebrar produção, use uma flag de tema:

```ts
const theme = await getSetting(env, 'site.public_theme', 'public')
```

Valores:

```txt
legacy
alltype_v2
```

Na rota:

```ts
const html = theme === 'alltype_v2'
  ? renderAlltypeLayout({...})
  : renderPublicLayout({...})
```

Assim você testa o layout novo sem destruir o antigo.

---

# Prompt para passar ao desenvolvedor/agente

Use exatamente isto:

```txt
Refatore somente a camada visual pública do portal, preservando banco, rotas e APIs.

Objetivo:
Criar um novo layout AllType do zero, homogêneo, usando uma única casca pública para Home, Categoria, Artigo, Tag, Autor, Assinar e Conta.

Restrições obrigatórias:
1. Não alterar migrations.
2. Não alterar contratos de APIs.
3. Não alterar rotas públicas existentes.
4. Não alterar lógica de paywall.
5. Não alterar lógica de Ads Engine.
6. Não alterar integração Asaas.
7. Não remover CSP nonce.
8. Não remover escapeHtml/escapeAttr.
9. Não hardcodar menu; usar home.fixed_sections.
10. Não usar Tailwind CDN ou CDN de CSS.

Implementação:
1. Criar packages/core/web/layout-alltype.ts com renderAlltypeLayout().
2. Criar componentes públicos em packages/core/web/components/.
3. Criar public/static/alltype.v2.css com tokens --dp-*.
4. Migrar primeiro category.ts para o novo layout.
5. Migrar article.ts mantendo JSON-LD, paywall, ads e breadcrumb.
6. Migrar home.ts por último.
7. Adicionar setting public site.public_theme = "legacy" | "alltype_v2".
8. Atualizar functions/index.ts apenas para escolher o renderer pelo tema, sem alterar URLs.
9. Atualizar validate.js para garantir que todas as páginas públicas usam o mesmo shell.
10. Rodar npm run typecheck, npm test, npm run build e node validate.js.
```

---

# Checklist de aceite

Antes de considerar pronto:

```bash
npm run typecheck
npm test
npm run build
node validate.js
```

Depois:

```bash
curl http://localhost:3000/
curl http://localhost:3000/categoria/brasil
curl http://localhost:3000/noticia/bem-vindo-ao-jornal-demo
curl http://localhost:3000/tag/breaking-news
curl http://localhost:3000/autor/redacao
curl http://localhost:3000/assinar
curl http://localhost:3000/api/health
```

E validação específica:

```bash
curl -I http://localhost:3000/ | grep -i content-security
curl http://localhost:3000/noticia/bem-vindo-ao-jornal-demo | grep 'application/ld+json'
curl http://localhost:3000/categoria/brasil | grep 'aria-current="page"'
curl http://localhost:3000/ | grep 'alltype.v2.css'
```

---

## Decisão final

Você começa do zero **somente no layout**, não no sistema.

A melhor rota é:

```txt
Novo Design System → Novo Shell Público → Migração por página → Feature flag → Validação → Produção
```

Isso preserva o que já tem valor: banco, rotas, APIs, SEO, paywall, Asaas, ads e CMS. Você troca a “pele” e a composição visual, sem quebrar o motor do jornal.
