import type { Context } from 'hono'
import type { Env } from '../types'
import { unsubscribeNewsletterRecipient } from '../newsletter'

function page(content: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Preferências de newsletter | Diário do Povo</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#eef1f3;color:#182b38;font-family:Arial,sans-serif}.box{width:min(520px,100%);padding:42px;background:#fff;border-top:4px solid #b78a3d;box-shadow:0 18px 50px rgba(10,35,52,.1);text-align:center}.logo{width:170px;height:auto;margin-bottom:28px}.kicker{color:#a5762d;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase}h1{margin:10px 0 12px;font-family:Georgia,serif;font-size:32px;line-height:1.08}p{color:#61717a;font-size:14px;line-height:1.6}button,a{display:inline-block;margin-top:16px;padding:12px 18px;border:0;background:#173f5f;color:#fff;font-weight:700;text-decoration:none;cursor:pointer}
  </style></head><body><main class="box"><img class="logo" src="/static/logo-dp.png" alt="Diário do Povo">${content}</main></body></html>`
}

export async function handleNewsletterUnsubscribePage(c: Context) {
  const token = c.req.param('token')
  if (token === 'preview') {
    return c.html(page('<p class="kicker">Prévia editorial</p><h1>Link de descadastramento</h1><p>Na mensagem real, cada leitor recebe um endereço exclusivo e seguro.</p><a href="/">Voltar ao jornal</a>'))
  }
  if (!/^[a-f0-9]{48}$/i.test(token)) return c.notFound()
  return c.html(page(`<p class="kicker">Preferências de e-mail</p><h1>Cancelar newsletter?</h1><p>Ao confirmar, você deixará de receber as edições do Diário do Povo. Sua assinatura do jornal não será alterada.</p><form method="post" action="/newsletter/unsubscribe/${token}"><button type="submit">Confirmar cancelamento</button></form><a href="/" style="background:transparent;color:#173f5f;margin-top:8px;">Manter inscrição</a>`))
}

export async function handleNewsletterUnsubscribe(c: Context) {
  const token = c.req.param('token')
  if (!/^[a-f0-9]{48}$/i.test(token)) return c.notFound()
  const changed = await unsubscribeNewsletterRecipient(c.env as Env, token)
  return c.html(page(`<p class="kicker">Preferências atualizadas</p><h1>${changed ? 'Inscrição cancelada' : 'Este endereço já estava descadastrado'}</h1><p>Você não receberá novos envios desta newsletter. Obrigado por acompanhar o Diário do Povo.</p><a href="/">Voltar ao jornal</a>`))
}

export async function handleNewsletterOneClickUnsubscribe(c: Context) {
  const token = c.req.param('token')
  if (!/^[a-f0-9]{48}$/i.test(token)) return c.json({ success: false }, 404)
  await unsubscribeNewsletterRecipient(c.env as Env, token)
  return c.json({ success: true })
}
