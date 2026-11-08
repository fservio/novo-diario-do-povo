import { readFile, writeFile, cp, mkdir, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import ts from 'typescript'
import { build } from 'vite'

// Deliberately anchored to the newer Guides production release. Do not rebuild its source.
const base = 'artifacts/guias-launch-v2'
const target = 'artifacts/seo-backend-fix-release'
const expectedDeployment = '7e60e98c'
const expectedBaseHash = 'cb664e2208b53d9f892c1bf90874b2294c6988bd2f5b1b280a9510ab8ccd272f'
const hash = value => createHash('sha256').update(value).digest('hex')
const manifest = JSON.parse(await readFile(`${base}/release.json`, 'utf8'))
const original = await readFile(`${base}/site/_worker.js`, 'utf8')
if (manifest.deploymentId !== expectedDeployment || manifest.workerSha256 !== expectedBaseHash || hash(original) !== expectedBaseHash) {
  throw Error('SEO backend fix base must match verified Guides production 7e60e98c and its exact worker hash')
}

const parse = (file, source) => ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS)
const tree = parse('production.js', original)
function registeredRoutes(sourceTree) {
  return sourceTree.statements.filter(statement =>
    ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) &&
    ts.isPropertyAccessExpression(statement.expression.expression) &&
    statement.expression.arguments[0] && ts.isStringLiteral(statement.expression.arguments[0])
  ).map(statement => ({
    statement,
    method: statement.expression.expression.name.text,
    path: statement.expression.arguments[0].text
  }))
}
const routes = registeredRoutes(tree)
const mounts = routes.filter(route => route.method === 'route' && route.path === '/api/n8n/seo')
if (mounts.length !== 1) throw Error('Expected one top-level /api/n8n/seo router mount')
const factoryCall = mounts[0].statement.expression.arguments[1]
if (!factoryCall || !ts.isCallExpression(factoryCall) || !ts.isIdentifier(factoryCall.expression) || factoryCall.arguments.length !== 0) {
  throw Error('SEO router mount must call one named factory without arguments')
}
const factoryName = factoryCall.expression.text
const factories = tree.statements.filter(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === factoryName)
if (factories.length !== 1 || factories[0].parameters.length !== 0 || factories[0].modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)) {
  throw Error('SEO router factory is ambiguous or its synchronous no-argument contract changed')
}
const factory = factories[0]
const start = factory.getStart(tree), end = factory.end
const wrapper = `function ${factoryName}(){return __seoCurrentRouter()}`
const patched = original.slice(0, start) + wrapper + original.slice(end)

// Verify every original top-level statement outside the factory stays byte-for-byte intact.
const patchedTree = parse('patched.js', patched)
if (tree.statements.length !== patchedTree.statements.length) throw Error('Unexpected top-level statement change')
const preservedStatements = tree.statements.filter(statement => statement !== factory)
for (let index = 0; index < tree.statements.length; index++) {
  if (tree.statements[index] !== factory && tree.statements[index].getFullText(tree) !== patchedTree.statements[index].getFullText(patchedTree)) {
    throw Error(`Unexpected modification outside SEO factory at statement ${index}`)
  }
}
const unchangedStatementHash = hash(preservedStatements.map(statement => statement.getFullText(tree)).join(''))
const security = preservedStatements.filter(statement => ts.isFunctionDeclaration(statement) &&
  statement.getText(tree).includes('startsWith("/api/n8n/guides/")') &&
  statement.getText(tree).includes('"/api/n8n/seo"') && statement.getText(tree).includes('"Cache-Control"'))
const publicMenu = preservedStatements.filter(statement => ts.isFunctionDeclaration(statement) &&
  statement.getText(tree).includes('.on(".ed-menu-drawer__list"') && statement.getText(tree).includes('.on(".mobile-menu-panel nav"'))
if (security.length !== 1 || publicMenu.length !== 1) throw Error('Guides cache/menu preservation markers are ambiguous')
const protectedPaths = ['/api/n8n/guides/:operation', '/guias', '/guias/:slug', '/sitemap-guias.xml', '/sitemap-index.xml', '/sitemap.xml', '/admin/guias', '/admin/guias/*', '/admin/guias/import', '/admin/guias/:id', '/admin/guias/:id/preview', '/admin/guias/:id/:operation', '/meu-dia', '/i/:key{.+}']
for (const path of protectedPaths) if (!routes.some(route => route.path === path)) throw Error('Missing production route: ' + path)
if (!original.includes('/sitemap-guias.xml</loc>') || !original.includes('href="/admin/guias"')) throw Error('Guides sitemap/menu integration missing from base')

await mkdir(target, { recursive: true })
await cp(`${base}/site`, `${target}/site`, { recursive: true, force: true })
const entrySource = `import {createSeoAutomationRouter as __seoCurrentRouter} from '../../packages/core/seo-automation';\n` + patched
await writeFile(`${target}/worker-entry.js`, entrySource)
const entry = resolve(`${target}/worker-entry.js`).replaceAll('\\', '/')
const external = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`), 'cloudflare:sockets', '__STATIC_CONTENT_MANIFEST'])
await build({
  configFile: false, publicDir: false,
  build: {
    outDir: `${target}/site`, emptyOutDir: false, target: 'es2022', minify: 'esbuild',
    lib: { entry: resolve(entry), formats: ['es'], fileName: () => '_worker.js' },
    rollupOptions: {
      external: (id, importer) => external.has(id) || (importer?.replaceAll('\\', '/') === entry && id.startsWith('./') && id.endsWith('.js')),
      output: { inlineDynamicImports: true }
    }
  }
})

async function files(root, dir = '') {
  const result = []
  for (const item of await readdir(resolve(root, dir), { withFileTypes: true })) {
    const path = dir ? `${dir}/${item.name}` : item.name
    if (item.isDirectory()) result.push(...await files(root, path))
    else result.push(path)
  }
  return result.sort()
}
const baseFiles = await files(`${base}/site`), releaseFiles = await files(`${target}/site`)
if (JSON.stringify(baseFiles) !== JSON.stringify(releaseFiles)) throw Error('Release must preserve the exact production file inventory')
const changed = []
for (const file of releaseFiles) {
  if (hash(await readFile(`${target}/site/${file}`)) !== hash(await readFile(`${base}/site/${file}`))) changed.push(file)
}
if (changed.length !== 1 || changed[0] !== '_worker.js') throw Error('Unexpected release changes: ' + changed.join(', '))
const built = await readFile(`${target}/site/_worker.js`, 'utf8')
const builtRoutes = registeredRoutes(parse('built.js', built)).map(({ method, path }) => `${method} ${path}`).sort()
const previousRoutes = routes.map(({ method, path }) => `${method} ${path}`).sort()
if (JSON.stringify(builtRoutes) !== JSON.stringify(previousRoutes)) throw Error('Production top-level route registrations changed')
for (const marker of ['/jobs/:id/correct', 'SEO_CORRECTION_REQUIRES_PAUSE', 'SEO_CORRECTION_SOURCE_CONFLICT', "j.state IN ('needs_review','exhausted','applied','no_change')", 'private, no-store, max-age=0', '/sitemap-guias.xml</loc>', '.mobile-menu-panel nav']) {
  if (!built.includes(marker)) throw Error('Missing built protection or current backend marker: ' + marker)
}
const release = {
  baseDeployment: manifest.deploymentId, baseWorkerSha256: manifest.workerSha256,
  workerSha256: hash(built), changed, site: resolve(`${target}/site`),
  replacement: { factory: factoryName, oldFactorySha256: hash(factory.getText(tree)), replacementCount: 1 },
  preservation: {
    untouchedTopLevelStatements: preservedStatements.length,
    untouchedTopLevelStatementsSha256: unchangedStatementHash,
    topLevelRoutes: previousRoutes.length,
    protectedRoutes: routes.filter(route => protectedPaths.includes(route.path)).map(({ method, path }) => `${method} ${path}`),
    securityFunctionSha256: hash(security[0].getText(tree)),
    publicMenuFunctionSha256: hash(publicMenu[0].getText(tree)),
    nonWorkerFilesUnchanged: releaseFiles.length - 1
  },
  currentBackend: { operatorCorrectionEndpoint: true, completedSnapshotNotAutomaticallyReopened: true }
}
await writeFile(`${target}/release.json`, JSON.stringify(release, null, 2))
console.log(JSON.stringify(release, null, 2))
