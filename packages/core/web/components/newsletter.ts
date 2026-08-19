export function renderAlltypeNewsletter(nonce: string): string {
  return `
    <section class="dp-newsletter">
      <h3 class="dp-newsletter-title">Receba nossa newsletter</h3>
      <p class="dp-newsletter-desc">Inscreva-se para receber as principais notícias diretamente no seu e-mail, todas as manhãs.</p>
      <form class="dp-newsletter-form" action="/api/newsletter/subscribe" method="POST" id="newsletterForm">
        <input type="email" name="email" class="dp-newsletter-input" placeholder="Seu melhor e-mail" required>
        <button type="submit" class="dp-newsletter-btn">Inscrever-se</button>
      </form>
    </section>
  `
}
