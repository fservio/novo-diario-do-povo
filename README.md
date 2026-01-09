# 🗞️ Jornal - Portal de Notícias Profissional

> Sistema completo de jornal digital com paywall, integração ASAAS, CMS headless, automação n8n, SEO extremo e monetização via ads.

## 📋 Índice

- [Características](#características)
- [Stack Tecnológica](#stack-tecnológica)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Desenvolvimento](#desenvolvimento)
- [Deploy](#deploy)
- [Arquitetura](#arquitetura)
- [Funcionalidades](#funcionalidades)
- [Testes](#testes)
- [Manutenção](#manutenção)

---

## ✨ Características

### Core

- ✅ **SSR Ultrarrápido**: HTML-first com JS mínimo para Core Web Vitals perfeitos
- ✅ **SEO Extremo**: Sitemaps (geral + news), RSS, JSON-LD, canonical correto
- ✅ **Paywall Metered/Hard**: Sistema de assinatura com ASAAS integrado
- ✅ **CMS Headless**: Admin completo para posts, categorias, settings, ads, paywall
- ✅ **Automação n8n**: Webhook seguro com HMAC + idempotência + R2 pipeline
- ✅ **R2 Storage**: Upload, variantes responsivas, serving otimizado

### Monetização

- ✅ **AdSense + GAM**: Slots configuráveis, anti-CLS, lazy-load, targeting
- ✅ **Assinaturas ASAAS**: Gerenciamento completo via CMS, webhooks, entitlements
- ✅ **Paywall Leve**: Metered (limite mensal) + Hard (assinantes only)

### Extras

- ✅ **Newsletter**: Captura, double opt-in, segmentação
- ✅ **Push Notifications**: VAPID, segmentação, opt-out
- ✅ **Web Stories**: Formato Google Web Stories
- ✅ **Liveblogs**: Atualizações em tempo real
- ✅ **Hubs Editoriais**: Páginas curadas

---

## 🚀 Stack Tecnológica

| Tecnologia | Uso |
|------------|-----|
| **Hono** | Framework web edge-first |
| **TypeScript** | Type-safety + ESM |
| **Cloudflare Pages** | Hosting + Functions |
| **Cloudflare D1** | Database SQLite distribuído |
| **Cloudflare KV** | Cache + configs + rate limiting |
| **Cloudflare R2** | Object storage (mídia) |
| **Zod** | Validação de schemas |
| **Vitest** | Testes unitários + integração |
| **TailwindCSS** | Styling (via CDN) |

---

## 📦 Pré-requisitos

- **Node.js** 20+ 
- **npm** ou **pnpm**
- **Cloudflare Account** (free tier funciona)
- **Wrangler CLI** instalado globalmente

```bash
npm install -g wrangler
```

---

## 🔧 Instalação

### 1. Clonar/Inicializar Repositório

```bash
cd /home/user/webapp
git init
git add .
git commit -m "Initial commit"
```

### 2. Instalar Dependências

```bash
npm install
```

### 3. Configurar Environment Variables

```bash
cp .dev.vars.example .dev.vars
```

Edite `.dev.vars` e preencha as variáveis obrigatórias:

```bash
JWT_SECRET=sua-chave-secreta-minimo-32-chars
ADMIN_BOOTSTRAP_EMAIL=admin@exemplo.com
ADMIN_BOOTSTRAP_PASSWORD=SenhaForte123!
N8N_WEBHOOK_SECRET=sua-chave-secreta-n8n
R2_BUCKET_NAME=jornal-media
PUBLIC_BASE_URL=http://localhost:3000
CF_ENV=dev
```

---

## ⚙️ Configuração

### 1. Criar Database D1

```bash
# Local (dev)
npm run db:migrate:local

# Production
wrangler d1 create jornal-production
# Copiar o database_id para wrangler.jsonc

npm run db:migrate:prod
```

### 2. Criar KV Namespace

```bash
wrangler kv:namespace create jornal_KV
wrangler kv:namespace create jornal_KV --preview

# Copiar IDs para wrangler.jsonc
```

### 3. Criar R2 Bucket

```bash
wrangler r2 bucket create jornal-media
```

### 4. Atualizar `wrangler.jsonc`

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "jornal-production",
      "database_id": "SEU_DATABASE_ID_AQUI"
    }
  ],
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "SEU_KV_ID_AQUI",
      "preview_id": "SEU_KV_PREVIEW_ID_AQUI"
    }
  ]
}
```

### 5. Popular Banco de Dados

```bash
npm run db:seed
```

---

## 💻 Desenvolvimento

### Iniciar Servidor Local

```bash
# Build + Start com PM2
npm run dev

# Ou manualmente:
npm run build
pm2 start ecosystem.config.cjs

# Verificar logs
pm2 logs jornal --nostream
```

### Acessar

- **Frontend**: http://localhost:3000
- **Admin**: http://localhost:3000/admin (implementar rotas admin)
- **API Health**: http://localhost:3000/api/health

### Hot Reload

Wrangler dev detecta mudanças automaticamente. Para mudanças estruturais:

```bash
pm2 restart jornal
```

### Edição de Posts (CMS)

- Campo **Chapéu** obrigatório: uma única palavra (sem espaços) que aparece antes do título nas páginas públicas. O valor é normalizado automaticamente para maiúsculas.
- O conteúdo do post usa **Markdown**; preview e página pública convertem para HTML sanitizado, mantendo imagens e blockquotes.
- A modal de mídia insere imagens com `loading="lazy"` e reaproveita metadados de ALT/legenda cadastrados via /admin/media.
- Botão **Publicar agora** disponível na edição e na listagem para promover rascunhos rapidamente (com histórico de auditoria).

---

## 🚀 Deploy

### Deploy para Cloudflare Pages

```bash
# 1. Configurar project name no meta_info
meta_info(action="write", key="cloudflare_project_name", value="jornal")

# 2. Setup Cloudflare API (se ainda não configurado)
# Configurar via Deploy tab no dashboard

# 3. Criar projeto Pages
wrangler pages project create jornal \
  --production-branch main \
  --compatibility-date 2024-01-01

# 4. Deploy
npm run deploy:prod

# URLs geradas:
# - Production: https://jornal.pages.dev
# - Branch: https://main.jornal.pages.dev
```

### Configurar Secrets (Production)

```bash
# Secrets obrigatórios
wrangler pages secret put JWT_SECRET --project-name jornal
wrangler pages secret put N8N_WEBHOOK_SECRET --project-name jornal

# ASAAS (se usar bootstrap; recomendado via CMS settings)
wrangler pages secret put ASAAS_BOOTSTRAP_API_KEY --project-name jornal
wrangler pages secret put ASAAS_BOOTSTRAP_ENVIRONMENT --project-name jornal

# VAPID (Push)
wrangler pages secret put PUSH_VAPID_PUBLIC_KEY --project-name jornal
wrangler pages secret put PUSH_VAPID_PRIVATE_KEY --project-name jornal
```

### Migrations em Produção

```bash
npm run db:migrate:prod
```

---

## 🏗️ Arquitetura

```
webapp/
├── apps/
│   ├── web/          # (Futuro) Frontend separado
│   └── admin/        # (Futuro) Admin separado
├── functions/
│   └── index.ts      # Hono app principal
├── packages/
│   ├── core/
│   │   ├── auth/           # JWT, password hashing, magic link
│   │   ├── db/             # Repositories, query builders
│   │   ├── middleware/     # Auth, rate limit, security, logging
│   │   ├── seo/            # (A implementar) Sitemaps, RSS, JSON-LD
│   │   ├── ads/            # (A implementar) AdSense/GAM
│   │   ├── storage/        # R2 upload, variants, serving
│   │   ├── media/          # (A implementar) Image processing
│   │   ├── paywall/        # Metering, access check, entitlements
│   │   ├── newsletter/     # (A implementar) Subscribe, campaigns
│   │   ├── push/           # (A implementar) VAPID, subscriptions
│   │   ├── stories/        # (A implementar) Web Stories
│   │   └── integrations/
│   │       ├── n8n/        # (A implementar) Webhook handler
│   │       └── asaas/      # Client, webhooks, service layer
│   ├── ui/           # (Futuro) Componentes reutilizáveis
│   └── tests/        # Fixtures, helpers
├── migrations/
│   └── 0001_initial_schema.sql
├── public/
│   └── static/
│       ├── app.js
│       └── styles.css
├── scripts/
│   └── seed.sql
├── wrangler.jsonc
├── package.json
├── tsconfig.json
├── vite.config.ts
├── ecosystem.config.cjs
└── validate.js
```

---

## 🎯 Funcionalidades

### Editorial

- [x] Posts (draft/review/published/archived)
- [x] Chapéu editorial (prefixo curto antes do título, obrigatório)
- [x] Categorias (hierárquicas)
- [x] Tags
- [x] Autores
- [x] Revisões
- [x] Agendamento de publicação
- [ ] Liveblogs (tabelas criadas, implementar UI)
- [ ] Hubs editoriais
- [ ] Web Stories

### Paywall & Assinaturas

- [x] Metering (limite mensal anônimo/logado)
- [x] Hard paywall (somente assinantes)
- [x] Entitlements (acesso baseado em plano)
- [x] Integração ASAAS (criar customer/subscription)
- [x] Webhooks ASAAS (ativar/suspender/cancelar)
- [x] Signed cookies (anti-bypass)
- [ ] Página /assinar (UI)
- [ ] Página /conta (gerenciar assinatura)
- [ ] Magic link login

### Mídia & R2

- [x] Upload para R2
- [x] Serving otimizado (/i/:key)
- [x] Metadados (alt, credits)
- [ ] Variantes responsivas (320w, 640w, 1200w)
- [ ] Blur placeholder
- [ ] Image optimization

### SEO

- [x] Robots.txt dinâmico
- [x] Sitemap index
- [x] Sitemap geral
- [ ] Sitemap news (Google News)
- [ ] RSS feeds (geral + por editoria)
- [ ] JSON-LD (NewsArticle, Organization, BreadcrumbList)
- [ ] Open Graph + Twitter Cards

### Ads

- [x] Slots configurados no D1
- [ ] Renderização com placeholders anti-CLS
- [ ] Lazy load abaixo da dobra
- [ ] Targeting (categoria, tag, autor, subscriber)
- [ ] AdSense Auto Ads
- [ ] GAM (GPT)

### Automação

- [ ] n8n webhook (/api/webhooks/n8n/content)
- [ ] HMAC validation
- [ ] Idempotência (hash + webhook_events)
- [ ] Download + upload mídia externa
- [ ] Audit log

### Newsletter & Push

- [ ] Newsletter subscribe (/api/newsletter/subscribe)
- [ ] Double opt-in
- [ ] Segmentação (geral, premium)
- [ ] Push subscribe (/api/push/subscribe)
- [ ] VAPID
- [ ] Service worker

---

## 🧪 Testes

```bash
# Rodar todos os testes
npm test

# Testes com watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Estrutura de Testes (A implementar)

```
packages/tests/
├── unit/
│   ├── auth.test.ts
│   ├── paywall.test.ts
│   ├── asaas.test.ts
│   └── ...
└── integration/
    ├── api-health.test.ts
    ├── post-render.test.ts
    ├── webhook-asaas.test.ts
    └── ...
```

---

## 🔐 Segurança

### Checklist

- [x] JWT com HS256
- [x] Password hashing (SHA-256)
- [x] Rate limiting (KV-based)
- [x] CSRF protection (admin)
- [x] Security headers (CSP, X-Frame-Options, etc.)
- [x] Input validation (Zod em todas as entradas)
- [x] Sanitização de conteúdo (markdown/html)
- [x] Secrets no CMS (private settings)
- [x] Audit log (todas as ações críticas)
- [x] Anti-replay (webhooks)
- [x] Webhook signature validation (ASAAS)

---

## 📝 Configuração ASAAS via CMS

### Ambiente Sandbox (Desenvolvimento)

1. Criar conta no ASAAS Sandbox: https://sandbox.asaas.com
2. Gerar API Key: Configurações → Integrações → API Key
3. No CMS (quando implementado), ir em Settings → ASAAS:
   - Environment: `sandbox`
   - API Key: `cole_sua_api_key`
   - Webhook Token: `gerar_token_seguro`
4. Registrar webhook no ASAAS:
   - URL: `https://seu-dominio.pages.dev/api/webhooks/asaas`
   - Eventos: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`

### Ambiente Production

1. Conta ASAAS Production: https://www.asaas.com
2. Repetir processo acima com API Key de produção
3. **IMPORTANTE**: Remover `ASAAS_BOOTSTRAP_API_KEY` do .dev.vars em produção

---

## 🎨 Customização

### Themes & Branding

Editar via CMS:
- `settings.site_name`
- `settings.site_description`
- Logo e cores em `public/static/styles.css`

### Paywall Templates

Criar templates no CMS com variáveis:
- `{site_name}`, `{remaining}`, `{limit}`

Mapear por categoria/tag para personalizar mensagem.

---

## 🐛 Troubleshooting

### Build Falha

```bash
# Limpar cache e rebuild
rm -rf dist .wrangler node_modules
npm install
npm run build
```

### D1 Migration Falha

```bash
# Reset local D1
npm run db:reset
```

### Rate Limit em Dev

```bash
# Limpar KV
wrangler kv:key delete --namespace-id=SEU_KV_ID "rl:public:127.0.0.1"
```

---

## 📚 Recursos Adicionais

- [Documentação Hono](https://hono.dev/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [ASAAS API Docs](https://docs.asaas.com/)
- [Google News Guidelines](https://support.google.com/news/publisher-center/)

---

## 📊 Status do Projeto

### Completed ✅

- [x] Estrutura do monorepo
- [x] TypeScript + ESM
- [x] Migrations D1 completas
- [x] Auth (JWT, password hashing, magic link)
- [x] Middleware (auth, rate limit, security, logging)
- [x] Database repos
- [x] R2 storage (upload, serving)
- [x] Paywall (metering, access check)
- [x] Integração ASAAS (client, webhooks)
- [x] Rotas públicas SSR (home, artigo)
- [x] Seed completo
- [x] Validate.js

### In Progress 🚧

- [ ] SEO completo (sitemaps news, RSS, JSON-LD)
- [ ] Ads rendering (AdSense/GAM)
- [ ] CMS Admin UI
- [ ] n8n integration
- [ ] Newsletter + Push
- [ ] Web Stories
- [ ] Testes (unit + integration, coverage >85%)

### Próximos Passos

1. Implementar rotas admin (CRUD posts, settings, ads)
2. SEO módulo completo (sitemaps news, RSS, JSON-LD)
3. Ads rendering com placeholders anti-CLS
4. n8n webhook handler com HMAC
5. Newsletter subscribe + campaigns
6. Push notifications (VAPID + service worker)
7. Web Stories editor
8. Testes completos (unit + integration)
9. CI/CD automation

---

## 📄 Licença

Proprietary - Todos os direitos reservados.

---

## 👥 Contribuição

Este é um projeto interno. Para mudanças, abra um issue primeiro.

---

**Desenvolvido com ❤️ usando Hono + Cloudflare Workers**
