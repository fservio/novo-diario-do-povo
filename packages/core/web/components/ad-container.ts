export function renderAlltypeAdContainer(adHtml: string): string {
  if (!adHtml || adHtml.trim() === '') return ''
  return `
    <aside class="dp-ad-wrap" aria-label="Publicidade">
      ${adHtml}
    </aside>
  `
}
