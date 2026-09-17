import { describe, expect, it } from 'vitest'
import publicRoutes from '../../packages/core/web/routes-v1'

describe('public date article route', () => {
  it('does not shadow four-segment admin routes', async () => {
    const response = await publicRoutes.request('http://localhost/admin/redacao-ia/pautas/2')

    expect(response.status).toBe(404)
  })
})
