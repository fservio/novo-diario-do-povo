export function renderEditorialAd(adHtml: string): string {
  if (!adHtml?.trim()) return ''
  return `<aside class="ed-ad" aria-label="Publicidade"><span class="ed-ad__label">Publicidade</span>${adHtml}</aside>`
}
