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
    <div class="markdown-editor-container">
      <!-- Toolbar -->
      <div id="mdToolbar" class="editor-toolbar">
        <button type="button" data-action="bold" title="Bold (Ctrl+B)">
          <strong>B</strong>
        </button>
        <button type="button" data-action="italic" title="Italic (Ctrl+I)">
          <em>I</em>
        </button>
        <button type="button" data-action="link" title="Link (Ctrl+K)">
          🔗
        </button>
        <span class="toolbar-divider"></span>
        <button type="button" data-action="h2" title="Heading 2">
          H2
        </button>
        <button type="button" data-action="h3" title="Heading 3">
          H3
        </button>
        <span class="toolbar-divider"></span>
        <button type="button" data-action="ul" title="Unordered List">
          • List
        </button>
        <button type="button" data-action="ol" title="Ordered List">
          1. List
        </button>
        <span class="toolbar-divider"></span>
        <button type="button" data-action="quote" title="Blockquote">
          " Quote
        </button>
        <button type="button" data-action="code" title="Code Block">
          &lt;/&gt; Code
        </button>
        <span class="toolbar-divider"></span>
        <button type="button" data-action="image" title="Insert Image">
          🖼️ Imagem
        </button>
      </div>

      <!-- Textarea -->
      <textarea
        id="${id}"
        name="${name}"
        class="editor-textarea"
        placeholder="Escreva seu conteúdo em Markdown..."
        rows="20"
      >${value}</textarea>
    </div>

    <!-- Modal de Inserção de Imagem -->
    <div id="mediaPickerModal" class="modal" style="display: none;">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Inserir Imagem</h3>
          <button type="button" class="modal-close" data-action="closeModal">&times;</button>
        </div>
        <div class="modal-body">
          <!-- Busca -->
          <div class="search-box">
            <input
              type="text"
              id="mediaSearch"
              placeholder="Buscar imagens..."
              class="search-input"
            />
          </div>

          <!-- Grid de Resultados -->
          <div id="mediaGrid" class="media-grid">
            <p class="text-muted">Digite para buscar imagens...</p>
          </div>

          <!-- Campos de Legenda -->
          <div class="caption-input" style="display: none;">
            <label>URL da Imagem:</label>
            <input type="text" id="imageUrl" readonly class="form-control" />
            
            <label>Texto Alternativo (ALT):</label>
            <input type="text" id="imageAlt" class="form-control" placeholder="Descrição da imagem" />
            
            <label>Legenda (opcional):</label>
            <input type="text" id="imageCaption" class="form-control" placeholder="Legenda da imagem" />
            
            <button type="button" class="btn btn-primary" data-action="insertImage">
              Inserir Imagem
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- CSS Inline -->
    <style nonce="${nonce}">
      .markdown-editor-container {
        border: 1px solid #ddd;
        border-radius: 4px;
        overflow: hidden;
        background: white;
      }

      .editor-toolbar {
        background: #f5f5f5;
        border-bottom: 1px solid #ddd;
        padding: 8px;
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }

      .editor-toolbar button {
        background: white;
        border: 1px solid #ddd;
        border-radius: 3px;
        padding: 6px 12px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s;
      }

      .editor-toolbar button:hover {
        background: #e8f4fd;
        border-color: #0066cc;
      }

      .editor-toolbar button:active {
        background: #d0e8f7;
      }

      .toolbar-divider {
        width: 1px;
        background: #ddd;
        margin: 0 4px;
      }

      .editor-textarea {
        width: 100%;
        padding: 12px;
        border: none;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 14px;
        line-height: 1.6;
        resize: vertical;
      }

      .editor-textarea:focus {
        outline: none;
        background: #fafafa;
      }

      /* Modal Styles */
      .modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .modal-content {
        background: white;
        border-radius: 8px;
        width: 90%;
        max-width: 800px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
      }

      .modal-header {
        padding: 16px;
        border-bottom: 1px solid #ddd;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .modal-header h3 {
        margin: 0;
        font-size: 18px;
      }

      .modal-close {
        background: none;
        border: none;
        font-size: 28px;
        cursor: pointer;
        color: #666;
        padding: 0;
        width: 32px;
        height: 32px;
        line-height: 1;
      }

      .modal-close:hover {
        color: #000;
      }

      .modal-body {
        padding: 16px;
        overflow-y: auto;
      }

      .search-box {
        margin-bottom: 16px;
      }

      .search-input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
      }

      .media-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }

      .media-item {
        border: 2px solid transparent;
        border-radius: 4px;
        overflow: hidden;
        cursor: pointer;
        transition: all 0.2s;
      }

      .media-item:hover {
        border-color: #0066cc;
        transform: scale(1.02);
      }

      .media-item.selected {
        border-color: #0066cc;
        box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.2);
      }

      .media-item img {
        width: 100%;
        height: 150px;
        object-fit: cover;
        display: block;
      }

      .media-item-name {
        padding: 4px 8px;
        font-size: 12px;
        background: #f5f5f5;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .caption-input {
        border-top: 1px solid #ddd;
        padding-top: 16px;
        margin-top: 16px;
      }

      .caption-input label {
        display: block;
        margin-top: 12px;
        margin-bottom: 4px;
        font-weight: 600;
        font-size: 14px;
      }

      .form-control {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
      }

      .btn {
        padding: 10px 20px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        margin-top: 16px;
      }

      .btn-primary {
        background: #0066cc;
        color: white;
      }

      .btn-primary:hover {
        background: #0052a3;
      }

      .text-muted {
        color: #999;
        text-align: center;
        padding: 32px;
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

        // Fechar modal ao clicar fora
        modal.addEventListener('click', (e) => {
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
