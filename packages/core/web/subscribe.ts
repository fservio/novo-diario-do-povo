/**
 * Subscription Page Renderer
 * Premium, High-Conversion Design
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import { renderPublicLayout, escapeHtml, escapeAttr, type PublicLayoutParams } from './layout'
import { getSetting } from '../db'
import { getActiveCategories } from '../db/categories-cache'

export async function renderSubscribePage(
  c: Context<{ Bindings: Env; Variables: AppContext }>,
  options: {
    baseUrl: string
    siteName: string
    navItems: Array<{ label: string; href: string; active?: boolean }>
    googleAnalyticsId?: string
  }
): Promise<string> {
  const { baseUrl, siteName, navItems, googleAnalyticsId } = options
  const nonce = c.get('cspNonce') || ''

  const extraHeadHtml = `
    <style>
      :root {
        --primary: #1a73e8;
        --primary-dark: #1557b0;
        --accent: #f8f9fa;
        --text-main: #202124;
        --text-muted: #5f6368;
        --card-bg: #ffffff;
        --card-shadow: 0 12px 24px rgba(0,0,0,0.08);
      }

      .sub-hero {
        padding: 80px 20px 60px;
        text-align: center;
        background: linear-gradient(180deg, #f8f9fa 0%, #ffffff 100%);
      }

      .sub-title {
        font-family: 'Merriweather', serif;
        font-size: 3rem;
        font-weight: 900;
        color: var(--text-main);
        margin-bottom: 20px;
        letter-spacing: -0.02em;
      }

      .sub-subtitle {
        font-size: 1.25rem;
        color: var(--text-muted);
        max-width: 600px;
        margin: 0 auto 40px;
        line-height: 1.6;
      }

      .plans-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 30px;
        max-width: 800px;
        margin: 0 auto 80px;
        padding: 0 20px;
      }

      .plan-card {
        background: var(--card-bg);
        border: 1px solid #dadce0;
        border-radius: 24px;
        padding: 40px;
        display: flex;
        flex-direction: column;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease;
        position: relative;
        overflow: hidden;
      }

      .plan-card:hover {
        transform: translateY(-8px);
        box-shadow: var(--card-shadow);
      }

      .plan-card--featured {
        border: 2px solid var(--primary);
        transform: scale(1.05);
      }

      .plan-card--featured:hover {
        transform: scale(1.05) translateY(-8px);
      }

      .plan-badge {
        position: absolute;
        top: 20px;
        right: -35px;
        background: var(--primary);
        color: white;
        padding: 8px 40px;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        transform: rotate(45deg);
      }

      .plan-name {
        font-size: 1.5rem;
        font-weight: 700;
        margin-bottom: 12px;
      }

      .plan-price {
        margin-bottom: 30px;
      }

      .price-currency {
        font-size: 1.25rem;
        font-weight: 500;
        vertical-align: super;
        margin-right: 4px;
      }

      .price-amount {
        font-size: 3.5rem;
        font-weight: 800;
        color: var(--text-main);
      }

      .price-period {
        color: var(--text-muted);
        font-size: 1rem;
      }

      .plan-features {
        list-style: none;
        padding: 0;
        margin: 0 0 40px 0;
        flex-grow: 1;
      }

      .plan-features li {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
        color: var(--text-muted);
        font-size: 1rem;
      }

      .plan-features li svg {
        flex-shrink: 0;
        color: #34a853;
      }

      .plan-cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 16px 32px;
        border-radius: 12px;
        font-weight: 700;
        text-decoration: none;
        transition: all 0.2s ease;
        text-align: center;
      }

      .btn-primary {
        background: var(--primary);
        color: white;
      }

      .btn-primary:hover {
        background: var(--primary-dark);
      }

      .btn-outline {
        border: 2px solid #dadce0;
        color: var(--primary);
      }

      .btn-outline:hover {
        border-color: var(--primary);
        background: rgba(26, 115, 232, 0.04);
      }

      .trust-section {
        background: #f8f9fa;
        padding: 60px 20px;
        text-align: center;
      }

      .trust-grid {
        display: flex;
        justify-content: center;
        gap: 60px;
        flex-wrap: wrap;
        max-width: 1000px;
        margin: 0 auto;
      }

      .trust-item {
        max-width: 200px;
      }

      .trust-icon {
        font-size: 2rem;
        margin-bottom: 15px;
        display: block;
      }

      .trust-text {
        font-size: 0.875rem;
        color: var(--text-muted);
        line-height: 1.4;
      }

      @media (max-width: 768px) {
        .sub-title { font-size: 2.25rem; }
        .plan-card--featured { transform: none; }
        .plan-card--featured:hover { transform: translateY(-8px); }
        .plans-grid { gap: 20px; }
      }
    </style>
  `

  const bodyHtml = `
    <div class="subscribe-page">
      <section class="sub-hero">
          <h1 class="sub-title">Escolha o seu plano</h1>
          <p class="sub-subtitle">Tenha acesso ilimitado a notícias, análises e furos de reportagem que impactam o seu dia a dia.</p>
      </section>

      <section class="plans-grid">
        <!-- Plan 1: Mensal -->
        <article class="plan-card">
          <h2 class="plan-name">Assinatura Mensal</h2>
          <div class="plan-price">
            <span class="price-currency">R$</span>
            <span class="price-amount">9,90</span>
            <span class="price-period">/mês</span>
          </div>
          <ul class="plan-features">
            <li>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Acesso ilimitado ao portal
            </li>
            <li>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              App para iOS e Android
            </li>
            <li>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Newsletter diária exclusiva
            </li>
          </ul>
          <a href="/portal?intent=subscribe&plan=mensal" class="plan-cta btn-outline">Começar agora</a>
        </article>

        <!-- Plan 2: Anual -->
        <article class="plan-card plan-card--featured">
          <div class="plan-badge">Melhor Valor</div>
          <h2 class="plan-name">Assinatura Anual</h2>
          <div class="plan-price">
            <span class="price-currency">R$</span>
            <span class="price-amount">94,90</span>
            <span class="price-period">/ano</span>
          </div>
          <p style="margin-top: -20px; margin-bottom: 20px; font-size: 0.875rem; color: #34a853; font-weight: 600;">
            Equivale a R$ 7,90 por mês
          </p>
          <ul class="plan-features">
            <li>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <b>Economia de 20%</b>
            </li>
            <li>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Tudo do plano Mensal
            </li>
            <li>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Eventos exclusivos para assinantes
            </li>
            <li>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Descontos em parceiros
            </li>
          </ul>
          <a href="/portal?intent=subscribe&plan=anual" class="plan-cta btn-primary">Assinar Agora</a>
        </article>

      </section>

      <section class="trust-section">
        <div class="trust-grid">
          <div class="trust-item">
            <span class="trust-icon">🔒</span>
            <p class="trust-text"><b>Pagamento Seguro</b><br>Seus dados estão protegidos com criptografia de ponta a ponta.</p>
          </div>
          <div class="trust-item">
            <span class="trust-icon">💳</span>
            <p class="trust-text"><b>Cancele quando quiser</b><br>Sem taxas de cancelamento ou contratos de fidelidade escondidos.</p>
          </div>
          <div class="trust-item">
            <span class="trust-icon">📰</span>
            <p class="trust-text"><b>Journalismo de Qualidade</b><br>Apoie a produção de notícias sérias e independentes.</p>
          </div>
        </div>
      </section>
    </div>
  `

  const themeSetting = await getSetting(c.env, 'public_theme')
  const theme = (themeSetting === 'minimal' || themeSetting === '"minimal"') ? 'minimal' : 'default'

  // Fetch categories for mobile menu navigation
  const categories = await getActiveCategories(c.env)

  return renderPublicLayout({
    title: `Assine | ${siteName}`,
    description: 'Escolha o plano ideal para você e tenha acesso ilimitado a todo o conteúdo.',
    canonicalUrl: `${baseUrl}/assinar`,
    nonce,
    siteName,
    navItems,
    categories,
    bodyHtml,
    extraHeadHtml,
    theme,
    googleAnalyticsId: options.googleAnalyticsId
  })
}
