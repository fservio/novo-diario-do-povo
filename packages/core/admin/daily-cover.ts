import { renderAdminLayout, type AdminUser, renderCsrfInput } from './ui'
import type { MediaItem } from '../db/media'
import type { Setting } from '../db/settings'

export function renderDailyCoverPage(params: {
    currentCoverId: number | null
    currentCoverMedia: MediaItem | null
    user: AdminUser
    csrfToken: string
    cspNonce: string
    success?: boolean
    error?: string
}): string {
    const { currentCoverId, currentCoverMedia, user, csrfToken, cspNonce, success, error } = params

    const bodyHtml = `
    <div style="margin-bottom: 2rem;">
      <h1 class="section-title">Capa do Dia</h1>
      <p style="color: var(--text-muted);">Defina a imagem de destaque que aparecerá na página inicial e no topo do aplicativo.</p>
    </div>
    
    ${success ? `
      <div style="padding: 1rem; background: rgba(16, 185, 129, 0.1); color: #10b981; border-radius: 8px; margin-bottom: 1.5rem; font-weight: 500;">
        ✅ Capa do dia atualizada com sucesso!
      </div>
    ` : ''}

    ${error ? `
      <div style="padding: 1rem; background: rgba(239, 68, 68, 0.1); color: #ef4444; border-radius: 8px; margin-bottom: 1.5rem; font-weight: 500;">
        ❌ ${error}
      </div>
    ` : ''}

    <form method="post" action="/api/admin/settings" class="card" style="max-width: 600px;">
      ${renderCsrfInput(csrfToken)}
      <input type="hidden" name="setting_key" value="daily_cover">
      
      <div class="field">
        <label>Imagem da Capa</label>
        
        <div id="previewContainer" style="margin: 1rem 0; aspect-ratio: 16/9; background: var(--bg-main); border-radius: 12px; overflow: hidden; border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center; position: relative;">
          ${currentCoverMedia ? `
            <img src="https://pub-77114170e599427092eb96ac6e46955a.r2.dev/${currentCoverMedia.r2_key}" style="width: 100%; height: 100%; object-fit: cover;">
          ` : `
            <span style="color: var(--text-muted);">Nenhuma capa selecionada</span>
          `}
        </div>

        <div style="display: flex; gap: 0.5rem;">
          <input 
            type="number" 
            name="value_json" 
            id="coverMediaInput"
            value="${currentCoverId || ''}"
            placeholder="ID da Mídia"
            style="flex: 1;"
            readonly
          >
          <button type="button" class="btn" id="openMediaPickerBtn" style="padding: 0 1rem; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);">
            🔍 Buscar
          </button>
           <button type="button" class="btn" id="clearBtn" style="padding: 0 1rem; background: var(--bg-card); color: var(--danger); border: 1px solid var(--border-color);">
            ❌ Remover
          </button>
        </div>
      </div>

      <div style="margin-top: 2rem;">
        <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center;">Salvar Alterações</button>
      </div>
    </form>

    <!-- Media Picker Modal (Repurposed) -->
    <dialog id="mediaPicker" style="padding: 0; border: none; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); width: 100%; max-width: 800px; backdrop-filter: blur(10px); background: rgba(255, 255, 255, 0.95);">
        <div style="padding: 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 1.25rem;">Selecionar Mídia</h3>
          <button type="button" id="closeMediaPickerBtn" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
        </div>
        <div style="padding: 1.5rem;">
          <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem;">
            <input type="text" id="mediaSearch" placeholder="Buscar por nome..." style="flex: 1; padding: 0.75rem;">
            <button type="button" class="btn" id="doSearchMediaBtn" style="padding: 0 2rem;">Buscar</button>
          </div>
          <div id="mediaResults" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 1rem; max-height: 400px; overflow-y: auto; padding: 0.5rem;">
            <p style="color: var(--text-muted); text-align: center; grid-column: 1/-1; padding: 2rem;">Digite e busque para encontrar imagens...</p>
          </div>
        </div>
    </dialog>

    <script nonce="${cspNonce}">
      document.addEventListener('DOMContentLoaded', () => {
        const picker = document.getElementById('mediaPicker');
        const openBtn = document.getElementById('openMediaPickerBtn');
        const closeBtn = document.getElementById('closeMediaPickerBtn');
        const searchBtn = document.getElementById('doSearchMediaBtn');
        const results = document.getElementById('mediaResults');
        const input = document.getElementById('coverMediaInput');
        const searchInput = document.getElementById('mediaSearch');
        const preview = document.getElementById('previewContainer');
        const clearBtn = document.getElementById('clearBtn');

        if (openBtn) openBtn.addEventListener('click', () => picker.showModal());
        if (closeBtn) closeBtn.addEventListener('click', () => picker.close());
        
        if (clearBtn) {
          clearBtn.addEventListener('click', () => {
            input.value = '';
            preview.innerHTML = '<span style="color: var(--text-muted);">Nenhuma capa selecionada</span>';
          });
        }

        async function doSearch() {
            const query = searchInput.value;
            results.innerHTML = '<p style="text-align: center; grid-column: 1/-1;">Carregando...</p>';
            
            try {
              const res = await fetch(\`/api/admin/media/search?q=\${encodeURIComponent(query)}&limit=20\`);
              const json = await res.json();
              
              if (json.success && json.results.length > 0) {
                results.innerHTML = json.results.map(m => \`
                  <div 
                    data-media-id="\${m.id}"
                    data-media-key="\${m.r2_key}"
                    style="cursor: pointer; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; transition: all 0.2s;"
                    onmouseover="this.style.transform='scale(1.02)'; this.style.borderColor='var(--accent)'"
                    onmouseout="this.style.transform='scale(1)'; this.style.borderColor='var(--border-color)'"
                  >
                    <div style="aspect-ratio: 16/9; background: #eee; overflow: hidden;">
                       <img src="https://pub-77114170e599427092eb96ac6e46955a.r2.dev/\${m.r2_key}" style="width: 100%; height: 100%; object-fit: cover; pointer-events: none;">
                    </div>
                    <div style="padding: 0.5rem; font-size: 0.75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;">
                      \${m.filename}
                    </div>
                  </div>
                \`).join('');
              } else {
                results.innerHTML = '<p style="text-align: center; grid-column: 1/-1;">Nenhuma imagem encontrada.</p>';
              }
            } catch (e) {
              console.error(e);
              results.innerHTML = '<p style="color: red; text-align: center; grid-column: 1/-1;">Erro ao buscar.</p>';
            }
        }

        if (searchBtn) searchBtn.addEventListener('click', doSearch);
        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') {
                e.preventDefault(); 
                doSearch();
              }
            });
        }

        if (results) {
            results.addEventListener('click', (e) => {
              const card = e.target.closest('[data-media-id]');
              if (card) {
                input.value = card.dataset.mediaId;
                const r2Key = card.dataset.mediaKey;
                preview.innerHTML = \`<img src="https://pub-77114170e599427092eb96ac6e46955a.r2.dev/\${r2Key}" style="width: 100%; height: 100%; object-fit: cover;">\`;
                picker.close();
              }
            });
        }
      });
    </script>
  `

    return renderAdminLayout({
        title: 'Capa do Dia',
        user,
        bodyHtml,
        activeTab: 'daily-cover',
        csrfToken
    })
}
