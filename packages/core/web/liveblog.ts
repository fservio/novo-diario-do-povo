/**
 * LiveBlog Components
 * UI for timeline and live updates
 */

import type { LiveBlogUpdate } from '../db'
import { escapeHtml } from '../admin/ui'
import { sanitizeHtml } from '../render/sanitize'

export function renderLiveBlogTimeline(updates: LiveBlogUpdate[], isLive: boolean = true, articleContent: string = '') {
  const content = sanitizeHtml(articleContent)
  const hasContent = !!content.replace(/<[^>]*>/g, '').trim() || /<img\b/i.test(content)
  return `<section id="liveblog-feed" aria-live="polite">${hasContent ? `<div id="articleBody" class="article-content">${content}</div>` : ''}${renderTimelineContent(updates, isLive, hasContent)}</section>`
}

function renderTimelineContent(updates: LiveBlogUpdate[], isLive: boolean, hasContent: boolean) {
  if (updates.length === 0) {
    if (hasContent) return `<div class="liveblog-status-banner ${isLive ? 'is-live' : 'is-ended'}">${isLive ? '<span class="pulse-dot"></span> <strong>AO VIVO:</strong> Acompanhe as últimas atualizações em tempo real' : '🏁 <strong>COBERTURA ENCERRADA</strong>'}</div>`
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
          ${sanitizeHtml(update.content)}
        </div>
        <div class="update-footer">
          <span class="update-author">Por ${escapeHtml(update.author_name || 'Redação')}</span>
        </div>
      </div>
    </article>
  `
}

export function renderLiveBlogScript(postSlug: string, nonce: string) {
  return `
    <script nonce="${escapeHtml(nonce)}">
      (function() {
        const postSlug = ${JSON.stringify(postSlug).replace(/</g, '\\u003c')};
        let snapshot = null;
        let pending = false;
        let timer;

        async function checkForUpdates() {
          if (pending) return;
          pending = true;
          try {
            const res = await fetch(\`/api/public/posts/\${encodeURIComponent(postSlug)}/live-updates\`, { cache: 'no-store' });
            if (!res.ok) return;
            const json = await res.json();
            if (json.success && typeof json.html === 'string') {
              const nextSnapshot = JSON.stringify([json.is_live, json.data, json.html]);
              const feed = document.getElementById('liveblog-feed');
              if (feed && nextSnapshot !== snapshot) {
                feed.outerHTML = json.html;
                snapshot = nextSnapshot;
              }
              if (!json.is_live) {
                clearInterval(timer);
                window.removeEventListener('focus', checkForUpdates);
              }
            }
          } catch (e) {
            console.error('[LiveBlog] Erro ao verificar atualizações:', e);
          } finally {
            pending = false;
          }
        }
        function start() {
          timer = setInterval(checkForUpdates, 15000);
          window.addEventListener('focus', checkForUpdates);
          checkForUpdates();
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
          start();
        }
      })();
    </script>
  `
}
