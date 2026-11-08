import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import ts from 'typescript'
import { build } from 'vite'

const base = 'artifacts/internal-links-production-release'
const target = 'artifacts/public-search-production'
const baseDeployment = '498125c9'
const hash = data => createHash('sha256').update(data).digest('hex')
const original = await readFile(base + '/site/_worker.js', 'utf8')
const manifest = JSON.parse(await readFile(base + '/release.json', 'utf8'))
if (hash(original) !== manifest.workerSha256) throw new Error('Base de links internos divergente.')

function routes(source) {
  const tree = ts.createSourceFile('worker.js', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS)
  return tree.statements.flatMap(node => {
    if (!ts.isExpressionStatement(node) || !ts.isCallExpression(node.expression)) return []
    const { expression, arguments: args } = node.expression
    if (!ts.isPropertyAccessExpression(expression) || !args[0] || !ts.isStringLiteral(args[0])) return []
    return [{ at: node.getStart(tree), app: expression.expression.getText(tree), method: expression.name.text, path: args[0].text }]
  })
}

const before = routes(original)
const mounts = before.filter(route => route.method === 'route' && route.path === '/')
const searchSlot = before.filter(route => route.method === 'get' && route.path === '/ultimas')
if (mounts.length !== 1 || searchSlot.length !== 1 || before.some(route => route.path === '/busca')) {
  throw new Error('Pontos de montagem inesperados.')
}
const middlewareSlot = before.find(route => route.app === mounts[0].app && route.method === 'use' && route.path === '*')
if (!middlewareSlot) throw new Error('Middleware público não encontrado.')

const additions = [
  { at: middlewareSlot.at, code: `${middlewareSlot.app}.use('*', __addPublicSearchNavigation);\n` },
  { at: searchSlot[0].at, code: `${searchSlot[0].app}.get('/busca', __publicSearch);\n` }
]
let source = original
for (const { at, code } of additions.sort((a, b) => b.at - a.at)) {
  source = source.slice(0, at) + code + source.slice(at)
}
const navigation = `
import { handlePublicSearch as __publicSearch } from '../../packages/core/web/search';
async function __addPublicSearchNavigation(c, next) {
  await next();
  const path = c.req.path;
  if (c.res.status !== 200 || /^\\/(admin|api|static|i|portal|conta)(\\/|$)/.test(path) ||
      !c.res.headers.get('content-type')?.includes('text/html')) return;
  const current = path === '/busca' || path === '/busca/' ? ' aria-current="page"' : '';
  const icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>';
  const rewriter = new HTMLRewriter()
    .on('head', { element(e) { e.append('<style>.ed-search-link{display:inline-grid;place-items:center;width:44px;height:44px;flex:0 0 44px}.ed-search-link:focus-visible{outline:2px solid currentColor;outline-offset:-3px}</style>', {html:true}); } })
    .on('.ed-masthead__actions > a[href="/busca"], .ed-menu-drawer__list > li > a[href="/busca"], .mobile-menu-panel nav a[href="/busca"]', { element(e) { e.remove(); } })
    .on('.ed-masthead__actions', { element(e) { e.prepend('<a class="ed-search-link" href="/busca" aria-label="Buscar notícias" title="Buscar notícias"'+current+'>'+icon+'</a>', {html:true}); } })
    .on('.ed-menu-drawer__list', { element(e) { e.prepend('<li><a href="/busca"'+current+'>Busca<span aria-hidden="true">→</span></a></li>', {html:true}); } })
    .on('.mobile-menu-panel nav', { element(e) { e.prepend('<a class="mobile-nav-link" href="/busca"'+current+'>Busca</a>', {html:true}); } });
  const response = rewriter.transform(c.res);
  response.headers.delete('Content-Length');
  response.headers.delete('ETag');
  c.res = response;
}
`
await mkdir(target, { recursive: true })
await cp(base + '/site', target + '/site', { recursive: true, force: true })
await writeFile(target + '/worker-entry.js', navigation + source)

const entry = resolve(target + '/worker-entry.js').replaceAll('\\', '/')
const external = new Set([...builtinModules, ...builtinModules.map(name => 'node:' + name), 'cloudflare:sockets', '__STATIC_CONTENT_MANIFEST'])
await build({
  configFile: false,
  publicDir: false,
  build: {
    outDir: target + '/site',
    emptyOutDir: false,
    target: 'es2022',
    lib: { entry, formats: ['es'], fileName: () => '_worker.js' },
    rollupOptions: {
      external: (id, importer) => external.has(id) || (importer?.replaceAll('\\', '/') === entry && id.startsWith('./') && id.endsWith('.js')),
      output: { inlineDynamicImports: true }
    }
  }
})

const worker = await readFile(target + '/site/_worker.js', 'utf8')
const after = routes(worker)
const count = (list, route) => list.filter(item => item.method === route.method && item.path === route.path).length
for (const route of before) {
  if (count(before, route) > count(after, route)) throw new Error('Rota perdida: ' + route.path)
}
if (after.length !== before.length + 2 || count(after, { method: 'get', path: '/busca' }) !== 1) {
  throw new Error('A nova rota de busca não foi montada corretamente.')
}
async function assetHashes(directory) {
  const paths = await readdir(directory, { recursive: true, withFileTypes: true })
  const assets = paths.filter(item => item.isFile()).map(item => resolve(item.parentPath, item.name).slice(resolve(directory).length + 1))
  return Promise.all(assets.filter(path => path !== '_worker.js').sort().map(async path => [path, hash(await readFile(resolve(directory, path)))]))
}
if (JSON.stringify(await assetHashes(base + '/site')) !== JSON.stringify(await assetHashes(target + '/site'))) {
  throw new Error('Arquivos estáticos divergentes.')
}
await writeFile(target + '/release.json', JSON.stringify({
  baseDeployment, workerSha256: hash(worker), routesPreserved: before.length, routesAdded: 1
}, null, 2))
