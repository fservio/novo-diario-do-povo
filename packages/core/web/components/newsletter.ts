export function renderAlltypeNewsletter(nonce: string): string {
  return `
    <section class="dp-newsletter">
      <h3 class="dp-newsletter-title">Receba nossa newsletter</h3>
      <p class="dp-newsletter-desc">Inscreva-se para receber as principais notícias diretamente no seu e-mail, todas as manhãs.</p>
      <form class="dp-newsletter-form" action="/api/newsletter/subscribe" method="POST" id="newsletterForm">
        <input type="email" name="email" class="dp-newsletter-input" placeholder="Seu melhor e-mail" required>
        <input type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">
        <button type="submit" class="dp-newsletter-btn">Inscrever-se</button>
        <label class="dp-newsletter-consent"><input type="checkbox" name="consent" value="yes" required> <span>Quero receber a newsletter e aceito a <a href="/p/privacidade">Política de Privacidade</a>.</span></label>
      </form>
    </section>
  `
}
