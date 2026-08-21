import type { Post } from '../db/posts'
import { buildArticleShareMessage } from '../web/social'
import { escapeHtml } from './ui'

const SOCIAL_SITE_NAME = 'Diário do Povo'
const SOCIAL_DISPLAY_DOMAIN = 'DIARIO.DOPOVO.COM.BR'

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function clean(value: string | null | undefined): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function renderSocialSharingPanel(params: {
  post?: Post
  csrfToken: string
  cspNonce: string
}): string {
  const { post, csrfToken, cspNonce } = params
  const isNew = !post
  const socialTitle = clean(post?.social_title)
  const socialDescription = clean(post?.social_description)
  const shareTemplate = String(post?.social_share_text || '')
  const fallbackTitle = clean(post?.title) || 'Título da matéria'
  const fallbackDescription = clean(post?.excerpt) || 'O resumo editorial aparecerá aqui para contextualizar o leitor.'
  const previewTitle = socialTitle || fallbackTitle
  const previewDescription = socialDescription || fallbackDescription
  const previewUrl = post?.slug
    ? `https://diario.dopovo.com.br/${post.slug}`
    : 'https://diario.dopovo.com.br/materia'
  const previewMessage = buildArticleShareMessage({
    title: previewTitle,
    description: previewDescription,
    url: previewUrl,
    siteName: SOCIAL_SITE_NAME,
    template: shareTemplate
  })
  const coverUrl = post?.cover_media_url ? `/i/${post.cover_media_url}?w=1200&h=630&fit=cover&q=92` : ''
  const generatedUrl = post?.social_image_url ? `/i/${post.social_image_url}` : ''
  const previewImage = generatedUrl || coverUrl
  const positionX = post?.social_image_position_x ?? 50
  const positionY = post?.social_image_position_y ?? 50
  const canGenerate = Boolean(post?.id && post.cover_media_url)
  const coverCredit = clean(post?.cover_media_credits)

  return `
    <details class="post-social-panel" open>
      <summary>
        <span><small>Distribuição</small>WhatsApp e redes sociais</span>
        <span class="post-social-panel__status">Open Graph</span>
      </summary>
      <div class="post-social-panel__body">
        <div class="post-social-panel__intro">
          <strong>Prévia profissional da matéria</strong>
          <p>Personalize apenas quando necessário. Campos vazios usam automaticamente o título, a linha de apoio e a capa.</p>
        </div>

        <div class="form-group">
          <div class="post-social-panel__label-row"><label for="socialTitle">Título social</label><span data-counter-for="socialTitle">${socialTitle.length}/90</span></div>
          <input class="form-control" id="socialTitle" name="social_title" maxlength="90" value="${escapeHtml(socialTitle)}" placeholder="Automático: título da matéria">
        </div>

        <div class="form-group">
          <div class="post-social-panel__label-row"><label for="socialDescription">Resumo social</label><span data-counter-for="socialDescription">${socialDescription.length}/220</span></div>
          <textarea class="form-control" id="socialDescription" name="social_description" maxlength="220" rows="3" placeholder="Automático: linha de apoio">${escapeHtml(socialDescription)}</textarea>
        </div>

        <div class="form-group">
          <div class="post-social-panel__label-row"><label for="socialShareText">Mensagem de compartilhamento</label><span data-counter-for="socialShareText">${shareTemplate.length}/700</span></div>
          <textarea class="form-control" id="socialShareText" name="social_share_text" maxlength="700" rows="5" placeholder="Automática: título, resumo, convite e link">${escapeHtml(shareTemplate)}</textarea>
          <p class="post-social-panel__hint">Variáveis disponíveis: <code>{{title}}</code>, <code>{{summary}}</code>, <code>{{journal}}</code> e <code>{{url}}</code>.</p>
        </div>

        <input type="hidden" id="socialImageMediaId" name="social_image_media_id" value="${post?.social_image_media_id || ''}">
        <div class="post-social-panel__crop">
          <label>Enquadramento horizontal <output id="socialPositionXOutput">${positionX}%</output><input id="socialPositionX" name="social_image_position_x" type="range" min="0" max="100" value="${positionX}"></label>
          <label>Enquadramento vertical <output id="socialPositionYOutput">${positionY}%</output><input id="socialPositionY" name="social_image_position_y" type="range" min="0" max="100" value="${positionY}"></label>
        </div>

        <div class="post-social-card ${previewImage ? 'has-image' : ''} ${generatedUrl ? 'is-generated' : ''}" id="socialCardPreview" data-cover-url="${escapeHtml(coverUrl)}" data-generated-url="${escapeHtml(generatedUrl)}" style="--social-x:${positionX}%;--social-y:${positionY}%;${previewImage ? `background-image:url('${escapeHtml(previewImage)}')` : ''}">
          <div class="post-social-card__fallback"></div>
          <div class="post-social-card__overlay">
            <div class="post-social-card__brand"><img src="/static/logo-dp.png" alt="Diário do Povo"></div>
            <div class="post-social-card__copy"><span data-social-preview-hat>${escapeHtml(clean(post?.hat) || post?.category_name || 'Notícia')}</span><strong data-social-preview-art-title>${escapeHtml(previewTitle)}</strong><small>${SOCIAL_DISPLAY_DOMAIN}</small></div>
          </div>
        </div>

        <div class="post-social-panel__art-actions">
          <button class="btn" id="generateSocialCardBtn" type="button" ${canGenerate ? '' : 'disabled'}>Gerar arte 1200 × 630</button>
          <button class="btn btn-outline" id="removeSocialCardBtn" type="button" ${generatedUrl ? '' : 'hidden'}>Usar somente a capa</button>
        </div>
        <p class="post-social-panel__hint" id="socialCardStatus" role="status" aria-live="polite">${isNew ? 'Crie o rascunho e selecione a capa antes de gerar a arte.' : !post?.cover_media_url ? 'Selecione e salve uma imagem de capa para gerar a arte.' : generatedUrl ? 'Arte social gerada e pronta para compartilhamento.' : 'A capa funciona como fallback. Gere a arte para aplicar a marca do Diário.'}</p>

        <div class="post-whatsapp-preview" aria-label="Prévia aproximada do compartilhamento no WhatsApp">
          <span class="post-whatsapp-preview__eyebrow">Prévia do WhatsApp</span>
          <div class="post-whatsapp-preview__message" data-social-message-preview>${escapeHtml(previewMessage).replace(/\n/g, '<br>')}</div>
          <article>
            <div class="post-whatsapp-preview__thumb" data-social-thumb style="${previewImage ? `background-image:url('${escapeHtml(previewImage)}');background-position:${positionX}% ${positionY}%` : ''}"></div>
            <div><strong data-social-preview-title>${escapeHtml(previewTitle)} | ${SOCIAL_SITE_NAME}</strong><p data-social-preview-description>${escapeHtml(previewDescription)}</p><small>diario.dopovo.com.br</small></div>
          </article>
        </div>
      </div>
    </details>

    <script nonce="${escapeHtml(cspNonce)}">
      (() => {
        const postId = ${post?.id || 'null'};
        const csrfToken = ${safeJson(csrfToken)};
        const socialTitle = document.getElementById('socialTitle');
        const socialDescription = document.getElementById('socialDescription');
        const socialShareText = document.getElementById('socialShareText');
        const mainTitle = document.querySelector('[name="title"]');
        const mainExcerpt = document.querySelector('[name="excerpt"]');
        const mainHat = document.querySelector('[name="hat"]');
        const socialImageMediaId = document.getElementById('socialImageMediaId');
        const card = document.getElementById('socialCardPreview');
        const thumb = document.querySelector('[data-social-thumb]');
        const generateButton = document.getElementById('generateSocialCardBtn');
        const removeButton = document.getElementById('removeSocialCardBtn');
        const status = document.getElementById('socialCardStatus');
        const positionX = document.getElementById('socialPositionX');
        const positionY = document.getElementById('socialPositionY');
        const positionXOutput = document.getElementById('socialPositionXOutput');
        const positionYOutput = document.getElementById('socialPositionYOutput');
        const coverUrl = ${safeJson(coverUrl)};
        const coverCredit = ${safeJson(coverCredit)};
        const previewUrl = ${safeJson(previewUrl)};

        const value = (element) => element && element.value ? element.value.trim() : '';
        const currentTitle = () => value(socialTitle) || value(mainTitle) || 'Título da matéria';
        const currentDescription = () => value(socialDescription) || value(mainExcerpt) || 'Leia a cobertura completa do Diário do Povo.';
        const currentHat = () => value(mainHat) || ${safeJson(clean(post?.category_name) || 'Notícia')};
        const replaceTemplate = (template, url) => template
          .replace(/{{title}}/gi, currentTitle())
          .replace(/{{summary}}/gi, currentDescription())
          .replace(/{{journal}}/gi, 'Diário do Povo')
          .replace(/{{url}}/gi, url);
        const currentMessage = () => {
          const template = value(socialShareText);
          if (template) {
            const rendered = replaceTemplate(template, previewUrl).trim();
            return rendered.includes(previewUrl) ? rendered : rendered + '\\n\\n' + previewUrl;
          }
          return '*' + currentTitle() + '*\\n\\n' + currentDescription() + '\\n\\nLeia a matéria completa no Diário do Povo:\\n' + previewUrl;
        };

        function refresh() {
          const title = currentTitle();
          const description = currentDescription();
          document.querySelectorAll('[data-social-preview-title]').forEach((node) => node.textContent = title + ' | Diário do Povo');
          document.querySelectorAll('[data-social-preview-art-title]').forEach((node) => node.textContent = title);
          document.querySelectorAll('[data-social-preview-description]').forEach((node) => node.textContent = description);
          document.querySelectorAll('[data-social-preview-hat]').forEach((node) => node.textContent = currentHat());
          const message = document.querySelector('[data-social-message-preview]');
          if (message) message.textContent = currentMessage();
          [[socialTitle, 90], [socialDescription, 220], [socialShareText, 700]].forEach(([field, max]) => {
            if (!field) return;
            const counter = document.querySelector('[data-counter-for="' + field.id + '"]');
            if (counter) counter.textContent = field.value.length + '/' + max;
          });
          card.style.setProperty('--social-x', positionX.value + '%');
          card.style.setProperty('--social-y', positionY.value + '%');
          positionXOutput.value = positionX.value + '%';
          positionYOutput.value = positionY.value + '%';
          if (thumb) thumb.style.backgroundPosition = positionX.value + '% ' + positionY.value + '%';
        }

        [socialTitle, socialDescription, socialShareText, mainTitle, mainExcerpt, mainHat, positionX, positionY].forEach((field) => {
          if (field) field.addEventListener('input', refresh);
        });

        const loadImage = (url) => new Promise((resolve, reject) => {
          const image = new Image();
          image.crossOrigin = 'anonymous';
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('Não foi possível carregar a imagem.'));
          image.src = url;
        });

        function drawCover(context, image, x, y, width, height) {
          const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
          const sourceWidth = width / scale;
          const sourceHeight = height / scale;
          const sourceX = Math.max(0, (image.naturalWidth - sourceWidth) * (Number(x) / 100));
          const sourceY = Math.max(0, (image.naturalHeight - sourceHeight) * (Number(y) / 100));
          context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
        }

        function wrapTitle(context, text, maxWidth, maxLines) {
          const words = text.split(/\\s+/).filter(Boolean);
          const lines = [];
          let line = '';
          for (const word of words) {
            const candidate = line ? line + ' ' + word : word;
            if (context.measureText(candidate).width <= maxWidth || !line) line = candidate;
            else { lines.push(line); line = word; }
          }
          if (line) lines.push(line);
          if (lines.length > maxLines) {
            const visible = lines.slice(0, maxLines);
            visible[maxLines - 1] = visible[maxLines - 1].replace(/[.,;:!?]?$/, '') + '…';
            return visible;
          }
          return lines;
        }

        async function generateArtwork() {
          if (!postId || !coverUrl) return;
          generateButton.disabled = true;
          status.textContent = 'Gerando a arte com a identidade do Diário…';
          try {
            const [cover, logo] = await Promise.all([loadImage(coverUrl), loadImage('/static/logo-dp.png')]);
            const canvas = document.createElement('canvas');
            canvas.width = 1200;
            canvas.height = 630;
            const context = canvas.getContext('2d');
            drawCover(context, cover, positionX.value, positionY.value, 1200, 630);

            const gradient = context.createLinearGradient(0, 90, 0, 630);
            gradient.addColorStop(0, 'rgba(4,21,33,.08)');
            gradient.addColorStop(.42, 'rgba(4,21,33,.18)');
            gradient.addColorStop(1, 'rgba(4,21,33,.98)');
            context.fillStyle = gradient;
            context.fillRect(0, 0, 1200, 630);

            context.fillStyle = 'rgba(255,255,255,.96)';
            context.beginPath();
            context.roundRect(58, 46, 252, 84, 8);
            context.fill();
            const logoScale = Math.min(204 / logo.naturalWidth, 52 / logo.naturalHeight);
            const logoWidth = logo.naturalWidth * logoScale;
            const logoHeight = logo.naturalHeight * logoScale;
            context.drawImage(logo, 58 + (252 - logoWidth) / 2, 46 + (84 - logoHeight) / 2, logoWidth, logoHeight);

            context.fillStyle = 'rgba(255,255,255,.9)';
            context.font = '700 16px Arial, sans-serif';
            context.textAlign = 'right';
            context.fillText('JORNALISMO INDEPENDENTE', 1142, 84);
            context.textAlign = 'left';

            context.fillStyle = '#e3bd73';
            context.font = '800 22px Arial, sans-serif';
            context.fillText(currentHat().toLocaleUpperCase('pt-BR'), 62, 292);

            const title = currentTitle();
            const titleSize = title.length > 105 ? 48 : title.length > 78 ? 54 : 62;
            context.fillStyle = '#ffffff';
            context.font = '700 ' + titleSize + 'px Georgia, serif';
            const lines = wrapTitle(context, title, 1076, 3);
            const lineHeight = titleSize * 1.04;
            lines.forEach((line, index) => context.fillText(line, 62, 344 + index * lineHeight));

            context.strokeStyle = 'rgba(255,255,255,.34)';
            context.beginPath();
            context.moveTo(62, 554);
            context.lineTo(1138, 554);
            context.stroke();
            context.font = '800 15px Arial, sans-serif';
            context.fillStyle = '#ffffff';
            context.fillText(${safeJson(SOCIAL_DISPLAY_DOMAIN)}, 62, 592);
            if (coverCredit) {
              context.textAlign = 'right';
              context.font = '500 13px Arial, sans-serif';
              context.fillStyle = 'rgba(255,255,255,.82)';
              context.fillText('Foto: ' + coverCredit.slice(0, 90), 1138, 592);
              context.textAlign = 'left';
            }

            const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Falha ao exportar a arte.')), 'image/jpeg', .92));
            const formData = new FormData();
            formData.append('file', new File([blob], 'diario-do-povo-og-' + postId + '.jpg', { type: 'image/jpeg' }));
            formData.append('social_title', value(socialTitle));
            formData.append('social_description', value(socialDescription));
            formData.append('social_share_text', value(socialShareText));
            formData.append('social_image_position_x', positionX.value);
            formData.append('social_image_position_y', positionY.value);
            const response = await fetch('/api/admin/posts/' + postId + '/social-card', {
              method: 'POST',
              headers: { 'X-CSRF-Token': csrfToken },
              body: formData
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) throw new Error(payload.error || 'Falha ao salvar a arte.');
            socialImageMediaId.value = payload.media_id;
            card.dataset.generatedUrl = payload.url;
            card.style.backgroundImage = "url('" + payload.url + "')";
            card.classList.add('has-image');
            card.classList.add('is-generated');
            if (thumb) thumb.style.backgroundImage = "url('" + payload.url + "')";
            removeButton.hidden = false;
            status.textContent = 'Arte gerada, salva e pronta para o Open Graph.';
          } catch (error) {
            status.textContent = error && error.message ? error.message : 'Não foi possível gerar a arte.';
          } finally {
            generateButton.disabled = false;
          }
        }

        if (generateButton) generateButton.addEventListener('click', generateArtwork);
        if (removeButton) removeButton.addEventListener('click', () => {
          socialImageMediaId.value = '';
          card.classList.remove('is-generated');
          card.style.backgroundImage = coverUrl ? "url('" + coverUrl + "')" : '';
          card.classList.toggle('has-image', Boolean(coverUrl));
          if (thumb) thumb.style.backgroundImage = coverUrl ? "url('" + coverUrl + "')" : '';
          removeButton.hidden = true;
          status.textContent = 'A arte foi removida deste formulário. Salve a matéria para confirmar.';
        });
        refresh();
      })();
    </script>
  `
}
