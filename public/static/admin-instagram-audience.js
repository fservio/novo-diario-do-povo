(() => {
  document.querySelectorAll('[data-ig-audience-export]').forEach(button => button.addEventListener('click', () => {
    const markdown = document.getElementById(button.dataset.igAudienceExport)
    if (!markdown) return
    const blob = new Blob([markdown.value], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Fortaleza' }).format(new Date())
    link.download = `${button.dataset.filename}-${day}.md`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }))
  const pending = document.querySelector('[data-audience-pending-since]')
  const started = pending ? Date.parse(pending.dataset.audiencePendingSince) : NaN
  if (Number.isFinite(started) && Date.now() - started >= 0 && Date.now() - started < 10 * 60 * 1000) {
    window.setTimeout(() => window.location.reload(), 10000)
  }
})()
