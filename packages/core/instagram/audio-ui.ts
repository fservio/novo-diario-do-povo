import { escapeHtml, renderCsrfInput } from '../admin/ui'
import type { InstagramPublication, InstagramStoryVariant } from './types'
import type { AudioStory } from './audio'

export function audioEditor(publication: InstagramPublication, story: InstagramStoryVariant, saved: AudioStory | null, csrf: string) {
  const initial = saved || { ...story, photo_credit: story.photo_credit || publication.photo_credit, audio_credit: '' }
  const text = (name: string, label: string, value: string | null, max: number, required = false, rows = 0) =>
    `<div class="form-group"><label for="audio-${name}">${label}</label>${rows
      ? `<textarea class="form-control" id="audio-${name}" name="${name}" rows="${rows}" maxlength="${max}" ${required ? 'required' : ''}>${escapeHtml(value || '')}</textarea>`
      : `<input class="form-control" id="audio-${name}" name="${name}" value="${escapeHtml(value || '')}" maxlength="${max}" ${required ? 'required' : ''}>`}</div>`
  return `<form class="card instagram-editor-card" data-instagram-format-panel="audio" data-audio-editor
    data-publication-id="${publication.id}" data-has-audio="${Boolean(saved)}" data-cover="${escapeHtml(`/i/${publication.cover_media_url}?w=2400&q=94`)}" hidden>
    ${renderCsrfInput(csrf)}<input name="version" type="hidden" value="${saved?.version || 0}">
    <div class="newsletter-section-head"><div><p class="page-kicker">Story com áudio</p><h2>Uma notícia para ouvir</h2></div><span class="instagram-format-chip">MP4 · 1080 × 1920</span></div>
    <div class="instagram-editor-fields">
      ${text('hat','Chapéu',initial.hat,40)}${text('title','Título',initial.title,120,true,3)}
      ${text('subtitle','Descrição',initial.subtitle,160,false,3)}
      ${text('photo_credit','Crédito da foto',initial.photo_credit,160,true)}
      ${text('audio_credit','Crédito do áudio',initial.audio_credit,160,true)}
      <div class="form-group"><label for="audio-file">Áudio WAV ou MP3</label><input class="form-control" id="audio-file" name="audio" type="file" accept=".wav,.mp3,audio/wav,audio/mpeg"><small>Até 30 MB. Prefira até 45 segundos. O áudio será reproduzido inteiro, sem cortes.</small><small data-audio-filename>${escapeHtml(saved?.audio_name || 'Nenhum áudio enviado.')}</small></div>
      <audio data-audio-player controls preload="metadata" ${saved ? `src="/admin/instagram/${publication.id}/audio/source"` : 'hidden'}></audio>
      <p data-audio-duration role="status">${saved ? `${saved.duration_seconds.toFixed(1)} segundos${saved.duration_seconds > 45 ? ' · Acima de 45 segundos; o áudio será mantido inteiro.' : ''}` : 'Selecione o áudio para conferir a duração.'}</p>
      <div class="form-group instagram-focal-controls"><label>Enquadramento da foto</label>${(['x','y'] as const).map(axis => `<div><label for="audio-position-${axis}">${axis === 'x' ? 'Horizontal' : 'Vertical'}</label><input id="audio-position-${axis}" name="image_position_${axis}" type="range" min="0" max="100" value="${initial[`image_position_${axis}`]}"></div>`).join('')}</div>
      <p data-audio-status aria-live="polite"></p>
    </div>
    <div class="instagram-editor-save"><span>O vídeo será gerado em segundo plano. Você pode sair desta tela.</span><button class="btn" type="submit" data-audio-generate>Salvar e gerar MP4</button></div>
  </form>`
}
export function audioPreview() {
  return `<section class="card instagram-preview-card" data-instagram-format-panel="audio" hidden>
    <div class="instagram-preview-head"><div><p class="page-kicker">Composição</p><h2>Story com áudio</h2></div><span>9:16</span></div>
    <canvas data-audio-canvas width="1080" height="1920" style="width:100%;height:auto;border-radius:12px" aria-label="Prévia da composição do Story com áudio"></canvas>
    <p class="instagram-story-safe-note">A onda sonora e a barra de progresso serão animadas no MP4.</p>
    <video data-audio-video controls playsinline preload="metadata" style="width:100%;border-radius:12px" hidden></video>
    <a class="btn" data-audio-download hidden>Baixar Story com áudio (MP4)</a>
  </section>`
}
