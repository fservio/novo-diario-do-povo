(() => {
  const button = document.getElementById('coverImageImport')
  const cover = document.getElementById('coverMediaInput')
  const status = document.getElementById('coverImageImportStatus')
  const url = document.getElementById('coverImageLink')
  const file = document.getElementById('coverImageFile')
  const alt = document.getElementById('coverImageAlt')
  const credit = document.getElementById('coverImageCredit')
  const preview = document.getElementById('aiCoverPreview')
  const csrf = button.closest('form').querySelector('input[name="csrf"]').value

  async function encodeCover(source) {
    const image = await createImageBitmap(source)
    try {
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
      const webp = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.85))
      if (webp?.type !== 'image/webp') throw new Error('Este navegador não conseguiu exportar a foto em WebP.')
      return webp
    } finally {
      image.close()
    }
  }

  button.addEventListener('click', async () => {
    const link = url.value.trim()
    const localPhoto = file?.files[0]
    const description = alt.value.trim()
    const photographer = credit.value.trim()
    const previousCover = cover.value
    if ((!link && !localPhoto) || description.length < 3) {
      status.textContent = 'Informe o link ou selecione um arquivo e descreva a imagem.'
      return
    }
    if (localPhoto && localPhoto.size > 10 * 1024 * 1024) {
      status.textContent = 'A foto ultrapassa o limite de 10 MB.'
      return
    }
    if (previousCover && !confirm('Substituir a capa selecionada pela foto importada?')) return

    button.disabled = true
    status.textContent = localPhoto ? 'Otimizando a foto…' : 'Baixando e otimizando a foto…'
    try {
      let photo = localPhoto
      let sourceCredit = ''
      if (!photo) {
        const download = await fetch('/api/admin/media/image-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: JSON.stringify({ url: link })
        })
        if (!download.ok) {
          const result = await download.json().catch(() => ({}))
          throw new Error(result.error || 'Não foi possível baixar a foto.')
        }
        photo = await download.blob()
        sourceCredit = decodeURIComponent(download.headers.get('X-Image-Credit') || '')
      }

      const webp = await encodeCover(photo)
      const form = new FormData()
      form.append('file', webp, 'capa-importada.webp')
      form.append('alt', description)
      form.append('credits', photographer || sourceCredit)
      form.append('purpose', localPhoto ? 'editorial-cover-file' : 'editorial-cover-link')

      const upload = await fetch('/api/admin/media/upload', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf },
        body: form
      })
      const result = await upload.json().catch(() => ({}))
      if (!upload.ok || !result.media?.id || !result.media?.url) {
        throw new Error(result.error || 'Não foi possível salvar a foto na biblioteca.')
      }

      if (cover.value !== previousCover) {
        status.textContent = 'Foto salva na biblioteca. A seleção de capa foi alterada durante a importação.'
        return
      }
      cover.value = result.media.id
      preview.src = result.media.url
      preview.hidden = false
      cover.dispatchEvent(new Event('change', { bubbles: true }))
      status.textContent = 'Foto salva na biblioteca e selecionada como capa.'
    } catch (error) {
      status.textContent = error.message || 'Não foi possível importar a foto.'
    } finally {
      button.disabled = false
    }
  })
})()
