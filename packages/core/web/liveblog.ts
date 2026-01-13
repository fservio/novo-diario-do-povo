/**
 * LiveBlog Components
 * UI for timeline and live updates
 */

import type { LiveBlogUpdate } from '../db'
import { escapeHtml } from '../admin/ui'

export function renderLiveBlogTimeline(updates: LiveBlogUpdate[], isLive: boolean = true) {
  if (updates.length === 0) {
    return `
      <div class="liveblog-status-banner ${isLive ? 'is-live' : 'is-ended'}">
        ${isLive ? '🔴 AO VIVO: Aguardando atualizações...' : '🏁 Cobertura encerrada. Nenhuma atualização postada.'}
      </div>
      <div class="liveblog-empty">Ainda não há atualizações para esta cobertura.</div>
    `
  }

  return `
    <div class="liveblog-status-banner ${isLive ? 'is-live' : 'is-ended'}">
      ${isLive
      ? '<span class="pulse-dot"></span> <strong>AO VIVO:</strong> Acompanhe as últimas atualizações em tempo real'
      : '🏁 <strong>COBERTURA ENCERRADA:</strong> Veja os principais destaques abaixo'
    }
    </div>
    <div class="liveblog-timeline ${!isLive ? 'is-static' : ''}">
      ${updates.map(update => renderLiveUpdate(update, isLive)).join('')}
    </div>
  `
}

export function renderLiveUpdate(update: LiveBlogUpdate, isLive: boolean = true) {
  const date = new Date(update.published_at)
  const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const dateStr = date.toLocaleDateString('pt-BR')

  return `
    <article class="live-update ${update.is_pinned ? 'is-pinned' : ''}" id="update-${update.id}">
      <div class="update-meta">
        <div class="update-indicator">
          ${isLive ? '<div class="pulse-dot"></div>' : '<div class="static-dot"></div>'}
        </div>
        <time datetime="${update.published_at}">
          <span class="update-time">${timeStr}</span>
          <span class="update-date">${dateStr}</span>
        </time>
      </div>
      <div class="update-content">
        ${update.is_pinned ? '<div class="pinned-label">📌 Destaque</div>' : ''}
        ${update.title ? `<h3 class="update-title">${escapeHtml(update.title)}</h3>` : ''}
        <div class="update-body">
          ${update.content}
        </div>
        <div class="update-footer">
          <span class="update-author">Por ${escapeHtml(update.author_name || 'Redação')}</span>
        </div>
      </div>
    </article>
  `
}

export function renderLiveBlogScript(postSlug: string) {
  return `
    <script>
      (function() {
        const postSlug = '${postSlug}';
        let knownUpdateIds = new Set();
        
        // Initialize with IDs already on page
        document.querySelectorAll('.live-update').forEach(el => {
          const id = el.id.replace('update-', '');
          if (id) knownUpdateIds.add(parseInt(id));
        });

        async function checkForUpdates() {
          try {
            const res = await fetch(\`/api/public/posts/\${postSlug}/live-updates\`);
            const json = await res.json();
            if (json.success && json.data.length > 0) {
              const newUpdates = json.data.filter(u => !knownUpdateIds.has(u.id));
              
              if (newUpdates.length > 0) {
                showNotification(newUpdates[0]);
                // Add new IDs to set
                newUpdates.forEach(u => knownUpdateIds.add(u.id));
              }
            }
          } catch (e) {
            console.error('[LiveBlog] Erro ao verificar atualizações:', e);
          }
        }

        function showNotification(update) {
          if (document.querySelector('.new-updates-banner')) return;

          const banner = document.createElement('div');
          banner.className = 'new-updates-banner';
          banner.innerHTML = 'Novas atualizações disponíveis. <a href="javascript:location.reload()" style="color: white; text-decoration: underline; margin-left: 0.5rem; font-weight: 800;">Clique para carregar</a>';
          document.body.prepend(banner);
        }

        // Poll every 15 seconds
        setInterval(checkForUpdates, 15000);
        
        // Re-check on focus
        window.addEventListener('focus', checkForUpdates);
      })();
    </script>
  `
}
