import { afterEach, describe, expect, it, vi } from 'vitest'
import { drainVideoJobs } from '../../workers/video-jobs'
afterEach(() => vi.unstubAllGlobals())
const env = { VIDEO_JOBS_SECRET: 'internal-secret', VIDEO_JOBS_ORIGIN: 'https://example.test',
  DB: { prepare: () => ({ all: async () => ({ results: [{ id: 'job' }] }) }) } } as any
describe('Executor em segundo plano', () => {
  it('avança etapas até conclusão e usa autenticação interna', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ status: 'active' })).mockResolvedValueOnce(Response.json({ status: 'completed' }))
    vi.stubGlobal('fetch', fetchMock)
    await drainVideoJobs(env)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer internal-secret')
  })
  it('encerra o tick quando outra execução possui o lease', async () => {
    const fetchMock = vi.fn(async () => Response.json({ status: 'busy' }))
    vi.stubGlobal('fetch', fetchMock)
    await drainVideoJobs(env)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
  it('não prossegue diante de erro HTTP', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(drainVideoJobs(env)).rejects.toThrow('503')
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
