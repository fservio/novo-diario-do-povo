const adLoader = "script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + adsenseClientId;"
const mobileAnchor = "if (window.matchMedia('(max-width: 768px)').matches) script.setAttribute('data-overlays', 'collapsed-bottom');"

export default {
  async fetch(request: Request): Promise<Response> {
    const response = await fetch(request)
    if (request.method !== 'GET' || new URL(request.url).pathname !== '/' ||
        response.status !== 200 || !response.headers.get('content-type')?.includes('text/html')) return response

    // Preserve the origin's nonce and consent logic. Buffer only inline script text.
    let scriptText = ''
    const html = new HTMLRewriter().on('script[nonce]:not([src])', {
      element() { scriptText = '' },
      text(chunk) {
        scriptText += chunk.text
        if (!chunk.lastInTextNode) {
          chunk.remove()
          return
        }
        const content = scriptText.includes('function loadAdSenseScript(') && !scriptText.includes('data-overlays')
          ? scriptText.replace(adLoader, mobileAnchor + '\n    ' + adLoader)
          : scriptText
        chunk.replace(content, { html: true })
        scriptText = ''
      }
    }).transform(response)
    html.headers.delete('etag')
    html.headers.delete('content-length')
    return html
  }
}
