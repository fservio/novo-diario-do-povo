import { readFile, writeFile, cp } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'vite'

const base = 'artifacts/instagram-markdown-production'
const target = 'artifacts/generate-posts-production'
const metadata = JSON.parse(await readFile(`${base}/release.json`, 'utf8'))
let worker = await readFile(`${base}/site/_worker.js`, 'utf8')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
if (hash(worker) !== metadata.changed.find(file => file.path === '_worker.js').sha256) throw Error('Production base checksum mismatch')
const replaceOnce = (before, after) => {
  if (worker.split(before).length !== 2) throw Error(`Ambiguous patch: ${before}`)
  worker = worker.replace(before, after)
}
replaceOnce('O.get("/admin/posts", async (t) => {', 'O.get("/admin/gerar-materias",t=>__generatePosts(t));\nO.get("/admin/posts", async (t) => {')
replaceOnce('`frame-src ${x.join(" ")}`', '`frame-src ${x.join(" ")}${t.req.path === "/admin/gerar-materias" ? " https://n8n.srv797269.hstgr.cloud" : ""}`')
let navigationCount = 0
worker = worker.replace(/^(\s*)<a[^\n]+href="\/admin\/redacao-ia"[^\n]+Redação IA<\/a>$/gm, line => {
  navigationCount++
  return '        <a href="/admin/gerar-materias">Gerar matérias</a>\n' + line
})
if (navigationCount !== 2) throw Error(`Unexpected navigation count: ${navigationCount}`)
worker = "import { handleGeneratePosts as __generatePosts } from '../../packages/core/admin/generate-posts';\n" + worker
await cp(`${base}/site`, `${target}/site`, { recursive: true, errorOnExist: true, force: false })
await writeFile(`${target}/worker-entry.js`, worker)
await build({ configFile: false, publicDir: false, build: {
  outDir: `${target}/site`, emptyOutDir: false, target: 'es2022', minify: 'esbuild',
  lib: { entry: resolve(`${target}/worker-entry.js`), formats: ['es'], fileName: () => '_worker.js' },
  rollupOptions: { external: [...builtinModules, ...builtinModules.map(name => `node:${name}`), 'cloudflare:sockets', '__STATIC_CONTENT_MANIFEST'] }
} })
await writeFile(`${target}/release.json`, JSON.stringify({ baseDeployment: 'ad558fb3', baseWorkerSha256: metadata.changed.find(file => file.path === '_worker.js').sha256, workerSha256: hash(await readFile(`${target}/site/_worker.js`)), site: resolve(`${target}/site`) }, null, 2))
