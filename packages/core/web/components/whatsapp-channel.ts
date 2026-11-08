/** One canonical destination shared by the landing page and every article theme. */
export const WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbDtMxb0lwgsDFrOJp3r'

export const WHATSAPP_CHANNEL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 11.6a8.5 8.5 0 0 1-12.7 7.5L3 20.5l1.4-4.7A8.5 8.5 0 1 1 20.5 11.6Z"/><path d="M8.2 7.8c.4 3.8 2.3 5.7 6.1 6.5l1.3-1.5-2-1-1 1c-1.4-.6-2.5-1.7-3-3l.8-.9-1-2Z"/></svg>`

export function renderWhatsAppChannelCta(): string {
  return `<aside class="dp-channel-cta" aria-label="Canal do Diário do Povo no WhatsApp">
    <span class="dp-channel-cta__icon">${WHATSAPP_CHANNEL_ICON}</span>
    <div class="dp-channel-cta__copy"><span class="dp-channel-cta__eyebrow">O Diário também está no WhatsApp</span><h2>Informação de confiança. Mais perto de você.</h2><p>Siga nosso canal. Seu número não fica visível para outros seguidores.</p></div>
    <div class="dp-channel-cta__actions"><a class="dp-channel-button" href="${WHATSAPP_CHANNEL_URL}" target="_blank" rel="noopener noreferrer">Seguir o canal <span aria-hidden="true">↗</span></a><a class="dp-channel-cta__details" href="/whatsapp">Conheça o canal e sua privacidade</a></div>
  </aside>`
}
