import { connect } from 'cloudflare:sockets'
import type { NewsletterDeliveryResult } from './types'

export interface SmtpConfig {
  host: string
  port: number
  username: string
  password: string
  fromEmail: string
  fromName: string
}

export interface SmtpMessage {
  to: string
  subject: string
  html: string
  text: string
  unsubscribeUrl?: string
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function encodeBase64(value: string): string {
  return bytesToBase64(new TextEncoder().encode(value))
}

function wrapBase64(value: string): string {
  return encodeBase64(value).match(/.{1,76}/g)?.join('\r\n') || ''
}

function encodeHeader(value: string): string {
  return `=?UTF-8?B?${encodeBase64(value)}?=`
}

function sanitizeAddress(value: string): string {
  return value.replace(/[\r\n<>]/g, '').trim()
}

function createMessageId(fromEmail: string): string {
  const domain = fromEmail.split('@')[1] || 'localhost'
  return `<${crypto.randomUUID()}@${domain}>`
}

function buildMimeMessage(config: SmtpConfig, message: SmtpMessage, messageId: string): string {
  const boundary = `dp-${crypto.randomUUID()}`
  const headers = [
    `From: ${encodeHeader(config.fromName)} <${sanitizeAddress(config.fromEmail)}>`,
    `To: <${sanitizeAddress(message.to)}>`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    'X-Mailer: Diario-do-Povo-CMS/1.0'
  ]

  if (message.unsubscribeUrl) {
    headers.push(`List-Unsubscribe: <${message.unsubscribeUrl}>`)
    headers.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click')
  }

  return [
    ...headers,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(message.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(message.html),
    `--${boundary}--`,
    ''
  ].join('\r\n')
}

class SmtpSession {
  private reader: ReadableStreamDefaultReader<Uint8Array>
  private writer: WritableStreamDefaultWriter<Uint8Array>
  private buffer = ''
  private decoder = new TextDecoder()
  private encoder = new TextEncoder()

  constructor(readable: ReadableStream<Uint8Array>, writable: WritableStream<Uint8Array>) {
    this.reader = readable.getReader()
    this.writer = writable.getWriter()
  }

  async readResponse(): Promise<{ code: number; response: string }> {
    while (true) {
      const lines = this.buffer.split('\r\n')
      for (let index = 0; index < lines.length - 1; index++) {
        const line = lines[index]
        if (/^\d{3} /.test(line)) {
          const consumed = lines.slice(0, index + 1).join('\r\n')
          this.buffer = lines.slice(index + 1).join('\r\n')
          return { code: Number(line.slice(0, 3)), response: consumed }
        }
      }

      const chunk = await this.reader.read()
      if (chunk.done) throw new Error('O servidor SMTP encerrou a conexão inesperadamente.')
      this.buffer += this.decoder.decode(chunk.value, { stream: true })
    }
  }

  async command(command: string, expectedCodes: number[]): Promise<string> {
    await this.writer.write(this.encoder.encode(`${command}\r\n`))
    const result = await this.readResponse()
    if (!expectedCodes.includes(result.code)) {
      throw new Error(`SMTP ${result.code}: ${result.response.replace(/\r\n/g, ' | ')}`)
    }
    return result.response
  }

  async data(payload: string): Promise<void> {
    const normalized = payload.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..')
    await this.writer.write(this.encoder.encode(`${normalized}\r\n.\r\n`))
    const result = await this.readResponse()
    if (result.code !== 250) throw new Error(`SMTP ${result.code}: ${result.response}`)
  }

  async close(): Promise<void> {
    try { await this.command('QUIT', [221]) } catch { /* connection may already be closed */ }
    try { await this.writer.close() } catch { /* noop */ }
    try { await this.reader.cancel() } catch { /* noop */ }
  }
}

export async function sendSmtpBatch(
  config: SmtpConfig,
  messages: SmtpMessage[],
  onResult?: (result: NewsletterDeliveryResult) => Promise<void>
): Promise<NewsletterDeliveryResult[]> {
  if (config.port !== 465) {
    throw new Error('A integração SMTP atual exige TLS direto na porta 465.')
  }
  if (!messages.length) return []

  const socket = connect(
    { hostname: config.host, port: config.port },
    { secureTransport: 'on', allowHalfOpen: false }
  )
  const session = new SmtpSession(socket.readable, socket.writable)
  const results: NewsletterDeliveryResult[] = []

  try {
    const greeting = await session.readResponse()
    if (greeting.code !== 220) throw new Error(`SMTP ${greeting.code}: ${greeting.response}`)
    await session.command('EHLO diario.dopovo.com.br', [250])
    await session.command('AUTH LOGIN', [334])
    await session.command(encodeBase64(config.username), [334])
    await session.command(encodeBase64(config.password), [235])

    for (const message of messages) {
      const messageId = createMessageId(config.fromEmail)
      try {
        await session.command(`MAIL FROM:<${sanitizeAddress(config.fromEmail)}>`, [250])
        await session.command(`RCPT TO:<${sanitizeAddress(message.to)}>`, [250, 251])
        await session.command('DATA', [354])
        await session.data(buildMimeMessage(config, message, messageId))
        const result = { recipient: message.to, ok: true, messageId }
        results.push(result)
        if (onResult) await onResult(result)
      } catch (error) {
        const result = {
          recipient: message.to,
          ok: false,
          error: error instanceof Error ? error.message.slice(0, 500) : 'Falha SMTP desconhecida'
        }
        results.push(result)
        if (onResult) await onResult(result)
        try { await session.command('RSET', [250]) } catch { break }
      }
    }
  } finally {
    await session.close()
  }

  return results
}
