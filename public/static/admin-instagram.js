(() => {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const search = document.querySelector('[data-instagram-search]')
  if (search) {
    search.addEventListener('input', () => {
      const term = normalize(search.value)
      document.querySelectorAll('[data-instagram-source-grid] [data-search]').forEach(card => {
        card.hidden = term && !normalize(card.dataset.search).includes(term)
      })
    })
  }

  const preview = document.querySelector('[data-instagram-preview]')
  let scheduleCanvasPreview = () => {}
  document.querySelectorAll('[data-preview-input]').forEach(input => {
    const target = preview?.querySelector(`[data-preview-${input.dataset.previewInput}]`)
    const update = () => {
      if (target) target.textContent = input.value
        ? `${target.dataset.previewPrefix || ''}${input.value}`
        : (target.dataset.previewEmpty || '')
      const counter = document.querySelector(`[data-count-for="${input.id}"]`)
      if (counter) counter.textContent = String(input.value.length)
      scheduleCanvasPreview()
    }
    input.addEventListener('input', update)
  })

  document.querySelectorAll('textarea[maxlength],input[maxlength]').forEach(input => {
    const counter = document.querySelector(`[data-count-for="${input.id}"]`)
    if (counter && !input.hasAttribute('data-preview-input')) {
      input.addEventListener('input', () => { counter.textContent = String(input.value.length) })
    }
  })

  const previewImage = document.querySelector('[data-preview-image]')
  const focal = { x: 50, y: 50 }
  document.querySelectorAll('[data-position-axis]').forEach(input => {
    const axis = input.dataset.positionAxis
    focal[axis] = Number(input.value)
    const update = () => {
      focal[axis] = Number(input.value)
      const output = document.querySelector(`[data-position-output="${axis}"]`)
      if (output) output.textContent = `${input.value}%`
      if (previewImage) previewImage.style.objectPosition = `${focal.x}% ${focal.y}%`
      scheduleCanvasPreview()
    }
    input.addEventListener('input', update)
  })

  const downloadButton = document.querySelector('[data-instagram-download]')
  if (downloadButton) {
    const downloadStatus = document.querySelector('[data-instagram-download-status]')
    const loadImage = src => new Promise((resolve, reject) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error(`Não foi possível carregar ${src}.`))
      image.src = src
    })

    const wrapLines = (context, text, maxWidth) => {
      const words = String(text || '').trim().split(/\s+/).filter(Boolean)
      const lines = []
      let line = ''
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word
        if (line && context.measureText(candidate).width > maxWidth) {
          lines.push(line)
          line = word
        } else {
          line = candidate
        }
      }
      if (line) lines.push(line)
      return lines
    }

    const drawLines = (context, lines, x, y, lineHeight) => {
      lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight))
    }

    const titleSize = title => {
      if (title.length > 105) return 64
      if (title.length > 82) return 70
      if (title.length > 58) return 77
      return 86
    }

    const drawCover = (context, image, xPercent, yPercent) => {
      const scale = Math.max(1080 / image.naturalWidth, 1350 / image.naturalHeight)
      const width = image.naturalWidth * scale
      const height = image.naturalHeight * scale
      const x = (1080 - width) * (xPercent / 100)
      const y = (1350 - height) * (yPercent / 100)
      context.drawImage(image, x, y, width, height)
    }

    const drawWhiteLogo = (context, logo) => {
      const width = 172
      const height = width * (logo.naturalHeight / logo.naturalWidth)
      const buffer = document.createElement('canvas')
      buffer.width = Math.ceil(width)
      buffer.height = Math.ceil(height)
      const bufferContext = buffer.getContext('2d')
      bufferContext.drawImage(logo, 0, 0, width, height)
      bufferContext.globalCompositeOperation = 'source-in'
      bufferContext.fillStyle = 'rgba(255,255,255,.96)'
      bufferContext.fillRect(0, 0, width, height)
      context.drawImage(buffer, 64, 54, width, height)
    }

    const makeFilename = title => {
      const slug = String(title || 'post').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70)
      return `diario-do-povo-${slug || 'post'}.jpg`
    }

    const assets = Promise.all([
      loadImage(downloadButton.dataset.downloadImage),
      loadImage('/static/logo-dp.png')
    ])

    const artworkValues = () => ({
      title: document.querySelector('#instagram-title')?.value.trim() || '',
      hat: document.querySelector('#instagram-hat')?.value.trim() || 'Notícia',
      subtitle: document.querySelector('#instagram-subtitle')?.value.trim() || '',
      credit: document.querySelector('#instagram-photo-credit')?.value.trim() || '',
      xPercent: Number(document.querySelector('#instagram-position-x')?.value || 50),
      yPercent: Number(document.querySelector('#instagram-position-y')?.value || 50)
    })

    const renderArtwork = (canvas, cover, logo) => {
      canvas.width = 1080
      canvas.height = 1350
      const context = canvas.getContext('2d')
      const values = artworkValues()
      drawCover(context, cover, values.xPercent, values.yPercent)

      const wash = context.createLinearGradient(0, 0, 0, 1350)
      wash.addColorStop(0, 'rgba(3,18,29,.05)')
      wash.addColorStop(.28, 'rgba(3,18,29,.08)')
      wash.addColorStop(.58, 'rgba(4,20,31,.78)')
      wash.addColorStop(1, 'rgba(4,20,31,.98)')
      context.fillStyle = wash
      context.fillRect(0, 0, 1080, 1350)
      drawWhiteLogo(context, logo)

      context.fillStyle = '#fff'
      context.font = '700 13px Arial, sans-serif'
      context.letterSpacing = '2.8px'
      context.textAlign = 'right'
      context.fillText('JORNALISMO INDEPENDENTE', 1016, 88)
      context.letterSpacing = '0px'
      context.textAlign = 'left'

      const fontSize = titleSize(values.title)
      context.font = `700 ${fontSize}px Georgia, 'Times New Roman', serif`
      context.letterSpacing = '-2.7px'
      const titleLines = wrapLines(context, values.title, 940)
      const titleLineHeight = fontSize * 1.01
      context.font = '500 29px Arial, sans-serif'
      context.letterSpacing = '0px'
      const subtitleLines = values.subtitle ? wrapLines(context, values.subtitle, 900) : []
      const subtitleLineHeight = 38
      const totalHeight = 6 + 25 + 26 + 18 + titleLines.length * titleLineHeight
        + (subtitleLines.length ? 25 + subtitleLines.length * subtitleLineHeight : 0) + 38 + 24 + 18
      let y = 1350 - 74 - totalHeight

      context.fillStyle = '#d1a85d'
      context.fillRect(64, y, 72, 6)
      y += 31
      context.fillStyle = '#e2bd78'
      context.font = '800 21px Arial, sans-serif'
      context.letterSpacing = '3.5px'
      context.fillText(values.hat.toLocaleUpperCase('pt-BR'), 64, y + 21)
      context.letterSpacing = '0px'
      y += 44
      context.fillStyle = '#fff'
      context.font = `700 ${fontSize}px Georgia, 'Times New Roman', serif`
      context.letterSpacing = '-2.7px'
      drawLines(context, titleLines, 64, y + fontSize * .82, titleLineHeight)
      context.letterSpacing = '0px'
      y += titleLines.length * titleLineHeight
      if (subtitleLines.length) {
        y += 25
        context.fillStyle = '#e8edf0'
        context.font = '500 29px Arial, sans-serif'
        drawLines(context, subtitleLines, 64, y + 28, subtitleLineHeight)
        y += subtitleLines.length * subtitleLineHeight
      }
      y += 38
      context.strokeStyle = 'rgba(255,255,255,.28)'
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(64, y)
      context.lineTo(1016, y)
      context.stroke()
      y += 39
      context.fillStyle = '#fff'
      context.font = '800 15px Arial, sans-serif'
      context.letterSpacing = '1.4px'
      context.fillText('JORNALDIARIODOPOVO.COM.BR', 64, y)
      context.fillStyle = '#d1d9de'
      context.font = '400 12px Arial, sans-serif'
      context.letterSpacing = '.4px'
      context.textAlign = 'right'
      context.fillText(values.credit ? `Foto: ${values.credit}` : 'Crédito não informado', 1016, y)
      context.letterSpacing = '0px'
      context.textAlign = 'left'
      return values
    }

    let previewCanvas
    let previewFrame
    const renderCanvasPreview = async () => {
      const [cover, logo] = await assets
      if (!previewCanvas) {
        previewCanvas = document.createElement('canvas')
        previewCanvas.className = 'instagram-art-preview-canvas'
        previewCanvas.setAttribute('aria-label', 'Prévia exata do arquivo para download')
        preview.appendChild(previewCanvas)
      }
      renderArtwork(previewCanvas, cover, logo)
      preview.classList.add('is-canvas-preview')
    }
    scheduleCanvasPreview = () => {
      window.cancelAnimationFrame(previewFrame)
      previewFrame = window.requestAnimationFrame(() => renderCanvasPreview().catch(() => {}))
    }
    scheduleCanvasPreview()

    downloadButton.addEventListener('click', async () => {
      const titleInput = document.querySelector('#instagram-title')
      const creditInput = document.querySelector('#instagram-photo-credit')
      if (!titleInput?.value.trim() || !creditInput?.value.trim()) {
        const invalid = !titleInput?.value.trim() ? titleInput : creditInput
        invalid?.focus()
        invalid?.reportValidity()
        return
      }

      const original = downloadButton.innerHTML
      downloadButton.disabled = true
      downloadButton.textContent = 'Gerando arquivo…'
      if (downloadStatus) downloadStatus.textContent = 'Preparando a imagem em alta resolução…'
      try {
        const [cover, logo] = await assets
        const canvas = previewCanvas || document.createElement('canvas')
        const values = renderArtwork(canvas, cover, logo)
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .92))
        if (!blob) throw new Error('O navegador não conseguiu gerar o arquivo JPG.')
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = makeFilename(values.title)
        link.hidden = true
        document.body.appendChild(link)
        link.click()
        link.remove()
        if (downloadStatus) downloadStatus.textContent = `Download iniciado · 1080 × 1350 · ${Math.max(1, Math.round(blob.size / 1024))} KB`
        setTimeout(() => URL.revokeObjectURL(url), 3000)
      } catch (error) {
        if (downloadStatus) downloadStatus.textContent = 'Não foi possível gerar o arquivo.'
        window.alert(error instanceof Error ? error.message : 'Não foi possível gerar o post.')
      } finally {
        downloadButton.disabled = false
        downloadButton.innerHTML = original
      }
    })
  }
})()
