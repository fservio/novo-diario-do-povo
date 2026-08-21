(() => {
  const FOCAL_OVERSCAN = 1.12
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

  const formatTabs = Array.from(document.querySelectorAll('[data-instagram-format-tab]'))
  const activateFormat = format => {
    formatTabs.forEach(button => button.setAttribute('aria-selected', String(button.dataset.instagramFormatTab === format)))
    document.querySelectorAll('[data-instagram-format-panel]').forEach(panel => {
      panel.hidden = panel.dataset.instagramFormatPanel !== format
    })
    document.querySelectorAll('[data-instagram-format-actions]').forEach(actions => {
      actions.hidden = actions.dataset.instagramFormatActions !== format
    })
  }
  formatTabs.forEach(button => button.addEventListener('click', () => activateFormat(button.dataset.instagramFormatTab)))
  if (formatTabs.length) {
    const requestedFormat = new URLSearchParams(window.location.search).get('format')
    activateFormat(requestedFormat === 'story' ? 'story' : 'feed')
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
      if (previewImage) {
        previewImage.style.objectPosition = `${focal.x}% ${focal.y}%`
        previewImage.style.transformOrigin = `${focal.x}% ${focal.y}%`
      }
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
      const scale = Math.max(1080 / image.naturalWidth, 1350 / image.naturalHeight) * FOCAL_OVERSCAN
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

    const cropHint = document.querySelector('[data-instagram-crop-hint]')
    assets.then(([cover]) => {
      if (!cropHint) return
      const sourceRatio = cover.naturalWidth / cover.naturalHeight
      const targetRatio = 1080 / 1350
      cropHint.textContent = Math.abs(sourceRatio - targetRatio) < .015
        ? 'A margem de enquadramento permite ajustar a foto nos dois eixos.'
        : sourceRatio > targetRatio
          ? 'O recorte principal atua no eixo horizontal, com margem adicional para o ajuste vertical.'
          : 'O recorte principal atua no eixo vertical, com margem adicional para o ajuste horizontal.'
    }).catch(() => {})

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

  const storyPreview = document.querySelector('[data-instagram-story-preview]')
  const storyDownloadButton = document.querySelector('[data-instagram-story-download]')
  if (storyPreview && storyDownloadButton) {
    const storyStatus = document.querySelector('[data-instagram-story-download-status]')
    const storyFocal = { x: 50, y: 50 }
    let scheduleStoryPreview = () => {}

    const storyValue = id => document.querySelector(id)?.value.trim() || ''
    const storyInputs = Array.from(document.querySelectorAll('[data-story-preview-input]'))
    storyInputs.forEach(input => {
      const target = storyPreview.querySelector(`[data-story-preview-${input.dataset.storyPreviewInput}]`)
      input.addEventListener('input', () => {
        if (target) target.textContent = input.value
          ? `${target.dataset.previewPrefix || ''}${input.value}`
          : (target.dataset.previewEmpty || '')
        scheduleStoryPreview()
      })
    })

    const storyPreviewImage = storyPreview.querySelector('[data-story-preview-image]')
    document.querySelectorAll('[data-story-position-axis]').forEach(input => {
      const axis = input.dataset.storyPositionAxis
      storyFocal[axis] = Number(input.value)
      input.addEventListener('input', () => {
        storyFocal[axis] = Number(input.value)
        const output = document.querySelector(`[data-story-position-output="${axis}"]`)
        if (output) output.textContent = `${input.value}%`
        if (storyPreviewImage) {
          storyPreviewImage.style.objectPosition = `${storyFocal.x}% ${storyFocal.y}%`
          storyPreviewImage.style.transformOrigin = `${storyFocal.x}% ${storyFocal.y}%`
        }
        scheduleStoryPreview()
      })
    })

    const loadStoryImage = src => new Promise((resolve, reject) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error(`Não foi possível carregar ${src}.`))
      image.src = src
    })

    const storyAssets = Promise.all([
      loadStoryImage(storyDownloadButton.dataset.downloadImage),
      loadStoryImage('/static/logo-dp.png')
    ])

    const storyCropHint = document.querySelector('[data-instagram-story-crop-hint]')
    storyAssets.then(([cover]) => {
      if (!storyCropHint) return
      const sourceRatio = cover.naturalWidth / cover.naturalHeight
      const targetRatio = 1080 / 1920
      storyCropHint.textContent = Math.abs(sourceRatio - targetRatio) < .015
        ? 'A margem de enquadramento permite ajustar a foto nos dois eixos.'
        : sourceRatio > targetRatio
          ? 'O recorte principal atua no eixo horizontal, com margem adicional para o ajuste vertical.'
          : 'O recorte principal atua no eixo vertical, com margem adicional para o ajuste horizontal.'
    }).catch(() => {})

    const storyWrapLines = (context, text, maxWidth, maxLines) => {
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
      if (lines.length <= maxLines) return lines
      const visible = lines.slice(0, maxLines)
      let finalLine = `${visible[maxLines - 1]}…`
      while (context.measureText(finalLine).width > maxWidth && finalLine.length > 2) finalLine = `${finalLine.slice(0, -2).trim()}…`
      visible[maxLines - 1] = finalLine
      return visible
    }

    const storyDrawLines = (context, lines, x, y, lineHeight) => {
      lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight))
    }

    const storyDrawCover = (context, image, xPercent, yPercent) => {
      const scale = Math.max(1080 / image.naturalWidth, 1920 / image.naturalHeight) * FOCAL_OVERSCAN
      const width = image.naturalWidth * scale
      const height = image.naturalHeight * scale
      const x = (1080 - width) * (xPercent / 100)
      const y = (1920 - height) * (yPercent / 100)
      context.drawImage(image, x, y, width, height)
    }

    const storyDrawLogo = (context, logo) => {
      const width = 184
      const height = width * (logo.naturalHeight / logo.naturalWidth)
      const buffer = document.createElement('canvas')
      buffer.width = Math.ceil(width)
      buffer.height = Math.ceil(height)
      const bufferContext = buffer.getContext('2d')
      bufferContext.drawImage(logo, 0, 0, width, height)
      bufferContext.globalCompositeOperation = 'source-in'
      bufferContext.fillStyle = 'rgba(255,255,255,.97)'
      bufferContext.fillRect(0, 0, width, height)
      context.drawImage(buffer, 64, 296, width, height)
    }

    const storyTitleSize = title => {
      if (title.length > 105) return 76
      if (title.length > 82) return 82
      if (title.length > 58) return 90
      return 102
    }

    const storyArtworkValues = () => ({
      title: storyValue('#instagram-story-title'),
      hat: storyValue('#instagram-story-hat') || 'Notícia',
      subtitle: storyValue('#instagram-story-subtitle'),
      credit: storyValue('#instagram-story-photo-credit'),
      cta: storyValue('#instagram-story-cta') || 'Leia a matéria completa',
      xPercent: Number(document.querySelector('#instagram-story-position-x')?.value || 50),
      yPercent: Number(document.querySelector('#instagram-story-position-y')?.value || 50)
    })

    const renderStoryArtwork = (canvas, cover, logo) => {
      canvas.width = 1080
      canvas.height = 1920
      const context = canvas.getContext('2d')
      const values = storyArtworkValues()
      storyDrawCover(context, cover, values.xPercent, values.yPercent)

      const wash = context.createLinearGradient(0, 0, 0, 1920)
      wash.addColorStop(0, 'rgba(3,18,29,.05)')
      wash.addColorStop(.28, 'rgba(3,18,29,.10)')
      wash.addColorStop(.58, 'rgba(4,20,31,.72)')
      wash.addColorStop(.82, 'rgba(4,20,31,.98)')
      wash.addColorStop(1, 'rgba(4,20,31,.92)')
      context.fillStyle = wash
      context.fillRect(0, 0, 1080, 1920)
      storyDrawLogo(context, logo)

      context.fillStyle = '#fff'
      context.font = '700 13px Arial, sans-serif'
      context.letterSpacing = '2.8px'
      context.textAlign = 'right'
      context.fillText('JORNALISMO INDEPENDENTE', 1016, 330)
      context.textAlign = 'left'
      context.letterSpacing = '0px'

      const fontSize = storyTitleSize(values.title)
      context.font = `700 ${fontSize}px Georgia, 'Times New Roman', serif`
      context.letterSpacing = '-3px'
      const titleLines = storyWrapLines(context, values.title, 950, 4)
      const titleLineHeight = fontSize * 1.01
      context.font = '500 30px Arial, sans-serif'
      context.letterSpacing = '0px'
      const subtitleLines = values.subtitle ? storyWrapLines(context, values.subtitle, 900, 3) : []
      const subtitleLineHeight = 40
      const totalHeight = 7 + 26 + 28 + 20 + titleLines.length * titleLineHeight
        + (subtitleLines.length ? 27 + subtitleLines.length * subtitleLineHeight : 0) + 54
      let y = Math.max(500, 1395 - totalHeight)

      context.fillStyle = '#d1a85d'
      context.fillRect(64, y, 82, 7)
      y += 33
      context.fillStyle = '#e2bd78'
      context.font = '800 22px Arial, sans-serif'
      context.letterSpacing = '3.8px'
      context.fillText(values.hat.toLocaleUpperCase('pt-BR'), 64, y + 22)
      context.letterSpacing = '0px'
      y += 48
      context.fillStyle = '#fff'
      context.font = `700 ${fontSize}px Georgia, 'Times New Roman', serif`
      context.letterSpacing = '-3px'
      storyDrawLines(context, titleLines, 64, y + fontSize * .82, titleLineHeight)
      context.letterSpacing = '0px'
      y += titleLines.length * titleLineHeight
      if (subtitleLines.length) {
        y += 27
        context.fillStyle = '#e8edf0'
        context.font = '500 30px Arial, sans-serif'
        storyDrawLines(context, subtitleLines, 64, y + 29, subtitleLineHeight)
        y += subtitleLines.length * subtitleLineHeight
      }
      y += 32
      context.fillStyle = '#e2bd78'
      context.font = '800 17px Arial, sans-serif'
      context.letterSpacing = '1.7px'
      context.fillText(values.cta.toLocaleUpperCase('pt-BR'), 64, y)
      context.letterSpacing = '0px'

      context.strokeStyle = 'rgba(255,255,255,.28)'
      context.beginPath()
      context.moveTo(64, 1452)
      context.lineTo(1016, 1452)
      context.stroke()
      context.fillStyle = '#fff'
      context.font = '800 15px Arial, sans-serif'
      context.letterSpacing = '1.4px'
      context.fillText('JORNALDIARIODOPOVO.COM.BR', 64, 1493)
      context.fillStyle = '#d1d9de'
      context.font = '400 12px Arial, sans-serif'
      context.letterSpacing = '.4px'
      context.textAlign = 'right'
      context.fillText(values.credit ? `Foto: ${values.credit}` : 'Crédito não informado', 1016, 1493)
      context.textAlign = 'left'
      context.letterSpacing = '0px'
      return values
    }

    let storyCanvas
    let storyFrame
    const renderStoryPreview = async () => {
      const [cover, logo] = await storyAssets
      if (!storyCanvas) {
        storyCanvas = document.createElement('canvas')
        storyCanvas.className = 'instagram-art-preview-canvas'
        storyCanvas.setAttribute('aria-label', 'Prévia exata do Story para download')
        storyPreview.appendChild(storyCanvas)
      }
      renderStoryArtwork(storyCanvas, cover, logo)
      storyPreview.classList.add('is-canvas-preview')
    }
    scheduleStoryPreview = () => {
      window.cancelAnimationFrame(storyFrame)
      storyFrame = window.requestAnimationFrame(() => renderStoryPreview().catch(() => {}))
    }
    scheduleStoryPreview()

    const safeToggle = document.querySelector('[data-story-safe-toggle]')
    safeToggle?.addEventListener('click', () => {
      const hidden = storyPreview.classList.toggle('hide-safe-zones')
      safeToggle.setAttribute('aria-pressed', String(!hidden))
      safeToggle.textContent = hidden ? 'Mostrar zonas seguras' : 'Ocultar zonas seguras'
    })

    storyDownloadButton.addEventListener('click', async () => {
      const titleInput = document.querySelector('#instagram-story-title')
      const creditInput = document.querySelector('#instagram-story-photo-credit')
      if (!titleInput?.value.trim() || !creditInput?.value.trim()) {
        const invalid = !titleInput?.value.trim() ? titleInput : creditInput
        invalid?.focus()
        invalid?.reportValidity()
        return
      }
      const original = storyDownloadButton.innerHTML
      storyDownloadButton.disabled = true
      storyDownloadButton.textContent = 'Gerando Story…'
      if (storyStatus) storyStatus.textContent = 'Preparando o JPG 9:16…'
      try {
        const [cover, logo] = await storyAssets
        const canvas = storyCanvas || document.createElement('canvas')
        const values = renderStoryArtwork(canvas, cover, logo)
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .92))
        if (!blob) throw new Error('O navegador não conseguiu gerar o Story.')
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        const slug = values.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
          .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 62)
        link.href = url
        link.download = `diario-do-povo-story-${slug || 'materia'}.jpg`
        link.hidden = true
        document.body.appendChild(link)
        link.click()
        link.remove()
        if (storyStatus) storyStatus.textContent = `Download iniciado · 1080 × 1920 · ${Math.max(1, Math.round(blob.size / 1024))} KB`
        setTimeout(() => URL.revokeObjectURL(url), 3000)
      } catch (error) {
        if (storyStatus) storyStatus.textContent = 'Não foi possível gerar o Story.'
        window.alert(error instanceof Error ? error.message : 'Não foi possível gerar o Story.')
      } finally {
        storyDownloadButton.disabled = false
        storyDownloadButton.innerHTML = original
      }
    })
  }

  document.querySelectorAll('[data-story-copy-link]').forEach(button => {
    button.addEventListener('click', async () => {
      const feedback = document.querySelector('[data-story-copy-status]')
      try {
        await navigator.clipboard.writeText(button.dataset.storyUrl)
        if (feedback) feedback.textContent = 'Link rastreável copiado.'
      } catch {
        if (feedback) feedback.textContent = 'Não foi possível copiar. Abra a arte e copie o endereço manualmente.'
      }
    })
  })
})()
