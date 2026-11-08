import {describe,it,expect} from 'vitest'
import {renderPublicMenu} from '../../packages/core/web/public-menu'
const categories=[{slug:'politica',name:'Política',is_active:1},{slug:'cultura',name:'Cultura',is_active:1},{slug:'economia',name:'Economia',is_active:1}]
const hrefs=(html:string)=>[...html.matchAll(/href="([^"]+)"/g)].map(match=>match[1])
describe('Menu público completo',()=>{
 it('mantém a mesma lista em matérias, editorias, Meu dia, jogo, formulário e agenda',()=>{
  const expected=hrefs(renderPublicMenu(categories,'/'))
  for(const path of ['/ultimas','/categoria/cultura','/2026/11/06/noticia/','/meu-dia','/jogos/extra-extra','/agenda/sugerir','/agenda/evento'])expect(hrefs(renderPublicMenu(categories,path))).toEqual(expected)
  expect(expected).toEqual(['/busca','/meu-dia','/guias','/jogos/extra-extra','/categoria/politica','/categoria/cultura','/categoria/economia'])
 })
 it('não duplica links e não exibe editorias inativas',()=>{
  const links=hrefs(renderPublicMenu([...categories,categories[0],{slug:'antiga',name:'Antiga',is_active:0}],'/'))
  expect(new Set(links).size).toBe(links.length);expect(links).not.toContain('/categoria/antiga')
 })
 it('marca somente a página atual, com ou sem barra final',()=>{
  const html=renderPublicMenu(categories,'/categoria/cultura/');expect(html.match(/aria-current="page"/g)).toHaveLength(1);expect(html).toContain('href="/categoria/cultura" aria-current="page"')
  expect(renderPublicMenu(categories,'/jogos/extra-extra')).toContain('href="/jogos/extra-extra" aria-current="page"')
 })
 it('preserva a mesma taxonomia no layout antigo e escapa nomes do CMS',()=>{
  const source=[...categories,{slug:'nome especial',name:'<script>teste</script>',is_active:1}]
  const modern=renderPublicMenu(source,'/'),legacy=renderPublicMenu(source,'/',true)
  expect(hrefs(legacy)).toEqual(hrefs(modern));expect(legacy).toContain('class="mobile-nav-link"');expect(modern).not.toContain('<script>');expect(modern).toContain('&lt;script&gt;');expect(modern).toContain('/categoria/nome%20especial')
 })
})
