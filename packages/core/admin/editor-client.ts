import { Editor, Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

type MediaRecord = {
  id: number
  r2_key: string
  filename: string
  alt?: string | null
  credits?: string | null
  width?: number | null
  height?: number | null
}

const EditorialImage = Node.create({
  name: 'editorialImage',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
      caption: { default: '' },
      credit: { default: '' },
      mediaId: { default: null },
      width: { default: null },
      height: { default: null }
    }
  },
  parseHTML() {
    return [
      {
        tag: 'figure.article-inline-image',
        getAttrs: element => {
          const figure = element as HTMLElement
          const image = figure.querySelector('img')
          const caption = figure.querySelector('figcaption')
          const credit = caption?.querySelector('.photo-credit')
          return {
            src: image?.getAttribute('src') || '',
            alt: image?.getAttribute('alt') || '',
            caption: caption?.textContent?.replace(credit?.textContent || '', '').trim() || '',
            credit: credit?.textContent?.trim() || '',
            width: image?.getAttribute('width') ? Number(image.getAttribute('width')) : null,
            height: image?.getAttribute('height') ? Number(image.getAttribute('height')) : null
          }
        }
      },
      {
        tag: 'img[src]',
        getAttrs: element => ({
          src: (element as HTMLImageElement).getAttribute('src') || '',
          alt: (element as HTMLImageElement).getAttribute('alt') || '',
          caption: (element as HTMLImageElement).getAttribute('title') || ''
        })
      }
    ]
  },
  renderHTML({ HTMLAttributes }) {
    const caption = String(HTMLAttributes.caption || '')
    const credit = String(HTMLAttributes.credit || '')
    const figcaption = caption || credit
      ? ['figcaption', {}, caption ? ['span', {}, caption] : '', credit ? ['span', { class: 'photo-credit' }, credit] : '']
      : ''
    return ['figure', mergeAttributes({ class: 'article-inline-image', 'data-editorial-image': 'true' }),
      ['img', {
        src: HTMLAttributes.src,
        alt: HTMLAttributes.alt || '',
        width: HTMLAttributes.width || undefined,
        height: HTMLAttributes.height || undefined,
        loading: 'lazy'
      }],
      figcaption
    ]
  }
})

function parseInitialJson(value: string): object | null {
  if (!value.trim()) return null
  try { return JSON.parse(value) as object } catch { return null }
}

function wordLabel(count: number): string {
  return `${count} ${count === 1 ? 'palavra' : 'palavras'}`
}

function initVisualEditor(): void {
  const root = document.querySelector<HTMLElement>('#visualEditor')
  const canvas = document.querySelector<HTMLElement>('#visualEditorCanvas')
  const form = document.querySelector<HTMLFormElement>('#postEditorForm')
  const jsonField = document.querySelector<HTMLTextAreaElement>('#visualContentJson')
  const htmlField = document.querySelector<HTMLTextAreaElement>('#visualContentHtml')
  const versionField = document.querySelector<HTMLInputElement>('#visualContentVersion')
  if (!root || !canvas || !form || !jsonField || !htmlField || !versionField) return

  const jsonContent = parseInitialJson(jsonField.value)
  const initialContent = jsonContent || htmlField.value || '<p></p>'
  const saveState = document.querySelector<HTMLElement>('#visualSaveState')
  const wordCount = document.querySelector<HTMLElement>('#visualWordCount')
  const readTime = document.querySelector<HTMLElement>('#visualReadTime')
  const blockSelect = document.querySelector<HTMLSelectElement>('#visualBlockType')
  const slashMenu = document.querySelector<HTMLElement>('#visualSlashMenu')
  const postId = Number(root.dataset.postId || 0)
  const autosaveUrl = root.dataset.autosaveUrl || ''
  const csrf = root.dataset.csrf || ''
  let dirty = false
  let autosaveDirty = false
  let manualDirty = false
  let autosaveSequence = 0
  let autosaveTimer: number | undefined
  let pendingAutosave: Promise<void> | null = null

  const editor = new Editor({
    element: canvas,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' }
      }),
      Placeholder.configure({ placeholder: 'Comece a escrever. Digite / para inserir um bloco…' }),
      EditorialImage
    ],
    content: initialContent,
    enableContentCheck: true,
    editorProps: {
      attributes: {
        class: 'visual-editor__prose',
        spellcheck: 'true',
        'aria-label': 'Conteúdo da matéria'
      }
    },
    onCreate: ({ editor }) => syncEditor(editor, false),
    onUpdate: ({ editor }) => {
      syncEditor(editor, true)
      scheduleAutosave()
    },
    onSelectionUpdate: ({ editor }) => updateToolbar(editor)
  })

  function syncEditor(instance: Editor, markDirty: boolean): void {
    jsonField.value = JSON.stringify(instance.getJSON())
    htmlField.value = instance.getHTML()
    const text = instance.getText().trim()
    const count = text ? text.split(/\s+/u).filter(Boolean).length : 0
    if (wordCount) wordCount.textContent = wordLabel(count)
    if (readTime) readTime.textContent = count < 200 ? 'menos de 1 min de leitura' : `${Math.ceil(count / 200)} min de leitura`
    if (markDirty) {
      autosaveSequence += 1
      autosaveDirty = true
      dirty = true
      root.classList.add('is-dirty')
      if (saveState) saveState.textContent = postId ? 'Alterações ainda não salvas' : 'Rascunho ainda não criado'
    }
  }

  function updateToolbar(instance: Editor): void {
    document.querySelectorAll<HTMLButtonElement>('[data-editor-command]').forEach(button => {
      const command = button.dataset.editorCommand
      const active = command === 'bold' ? instance.isActive('bold')
        : command === 'italic' ? instance.isActive('italic')
          : command === 'underline' ? instance.isActive('underline')
            : command === 'bulletList' ? instance.isActive('bulletList')
              : command === 'orderedList' ? instance.isActive('orderedList')
                : command === 'blockquote' ? instance.isActive('blockquote')
                  : command === 'link' ? instance.isActive('link') : false
      button.classList.toggle('is-active', active)
    })
    if (blockSelect) {
      blockSelect.value = instance.isActive('heading', { level: 2 }) ? 'heading2'
        : instance.isActive('heading', { level: 3 }) ? 'heading3'
          : instance.isActive('blockquote') ? 'blockquote' : 'paragraph'
    }
  }

  function runBlockCommand(command: string): void {
    const chain = editor.chain().focus()
    if (command === 'paragraph') chain.setParagraph().run()
    else if (command === 'heading2') chain.toggleHeading({ level: 2 }).run()
    else if (command === 'heading3') chain.toggleHeading({ level: 3 }).run()
    else if (command === 'blockquote') chain.toggleBlockquote().run()
    else if (command === 'bulletList') chain.toggleBulletList().run()
    else if (command === 'orderedList') chain.toggleOrderedList().run()
  }

  function runCommand(command: string): void {
    if (command === 'bold') editor.chain().focus().toggleBold().run()
    else if (command === 'italic') editor.chain().focus().toggleItalic().run()
    else if (command === 'underline') editor.chain().focus().toggleUnderline().run()
    else if (command === 'bulletList') editor.chain().focus().toggleBulletList().run()
    else if (command === 'orderedList') editor.chain().focus().toggleOrderedList().run()
    else if (command === 'blockquote') editor.chain().focus().toggleBlockquote().run()
    else if (command === 'horizontalRule') editor.chain().focus().setHorizontalRule().run()
    else if (command === 'undo') editor.chain().focus().undo().run()
    else if (command === 'redo') editor.chain().focus().redo().run()
    else if (command === 'link') {
      const current = String(editor.getAttributes('link').href || '')
      const href = window.prompt('Endereço do link', current || 'https://')
      if (href === null) return
      if (!href.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run()
      else editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim(), target: '_blank' }).run()
    } else if (command === 'media') openMediaDialog()
    else if (command === 'focus') document.body.classList.toggle('visual-editor-focus')
    updateToolbar(editor)
  }

  document.querySelectorAll<HTMLButtonElement>('[data-editor-command]').forEach(button => {
    button.addEventListener('click', () => runCommand(button.dataset.editorCommand || ''))
  })
  blockSelect?.addEventListener('change', () => runBlockCommand(blockSelect.value))

  canvas.addEventListener('keydown', event => {
    if (event.key === '/' && editor.state.selection.$from.parent.textContent.length === 0) {
      window.setTimeout(() => { if (slashMenu) slashMenu.hidden = false }, 0)
    }
    if (event.key === 'Escape' && slashMenu) slashMenu.hidden = true
  })
  document.querySelectorAll<HTMLButtonElement>('[data-slash-command]').forEach(button => {
    button.addEventListener('click', () => {
      const { from } = editor.state.selection
      if (from > 1 && editor.state.doc.textBetween(from - 1, from) === '/') editor.chain().focus().deleteRange({ from: from - 1, to: from }).run()
      const command = button.dataset.slashCommand || ''
      if (command === 'media') openMediaDialog()
      else runBlockCommand(command)
      if (slashMenu) slashMenu.hidden = true
    })
  })

  async function performAutosave(): Promise<void> {
    if (!autosaveDirty || !postId || !autosaveUrl) return
    const savingSequence = autosaveSequence
    if (saveState) saveState.textContent = 'Salvando automaticamente…'
    try {
      const response = await fetch(autosaveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({
          content_json: jsonField.value,
          content_version: Number(versionField.value || 1),
          title: (form.elements.namedItem('title') as HTMLInputElement | null)?.value || '',
          hat: (form.elements.namedItem('hat') as HTMLInputElement | null)?.value || '',
          excerpt: (form.elements.namedItem('excerpt') as HTMLTextAreaElement | null)?.value || ''
        })
      })
      const result = await response.json() as { success?: boolean; content_version?: number; error?: string }
      if (response.status === 409) throw new Error('Outra versão desta matéria foi salva. Recarregue a página antes de continuar.')
      if (!response.ok || !result.success) throw new Error(result.error || 'Falha no salvamento automático.')
      versionField.value = String(result.content_version || Number(versionField.value) + 1)
      root.dataset.contentVersion = versionField.value
      if (autosaveSequence === savingSequence) autosaveDirty = false
      dirty = autosaveDirty || manualDirty
      root.classList.toggle('is-dirty', dirty)
      root.classList.remove('has-save-error')
      if (saveState) {
        saveState.textContent = manualDirty
          ? 'Texto salvo; configurações aguardam “Salvar matéria”'
          : autosaveDirty
            ? 'Novas alterações aguardam salvamento automático'
            : `Salvo automaticamente às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      }
    } catch (error) {
      root.classList.add('has-save-error')
      if (saveState) saveState.textContent = error instanceof Error ? error.message : 'Não foi possível salvar automaticamente.'
    }
  }

  function autosave(): Promise<void> {
    if (pendingAutosave) return pendingAutosave
    const current = performAutosave().finally(() => {
      if (pendingAutosave === current) pendingAutosave = null
      if (autosaveDirty && autosaveSequence > 0) scheduleAutosave()
    })
    pendingAutosave = current
    return current
  }

  function scheduleAutosave(): void {
    if (!postId) return
    if (autosaveTimer) window.clearTimeout(autosaveTimer)
    autosaveTimer = window.setTimeout(() => { void autosave() }, 4_000)
  }

  form.addEventListener('input', event => {
    if ((event.target as HTMLElement).closest('#visualEditorCanvas')) return
    const field = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    const canAutosave = ['title', 'hat', 'excerpt'].includes(field.name)
    dirty = true
    if (canAutosave) {
      autosaveSequence += 1
      autosaveDirty = true
    } else {
      manualDirty = true
    }
    root.classList.add('is-dirty')
    if (saveState) saveState.textContent = postId ? 'Alterações ainda não salvas' : 'Rascunho ainda não criado'
    if (canAutosave) scheduleAutosave()
  })
  form.addEventListener('submit', event => {
    if (pendingAutosave) {
      event.preventDefault()
      const pending = pendingAutosave
      if (saveState) saveState.textContent = 'Concluindo salvamento automático…'
      void pending.finally(() => form.requestSubmit())
      return
    }
    syncEditor(editor, false)
    dirty = false
    autosaveDirty = false
    manualDirty = false
  })
  window.addEventListener('beforeunload', event => {
    if (!dirty) return
    event.preventDefault()
    event.returnValue = ''
  })
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      form.requestSubmit()
    }
  })
  document.querySelectorAll<HTMLElement>('[data-confirm-revision]').forEach(button => {
    button.addEventListener('click', event => {
      if (!window.confirm('Restaurar esta versão? O conteúdo atual também será preservado no histórico.')) event.preventDefault()
    })
  })

  const mediaDialog = document.querySelector<HTMLDialogElement>('#visualMediaDialog')
  const mediaSearch = document.querySelector<HTMLInputElement>('#visualMediaSearch')
  const mediaGrid = document.querySelector<HTMLElement>('#visualMediaGrid')
  const mediaDetails = document.querySelector<HTMLElement>('#visualMediaDetails')
  const mediaPreview = document.querySelector<HTMLImageElement>('#visualMediaPreview')
  const mediaAlt = document.querySelector<HTMLInputElement>('#visualMediaAlt')
  const mediaCaption = document.querySelector<HTMLTextAreaElement>('#visualMediaCaption')
  const mediaCredit = document.querySelector<HTMLInputElement>('#visualMediaCredit')
  let selectedMedia: MediaRecord | null = null

  function openMediaDialog(): void {
    mediaDialog?.showModal()
    window.setTimeout(() => mediaSearch?.focus(), 50)
    void searchMedia()
  }
  document.querySelector('[data-media-close]')?.addEventListener('click', () => mediaDialog?.close())

  async function searchMedia(): Promise<void> {
    if (!mediaGrid) return
    mediaGrid.replaceChildren(Object.assign(document.createElement('p'), { textContent: 'Carregando imagens…' }))
    try {
      const response = await fetch(`/api/admin/media/search?q=${encodeURIComponent(mediaSearch?.value || '')}&limit=30`)
      const result = await response.json() as { success?: boolean; results?: MediaRecord[] }
      mediaGrid.replaceChildren()
      if (!result.success || !result.results?.length) {
        mediaGrid.append(Object.assign(document.createElement('p'), { textContent: 'Nenhuma imagem encontrada.' }))
        return
      }
      result.results.forEach(media => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'visual-media-card'
        const image = document.createElement('img')
        image.src = `/i/${media.r2_key}?w=320&h=200&fit=cover`
        image.alt = media.alt || media.filename
        const label = document.createElement('span')
        label.textContent = media.filename
        button.append(image, label)
        button.addEventListener('click', () => selectMedia(media, button))
        mediaGrid.append(button)
      })
    } catch {
      mediaGrid.replaceChildren(Object.assign(document.createElement('p'), { textContent: 'Não foi possível consultar a biblioteca.' }))
    }
  }

  function selectMedia(media: MediaRecord, button: HTMLButtonElement): void {
    selectedMedia = media
    mediaGrid?.querySelectorAll('.is-selected').forEach(item => item.classList.remove('is-selected'))
    button.classList.add('is-selected')
    if (mediaDetails) mediaDetails.hidden = false
    if (mediaPreview) { mediaPreview.src = `/i/${media.r2_key}?w=640`; mediaPreview.alt = media.alt || media.filename }
    if (mediaAlt) mediaAlt.value = media.alt || media.filename
    if (mediaCaption) mediaCaption.value = ''
    if (mediaCredit) mediaCredit.value = media.credits || ''
  }

  document.querySelector('#visualMediaSearchButton')?.addEventListener('click', () => { void searchMedia() })
  mediaSearch?.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); void searchMedia() }
  })
  document.querySelector('#visualMediaInsert')?.addEventListener('click', () => {
    if (!selectedMedia) return
    editor.chain().focus().insertContent({
      type: 'editorialImage',
      attrs: {
        src: `/i/${selectedMedia.r2_key}`,
        alt: mediaAlt?.value.trim() || selectedMedia.filename,
        caption: mediaCaption?.value.trim() || '',
        credit: mediaCredit?.value.trim() || '',
        mediaId: selectedMedia.id,
        width: selectedMedia.width || null,
        height: selectedMedia.height || null
      }
    }).run()
    mediaDialog?.close()
    selectedMedia = null
  })

  updateToolbar(editor)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initVisualEditor)
else initVisualEditor()
