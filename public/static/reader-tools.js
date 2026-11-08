const SAVED_KEY = 'diario.reader.saved.v1'
const FONT_KEY = 'diario.reader.font.v1'
const PROGRESS_KEY = 'diario.reader.progress.v1'

export function normalizeSaved(value, origin) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value.filter(item => {
    if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || seen.has(item.id) || typeof item.title !== 'string' || !item.title.trim() || typeof item.url !== 'string') return false
    try {
      const url = new URL(item.url, origin)
      if (url.origin !== origin || !['https:', 'http:'].includes(url.protocol)) return false
      seen.add(item.id)
      return true
    } catch { return false }
  }).slice(0, 50).map(item => ({ id: item.id, title: item.title.slice(0, 500), url: new URL(item.url, origin).href }))
}

export function normalizeProgress(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([id, item]) => /^\d+$/.test(id) && Number(id) > 0 && item && Number.isFinite(item.ratio) && item.ratio >= 0 && item.ratio <= 1 && Number.isFinite(item.at) && item.at <= now && now - item.at < 90 * 86400000).sort((a, b) => b[1].at - a[1].at).slice(0, 50))
}

export function initializeReaderTools() {
  const root = document.querySelector('[data-reader-tools]')
  const body = document.getElementById('articleBody')
  if (!root || !body) return
  const query = selector => root.querySelector(selector)
  const status = query('[data-reader-status]')
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true } catch { status.textContent = 'O navegador não permitiu guardar os dados. As alterações valem apenas nesta página.'; return false } }
  const origin = window.location.origin
  const current = normalizeSaved([{ id: Number(root.dataset.postId), title: root.dataset.postTitle, url: root.dataset.postUrl }], origin)[0]
  if (!current) return
  let saved = normalizeSaved(read(SAVED_KEY, []), origin)
  let progress = normalizeProgress(read(PROGRESS_KEY, {}))
  const baseSize = parseFloat(getComputedStyle(body).fontSize) || 18
  let fontStep = Number(read(FONT_KEY, 0))
  if (!Number.isInteger(fontStep) || fontStep < -1 || fontStep > 3) fontStep = 0
  const smaller = query('[data-reader-smaller]'), larger = query('[data-reader-larger]')
  function applyFont() {
    body.classList.toggle('reader-adjusted', fontStep !== 0)
    body.style.setProperty('--reader-font-size', Math.max(16, baseSize + fontStep * 2) + 'px')
    smaller.disabled = fontStep === -1
    larger.disabled = fontStep === 3
  }
  function changeFont(step) {
    fontStep = Math.max(-1, Math.min(3, step)); applyFont()
    status.textContent = fontStep === 0 ? 'Tamanho padrão do texto.' : 'Tamanho do texto ajustado.'
    write(FONT_KEY, fontStep)
  }
  smaller.addEventListener('click', () => changeFont(fontStep - 1))
  larger.addEventListener('click', () => changeFont(fontStep + 1))
  query('[data-reader-reset]').addEventListener('click', () => changeFont(0))
  applyFont()
  const save = query('[data-reader-save]'), dialog = query('[data-reader-dialog]')
  function updateSave() {
    const active = saved.some(item => item.id === current.id)
    save.setAttribute('aria-pressed', String(active))
    save.textContent = active ? 'Salva ✓' : 'Salvar'
    save.setAttribute('aria-label', active ? 'Remover matéria dos favoritos' : 'Salvar matéria')
    query('[data-reader-count]').textContent = '(' + saved.length + ')'
  }
  save.addEventListener('click', () => {
    const active = saved.some(item => item.id === current.id)
    saved = active ? saved.filter(item => item.id !== current.id) : [current, ...saved].slice(0, 50)
    updateSave()
    status.textContent = active ? 'Matéria removida dos favoritos.' : 'Matéria salva. Encontre em “Salvas”. São guardadas até 50 matérias.'
    write(SAVED_KEY, saved)
  })
  function renderSaved() {
    const list = query('[data-reader-saved-items]')
    list.replaceChildren()
    query('[data-reader-empty]').hidden = saved.length !== 0
    for (const item of saved) {
      const row = document.createElement('li'), link = document.createElement('a'), remove = document.createElement('button')
      link.href = item.url; link.textContent = item.title
      remove.type = 'button'; remove.textContent = 'Remover'; remove.setAttribute('aria-label', 'Remover dos favoritos: ' + item.title)
      remove.addEventListener('click', () => {
        const nextId = saved[saved.findIndex(entry => entry.id === item.id) + 1]?.id
        saved = saved.filter(entry => entry.id !== item.id)
        write(SAVED_KEY, saved); updateSave(); renderSaved()
        const next = nextId ? list.querySelector('[data-saved-id="' + nextId + '"] button') : null
        ;(next || query('[data-reader-close]')).focus()
      })
      row.dataset.savedId = String(item.id); row.append(link, remove); list.append(row)
    }
  }
  query('[data-reader-list]').addEventListener('click', () => { renderSaved(); dialog.showModal() })
  query('[data-reader-close]').addEventListener('click', () => dialog.close())
  updateSave()
  root.hidden = false
  if (root.dataset.resumeEnabled !== '1') return
  const resume = query('[data-reader-resume]'), previous = progress[current.id]
  let resumePending = Boolean(previous && previous.ratio > 0.06 && previous.ratio < 0.92)
  resume.hidden = !resumePending
  let interacted = false, timer
  query('[data-reader-continue]').addEventListener('click', () => {
    resumePending = false; resume.hidden = true; interacted = true
    const top = body.getBoundingClientRect().top + window.scrollY
    window.scrollTo({ top: Math.max(0, top + previous.ratio * body.scrollHeight - window.innerHeight * 0.2), behavior: 'instant' })
  })
  query('[data-reader-dismiss]').addEventListener('click', () => { resumePending = false; resume.hidden = true })
  function saveProgress() {
    if (!interacted || resumePending) return
    const top = body.getBoundingClientRect().top + window.scrollY
    const ratio = Math.max(0, Math.min(1, (window.scrollY + window.innerHeight * 0.2 - top) / Math.max(1, body.scrollHeight)))
    if (ratio < 0.06) return
    progress[current.id] = { ratio, at: Date.now() }
    progress = normalizeProgress(progress)
    write(PROGRESS_KEY, progress)
  }
  window.addEventListener('scroll', () => {
    interacted = true
    if (!timer) timer = window.setTimeout(() => { timer = undefined; saveProgress() }, 1500)
  }, { passive: true })
  window.addEventListener('pagehide', saveProgress)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveProgress() })
}

if (typeof document !== 'undefined') initializeReaderTools()
