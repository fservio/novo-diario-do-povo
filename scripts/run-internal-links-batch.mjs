import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const origin = new URL(process.env.INTERNAL_LINKS_ORIGIN || 'https://diario.dopovo.com.br').origin
const apiKey = process.env.INTERNAL_LINKS_API_KEY
const apply = process.argv.includes('--apply')
const newest = Number.MAX_SAFE_INTEGER
const statePath = process.env.INTERNAL_LINKS_STATE || 'artifacts/internal-links-batch/state.json'
if (!apiKey) throw new Error('Configure INTERNAL_LINKS_API_KEY com a chave da automação.')

async function request(path, options = {}) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(origin + '/api/n8n/internal-links/' + path, {
      ...options,
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(65_000)
    })
    if (response.ok) return response.json()
    if (attempt === 3 || ![429, 502, 503, 504].includes(response.status)) {
      throw new Error(`HTTP ${response.status} em ${path}`)
    }
    await response.body?.cancel()
    await sleep(attempt * 3000)
  }
}

const queue = (before, limit) => request(`queue?before=${before}&limit=${limit}`)
const checkpoint = await readFile(statePath, 'utf8').then(JSON.parse, error => {
  if (error.code === 'ENOENT') return { origin, before: newest }
  throw error
})
if (checkpoint.origin !== origin || (checkpoint.before !== null &&
    (!Number.isSafeInteger(checkpoint.before) || checkpoint.before < 1))) {
  throw new Error('Checkpoint inválido para este site.')
}

const batch = 'backfill-' + new Date().toISOString()
const totals = { assessed: 0, articlesWithLinks: 0, links: 0 }
const started = Date.now()
async function processPage(ids) {
  for (let offset = 0; offset < ids.length; offset += 2) {
    const results = await Promise.allSettled(ids.slice(offset, offset + 2).map(async id => {
      const plan = await request(id + '/plan', { method: 'POST' })
      if (plan.id !== id || typeof plan.revision !== 'string' || !Array.isArray(plan.links)) {
        throw new Error(`Plano inválido para a matéria ${id}`)
      }
      const result = await request(id, {
        method: 'PUT',
        body: JSON.stringify({ revision: plan.revision, batch, links: plan.links })
      })
      if (!result.saved) throw new Error(`Gravação não confirmada para a matéria ${id}`)
      totals.assessed++
      totals.articlesWithLinks += Number(plan.links.length > 0)
      totals.links += plan.links.length
    }))
    const failure = results.find(result => result.status === 'rejected')
    if (failure) throw failure.reason
  }
}

const recent = await queue(newest, 50)
const priority = recent.ids.slice(0, 25)
const archiveCursor = checkpoint.before === newest ? recent.next : checkpoint.before
const archive = archiveCursor === null ? { ids: [], next: null } : await queue(archiveCursor, 50 - priority.length)
const archiveIds = archive.ids.filter(id => !priority.includes(id))
if (!apply) {
  console.log({ priority: priority.length, archive: archiveIds.length, next: archive.next })
} else {
  try {
    await processPage(priority)
    await processPage(archiveIds)
    await mkdir(dirname(statePath), { recursive: true })
    const temporaryPath = statePath + '.' + process.pid + '.tmp'
    await writeFile(temporaryPath, JSON.stringify({ origin, before: archive.next }) + '\n')
    await rename(temporaryPath, statePath)
  } finally {
    const elapsedMs = Date.now() - started
    console.log({ batch, ...totals, elapsedMs, articlesPerMinute: Math.round(totals.assessed * 60000 / Math.max(1, elapsedMs)) })
  }
}
