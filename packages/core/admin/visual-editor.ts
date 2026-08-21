import { escapeHtml, renderAdminIcon } from './ui'

interface VisualEditorParams {
  contentJson?: string | null
  legacyHtml?: string | null
  postId?: number
  contentVersion?: number
  csrfToken: string
}

const icon = (name: string) => `<span class="admin-icon">${renderAdminIcon(name)}</span>`

export function renderVisualEditor(params: VisualEditorParams): string {
  const { contentJson, legacyHtml, postId, contentVersion = 1, csrfToken } = params
  const autosaveUrl = postId ? `/api/admin/posts/${postId}/autosave` : ''

  return `
    <section
      class="visual-editor"
      id="visualEditor"
      data-post-id="${postId || ''}"
      data-autosave-url="${escapeHtml(autosaveUrl)}"
      data-csrf="${escapeHtml(csrfToken)}"
      data-content-version="${contentVersion}"
    >
      <header class="visual-editor__header">
        <div>
          <span class="visual-editor__eyebrow">Editor visual</span>
          <strong>Corpo da matéria</strong>
        </div>
        <div class="visual-editor__status" aria-live="polite">
          <span class="visual-editor__status-dot"></span>
          <span id="visualSaveState">${postId ? 'Todas as alterações salvas' : 'O rascunho será criado ao salvar'}</span>
        </div>
      </header>

      <div class="visual-editor__toolbar" id="visualEditorToolbar" role="toolbar" aria-label="Formatação da matéria">
        <select class="visual-editor__block-select" id="visualBlockType" aria-label="Tipo de bloco">
          <option value="paragraph">Texto</option>
          <option value="heading2">Intertítulo</option>
          <option value="heading3">Subintertítulo</option>
          <option value="blockquote">Citação</option>
        </select>
        <span class="visual-editor__divider"></span>
        <button type="button" data-editor-command="bold" title="Negrito (Ctrl+B)" aria-label="Negrito"><strong>B</strong></button>
        <button type="button" data-editor-command="italic" title="Itálico (Ctrl+I)" aria-label="Itálico"><em>I</em></button>
        <button type="button" data-editor-command="underline" title="Sublinhado (Ctrl+U)" aria-label="Sublinhado"><u>U</u></button>
        <button type="button" data-editor-command="link" title="Inserir link (Ctrl+K)" aria-label="Inserir link">${icon('external')}</button>
        <span class="visual-editor__divider"></span>
        <button type="button" data-editor-command="bulletList" title="Lista" aria-label="Lista">•</button>
        <button type="button" data-editor-command="orderedList" title="Lista numerada" aria-label="Lista numerada">1.</button>
        <button type="button" data-editor-command="blockquote" title="Citação" aria-label="Citação">“ ”</button>
        <button type="button" data-editor-command="horizontalRule" title="Separador" aria-label="Separador">—</button>
        <span class="visual-editor__divider"></span>
        <button type="button" class="visual-editor__media-button" data-editor-command="media">${icon('media')} Imagem</button>
        <button type="button" data-editor-command="undo" title="Desfazer" aria-label="Desfazer">↶</button>
        <button type="button" data-editor-command="redo" title="Refazer" aria-label="Refazer">↷</button>
        <button type="button" class="visual-editor__focus-button" data-editor-command="focus" title="Modo de escrita sem distrações">Foco</button>
      </div>

      <div class="visual-editor__canvas" id="visualEditorCanvas"></div>
      <textarea name="content_json" id="visualContentJson" hidden>${escapeHtml(contentJson || '')}</textarea>
      <textarea name="content" id="visualContentHtml" hidden>${escapeHtml(legacyHtml || '')}</textarea>
      <input type="hidden" name="content_version" id="visualContentVersion" value="${contentVersion}">

      <div class="visual-editor__slash" id="visualSlashMenu" hidden>
        <span>Adicionar bloco</span>
        <button type="button" data-slash-command="paragraph"><strong>¶</strong><span>Texto<small>Parágrafo comum</small></span></button>
        <button type="button" data-slash-command="heading2"><strong>H2</strong><span>Intertítulo<small>Organiza a leitura</small></span></button>
        <button type="button" data-slash-command="heading3"><strong>H3</strong><span>Subintertítulo<small>Segundo nível</small></span></button>
        <button type="button" data-slash-command="blockquote"><strong>“</strong><span>Citação<small>Declaração em destaque</small></span></button>
        <button type="button" data-slash-command="bulletList"><strong>•</strong><span>Lista<small>Itens sem ordem</small></span></button>
        <button type="button" data-slash-command="media"><strong>▧</strong><span>Imagem<small>Biblioteca editorial</small></span></button>
      </div>

      <footer class="visual-editor__footer">
        <span id="visualWordCount">0 palavras</span>
        <span id="visualReadTime">menos de 1 min de leitura</span>
        <span>Digite <kbd>/</kbd> para inserir um bloco</span>
      </footer>

      <dialog class="visual-media-dialog" id="visualMediaDialog">
        <div class="visual-media-dialog__head">
          <div><span class="visual-editor__eyebrow">Biblioteca editorial</span><h3>Inserir imagem na matéria</h3></div>
          <button type="button" data-media-close aria-label="Fechar">×</button>
        </div>
        <div class="visual-media-dialog__search">
          <input class="form-control" id="visualMediaSearch" placeholder="Buscar por arquivo, legenda ou crédito">
          <button type="button" class="btn" id="visualMediaSearchButton">Buscar</button>
        </div>
        <div class="visual-media-dialog__body">
          <div class="visual-media-dialog__grid" id="visualMediaGrid"><p>Busque uma imagem na biblioteca.</p></div>
          <aside class="visual-media-dialog__details" id="visualMediaDetails" hidden>
            <img id="visualMediaPreview" alt="">
            <div class="form-group"><label for="visualMediaAlt">Texto alternativo</label><input class="form-control" id="visualMediaAlt" maxlength="300"></div>
            <div class="form-group"><label for="visualMediaCaption">Legenda</label><textarea class="form-control" id="visualMediaCaption" rows="3" maxlength="1000"></textarea></div>
            <div class="form-group"><label for="visualMediaCredit">Crédito</label><input class="form-control" id="visualMediaCredit" maxlength="300"></div>
            <button type="button" class="btn" id="visualMediaInsert">Inserir na matéria</button>
          </aside>
        </div>
      </dialog>
    </section>
    <script type="module" src="/static/admin-editor.js?v=20260821-1"></script>
  `
}
