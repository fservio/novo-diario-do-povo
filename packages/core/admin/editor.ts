/**
 * Markdown Editor Component (SSR + CSP Nonce)
 * 
 * Features:
 * - Complete toolbar (Bold, Italic, H2, H3, UL, OL, Quote, Code, Divider, Image)
 * - Keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+K)
 * - Image insertion with caption via API
 * - Selection preservation in textarea
 * - CSP nonce compliance
 */

interface MarkdownEditorParams {
  name: string
  value: string
  nonce: string
  id?: string
}

/**
 * Helper para renderizar scripts inline com nonce CSP
 */
export function renderScript(params: { nonce: string; js: string }): string {
  return `<script nonce="${params.nonce}">${params.js}</script>`
}

/**
 * Renderiza o Editor Markdown completo
 */
export function renderMarkdownEditor(params: MarkdownEditorParams): string {
  const { name, value, nonce, id = 'mdEditor' } = params

  return `
    <!-- Markdown Editor -->
    <div class="markdown-editor-container" style="border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; background: var(--bg-card);">
      <!-- Toolbar -->
      <div id="mdToolbar" class="editor-toolbar" style="background: var(--bg-main); border-bottom: 1px solid var(--border-color); padding: 0.625rem; display: flex; gap: 0.375rem; flex-wrap: wrap; align-items: center;">
        <button type="button" data-action="bold" title="Negrito (Ctrl+B)" class="toolbar-btn">
          <strong>B</strong>
        </button>
        <button type="button" data-action="italic" title="Itálico (Ctrl+I)" class="toolbar-btn">
          <em>I</em>
        </button>
        <button type="button" data-action="link" title="Link (Ctrl+K)" class="toolbar-btn">
          🔗
        </button>
        <span class="toolbar-divider" style="width: 1px; height: 20px; background: var(--border-color); margin: 0 0.25rem;"></span>
        <button type="button" data-action="h2" title="Título 2" class="toolbar-btn">
          H2
        </button>
        <button type="button" data-action="h3" title="Título 3" class="toolbar-btn">
          H3
        </button>
        <span class="toolbar-divider" style="width: 1px; height: 20px; background: var(--border-color); margin: 0 0.25rem;"></span>
        <button type="button" data-action="ul" title="Lista" class="toolbar-btn">
          • List
        </button>
        <button type="button" data-action="ol" title="Lista Numérica" class="toolbar-btn">
          1. List
        </button>
        <span class="toolbar-divider" style="width: 1px; height: 20px; background: var(--border-color); margin: 0 0.25rem;"></span>
        <button type="button" data-action="quote" title="Citação" class="toolbar-btn">
          " Quote
        </button>
        <button type="button" data-action="code" title="Código" class="toolbar-btn">
          &lt;/&gt;
        </button>
        <span class="toolbar-divider" style="width: 1px; height: 20px; background: var(--border-color); margin: 0 0.25rem;"></span>
        <button type="button" data-action="image" title="Inserir Imagem da Galeria" class="toolbar-btn" style="background: var(--accent-soft); color: var(--accent); border-color: rgba(59, 130, 246, 0.2); font-weight: 700; padding: 0.5rem 0.75rem;">
          🖼️ Inserir Mídia
        </button>
      </div>

      <!-- Textarea -->
      <textarea
        id="${id}"
        name="${name}"
        class="editor-textarea"
        placeholder="Escreva o conteúdo usando Markdown..."
        rows="25"
        style="width: 100%; padding: 1.25rem; border: none; background: transparent; color: var(--text-main); font-family: 'JetBrains Mono', 'Monaco', 'Menlo', monospace; font-size: 1rem; line-height: 1.7; resize: vertical; outline: none;"
      >${value}</textarea>
    </div>

    <!-- Modal de Inserção de Imagem -->
    <div id="mediaPickerModal" class="modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); z-index: 1000; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
      <div class="modal-content" style="background: var(--bg-card); border-radius: var(--radius-lg); width: 90%; max-width: 800px; max-height: 85vh; display: flex; flex-direction: column; border: 1px solid var(--border-color); box-shadow: var(--shadow-md);">
        <div class="modal-header" style="padding: 1.25rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 1.25rem; font-weight: 700; color: var(--text-main);">🖼️ Selecionar Mídia</h3>
          <button type="button" class="modal-close" data-action="closeModal" style="background: none; border: none; font-size: 1.75rem; cursor: pointer; color: var(--text-muted); padding: 0.25rem;">&times;</button>
        </div>
        <div class="modal-body" style="padding: 1.5rem; overflow-y: auto; flex: 1;">
          <!-- Busca -->
          <div class="field" style="margin-bottom: 1.5rem;">
            <input
              type="text"
              id="mediaSearch"
              placeholder="🔍 Buscar imagens na biblioteca..."
              style="background: var(--bg-main); border: 1px solid var(--border-color);"
            />
          </div>

          <!-- Grid de Resultados -->
          <div id="mediaGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
            <p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">Digite para buscar imagens...</p>
          </div>

          <!-- Campos de Legenda -->
          <div class="caption-input card" style="display: none; background: var(--bg-main); border: 1px solid var(--border-color); margin-top: 2rem;">
            <div style="font-weight: 700; margin-bottom: 1rem; color: var(--text-main); display: flex; align-items: center; gap: 0.5rem;">
              <span>📝</span> Detalhes da Inserção
            </div>
            
            <div class="field">
              <label>URL Original</label>
              <input type="text" id="imageUrl" readonly style="font-family: monospace; font-size: 0.75rem; background: var(--bg-card); opacity: 0.7;">
            </div>
            
            <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="field">
                <label>Texto Alternativo (SEO)</label>
                <input type="text" id="imageAlt" placeholder="Descreva a imagem...">
              </div>
              <div class="field">
                <label>Legenda / Créditos</label>
                <input type="text" id="imageCaption" placeholder="Texto que aparecerá abaixo">
              </div>
            </div>
            
            <button type="button" class="btn" data-action="insertImage" style="width: 100%; margin-top: 1rem;">
               Confirmar Inserção
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- CSS Inline -->
    <style nonce="${nonce}">
      .toolbar-btn {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        color: var(--text-main);
        padding: 0.4rem 0.7rem;
        font-size: 0.8125rem;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .toolbar-btn:hover {
        background: var(--accent-soft);
        border-color: var(--accent);
        color: var(--accent);
      }
      .media-item {
        border-radius: var(--radius-md);
        overflow: hidden;
        border: 2px solid transparent;
        cursor: pointer;
        transition: all 0.2s;
        background: var(--bg-main);
      }
      .media-item img {
        width: 100%;
        height: 120px;
        object-fit: cover;
        display: block;
      }
      .media-item-name {
        padding: 0.5rem;
        font-size: 0.75rem;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .media-item:hover {
        transform: translateY(-2px);
        border-color: var(--accent);
      }
      .media-item.selected {
        border-color: var(--accent);
        background: var(--accent-soft);
      }
      .media-item.selected .media-item-name {
        color: var(--accent);
        font-weight: 700;
      }
      .editor-textarea::placeholder {
        color: var(--text-muted);
        opacity: 0.5;
      }
    </style>

    ${renderScript({
    nonce,
    js: `
      (function() {
        const editor = document.getElementById('${id}');
        const toolbar = document.getElementById('mdToolbar');
        const modal = document.getElementById('mediaPickerModal');
        const mediaSearch = document.getElementById('mediaSearch');
        const mediaGrid = document.getElementById('mediaGrid');
        const captionInput = document.querySelector('.caption-input');
        
        let selectedMedia = null;
        let searchTimeout = null;

        // Função para inserir texto no textarea preservando seleção
        function insertText(before, after = '', placeholder = '') {
          const start = editor.selectionStart;
          const end = editor.selectionEnd;
          const text = editor.value;
          const selectedText = text.substring(start, end) || placeholder;
          
          const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);
          editor.value = newText;
          
          // Restaurar foco e seleção
          editor.focus();
          const newCursorPos = start + before.length + selectedText.length;
          editor.setSelectionRange(newCursorPos, newCursorPos);
          
          // Disparar evento change
          editor.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Função para inserir texto em nova linha
        function insertLine(prefix) {
          const start = editor.selectionStart;
          const text = editor.value;
          
          // Encontrar início da linha atual
          let lineStart = start;
          while (lineStart > 0 && text[lineStart - 1] !== '\\n') {
            lineStart--;
          }
          
          const newText = text.substring(0, lineStart) + prefix + text.substring(lineStart);
          editor.value = newText;
          
          editor.focus();
          const newPos = lineStart + prefix.length;
          editor.setSelectionRange(newPos, newPos);
          editor.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Handlers da Toolbar
        const actions = {
          bold: () => insertText('**', '**', 'texto em negrito'),
          italic: () => insertText('*', '*', 'texto em itálico'),
          link: () => {
            const url = prompt('URL do link:');
            if (url) {
              const text = prompt('Texto do link (opcional):') || url;
              insertText(\`[\${text}](\${url})\`);
            }
          },
          h2: () => insertLine('## '),
          h3: () => insertLine('### '),
          ul: () => insertLine('- '),
          ol: () => insertLine('1. '),
          quote: () => insertLine('> '),
          code: () => {
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            const hasSelection = start !== end;
            
            if (hasSelection) {
              insertText('\`', '\`');
            } else {
              insertText('\\n\`\`\`\\n', '\\n\`\`\`\\n', 'código aqui');
            }
          },
          image: () => openMediaPicker(),
          closeModal: () => closeMediaPicker(),
          insertImage: () => insertSelectedImage()
        };

        // Event Listeners da Toolbar
        toolbar.addEventListener('click', (e) => {
          const button = e.target.closest('button[data-action]');
          if (button) {
            e.preventDefault();
            const action = button.dataset.action;
            if (actions[action]) {
              actions[action]();
            }
          }
        });

        // Atalhos de Teclado
        editor.addEventListener('keydown', (e) => {
          const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
          const modKey = isMac ? e.metaKey : e.ctrlKey;

          if (modKey && e.key === 'b') {
            e.preventDefault();
            actions.bold();
          } else if (modKey && e.key === 'i') {
            e.preventDefault();
            actions.italic();
          } else if (modKey && e.key === 'k') {
            e.preventDefault();
            actions.link();
          }
        });

        // Media Picker Functions
        function openMediaPicker() {
          modal.style.display = 'flex';
          mediaSearch.value = '';
          mediaGrid.innerHTML = '<p class="text-muted">Digite para buscar imagens...</p>';
          captionInput.style.display = 'none';
          selectedMedia = null;
          mediaSearch.focus();
        }

        function closeMediaPicker() {
          modal.style.display = 'none';
          selectedMedia = null;
        }

        // Busca de Mídia via API
        mediaSearch.addEventListener('input', (e) => {
          clearTimeout(searchTimeout);
          const query = e.target.value.trim();
          
          if (query.length < 2) {
            mediaGrid.innerHTML = '<p class="text-muted">Digite ao menos 2 caracteres...</p>';
            return;
          }

          searchTimeout = setTimeout(async () => {
            try {
              mediaGrid.innerHTML = '<p class="text-muted">Buscando...</p>';
              
              const response = await fetch(\`/api/admin/media/search?q=\${encodeURIComponent(query)}\`);
              const data = await response.json();
              
              if (!data.success || !data.results || data.results.length === 0) {
                mediaGrid.innerHTML = '<p class="text-muted">Nenhuma imagem encontrada.</p>';
                return;
              }
              
              renderMediaGrid(data.results);
            } catch (error) {
              console.error('Erro ao buscar mídia:', error);
              mediaGrid.innerHTML = '<p class="text-muted">Erro ao buscar imagens.</p>';
            }
          }, 300);
        });

        function renderMediaGrid(media) {
          mediaGrid.innerHTML = media.map(m => \`
            <div class="media-item" data-media-id="\${m.id}" data-r2-key="\${m.r2_key}" data-alt="\${m.alt || m.name || ''}" data-credits="\${m.credits || ''}">
              <img src="/i/\${m.r2_key}" alt="\${m.alt || m.name}" loading="lazy" />
              <div class="media-item-name">\${m.name}</div>
            </div>
          \`).join('');

          // Event listener para seleção
          mediaGrid.addEventListener('click', (e) => {
            const item = e.target.closest('.media-item');
            if (item) {
              // Remover seleção anterior
              document.querySelectorAll('.media-item.selected').forEach(el => {
                el.classList.remove('selected');
              });
              
              // Selecionar novo
              item.classList.add('selected');
              
              selectedMedia = {
                id: item.dataset.mediaId,
                r2Key: item.dataset.r2Key,
                alt: item.dataset.alt,
                credits: item.dataset.credits
              };
              
              // Mostrar campos de legenda
              document.getElementById('imageUrl').value = \`/i/\${selectedMedia.r2Key}\`;
              document.getElementById('imageAlt').value = selectedMedia.alt;
              document.getElementById('imageCaption').value = selectedMedia.credits;
              captionInput.style.display = 'block';
            }
          });
        }

        function insertSelectedImage() {
          if (!selectedMedia) return;
          
          const url = document.getElementById('imageUrl').value;
          const alt = document.getElementById('imageAlt').value || selectedMedia.alt || 'Imagem';
          const caption = document.getElementById('imageCaption').value.trim();
          
          let markdown = \`![\\n\${alt}\\n](\\n\${url}\\n)\`;
          if (caption) {
            markdown += \`\\n*\${caption}*\`;
          }
          
          insertText(markdown + '\\n\\n');
          closeMediaPicker();
        }

        // Fechar modal ao clicar fora ou acionar botões da modal
        modal.addEventListener('click', (e) => {
          const target = e.target;
          if (target instanceof HTMLElement) {
            const button = target.closest('button[data-action]');
            if (button) {
              e.preventDefault();
              const action = button.getAttribute('data-action');
              if (action && actions[action]) {
                actions[action]();
                return;
              }
            }
          }

          if (e.target === modal) {
            closeMediaPicker();
          }
        });

        // Fechar modal com ESC
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && modal.style.display === 'flex') {
            closeMediaPicker();
          }
        });
      })();
      `
  })}
  `
}
