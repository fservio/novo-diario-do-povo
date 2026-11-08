import type { ArticlePost } from '../../db/article'
import { escapeAttr } from '../layout'
import readerToolsCss from '../../../../public/static/reader-tools.css?raw'

export function renderReaderTools(post: Pick<ArticlePost,'id'|'title'>, url: string, resumeEnabled: boolean): string {
  return `<style>${readerToolsCss}</style>
    <section class="reader-tools" data-reader-tools data-post-id="${post.id}" data-post-title="${escapeAttr(post.title)}" data-post-url="${escapeAttr(url)}" data-resume-enabled="${resumeEnabled?'1':'0'}" aria-label="Ferramentas de leitura" hidden>
      <div class="reader-tools__bar">
        <div class="reader-tools__font" role="group" aria-label="Tamanho do texto">
          <button type="button" data-reader-smaller aria-label="Diminuir tamanho do texto">A−</button>
          <button type="button" data-reader-reset aria-label="Restaurar tamanho padrão do texto" title="Tamanho padrão">A</button>
          <button type="button" data-reader-larger aria-label="Aumentar tamanho do texto">A+</button>
        </div>
        <button type="button" data-reader-save aria-label="Salvar matéria" aria-pressed="false">Salvar</button>
        <button type="button" data-reader-list aria-label="Abrir minhas matérias salvas">Salvas <span data-reader-count>(0)</span></button>
      </div>
      <p class="reader-tools__note">Favoritos e preferências ficam neste navegador, sem precisar de cadastro.</p>
      <p class="reader-tools__status" data-reader-status role="status" aria-live="polite"></p>
      <div class="reader-tools__resume" data-reader-resume hidden><span>Você já começou a ler esta matéria.</span><div><button type="button" data-reader-continue>Continuar de onde parei</button><button type="button" data-reader-dismiss>Agora não</button></div></div>
      <dialog class="reader-tools__dialog" data-reader-dialog aria-labelledby="reader-saved-title">
        <div class="reader-tools__dialog-header"><h2 id="reader-saved-title">Minhas matérias salvas</h2><button type="button" data-reader-close aria-label="Fechar matérias salvas">Fechar</button></div>
        <p>Disponíveis neste navegador. Salvar guarda o link; é preciso conexão para abrir a matéria.</p>
        <ul data-reader-saved-items></ul><p data-reader-empty>Nenhuma matéria salva ainda. Use “Salvar” para encontrá-la aqui depois.</p>
      </dialog>
    </section>`
}

export const readerToolsScript = '<script type="module" src="/static/reader-tools.js?v=20261105-2"></script>'
