import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { deleteStaffUser, listStaffUsers, setStaffActive } from '../../packages/core/db/users'
import { deleteAuthor, setAuthorActive } from '../../packages/core/db/authors'

function envReturning(row: unknown) {
  const run = vi.fn()
  const all = vi.fn().mockResolvedValue({ results: [] })
  const first = vi.fn().mockResolvedValue(row)
  const bind = vi.fn().mockReturnValue({ first, all, run })
  const prepare = vi.fn().mockReturnValue({ bind, first, all, run })
  return { env: { DB: { prepare } } as any, prepare, run }
}

describe('governança de equipe', () => {
  it('impede que o administrador desative a própria conta', async () => {
    const { env, run } = envReturning({ id: 7, email: 'diretor@jornal.test', name: 'Diretor', role: 'director', is_active: 1 })
    await expect(setStaffActive(env, 7, false, 7)).rejects.toThrow('próprio acesso')
    expect(run).not.toHaveBeenCalled()
  })

  it('impede a autoexclusão antes de consultar ou alterar o banco', async () => {
    const { env, prepare } = envReturning(null)
    await expect(deleteStaffUser(env, 7, 7)).rejects.toThrow('própria conta')
    expect(prepare).not.toHaveBeenCalled()
  })

  it('inclui o papel admin legado no filtro de diretores', async () => {
    const queries: string[] = []
    const env = {
      DB: {
        prepare(sql: string) {
          queries.push(sql)
          return { bind: () => ({ all: async () => ({ results: [] }) }) }
        },
      },
    } as any
    await listStaffUsers(env, { role: 'director', active: true })
    expect(queries.join(' ')).toContain("u.role IN ('director', 'admin')")
  })

  it('protege a autoria institucional Redação', async () => {
    const redacao = { id: 1, slug: 'redacao', name: 'Redação', user_id: null, is_active: 1 }
    const { env, run } = envReturning(redacao)
    await expect(setAuthorActive(env, 1, false)).rejects.toThrow('não pode ser desativada')
    await expect(deleteAuthor(env, 1)).rejects.toThrow('não pode ser excluída')
    expect(run).not.toHaveBeenCalled()
  })
})

describe('proteção das rotas administrativas', () => {
  const source = readFileSync(new URL('../../functions/index.ts', import.meta.url), 'utf8')
  const usersSource = readFileSync(new URL('../../packages/core/admin/users.ts', import.meta.url), 'utf8')
  const authorsSource = readFileSync(new URL('../../packages/core/admin/authors.ts', import.meta.url), 'utf8')

  it('aplica perfil de diretor e CSRF em usuários e autores', () => {
    expect(source).toContain("app.use('/admin/users', requireDirectorForTeam, protectTeamCsrf)")
    expect(source).toContain("app.use('/admin/authors', requireDirectorForTeam, protectTeamCsrf)")
  })

  it('não ignora mais respostas negativas do RBAC', () => {
    expect(source).not.toMatch(/^\s*await require(?:Director|Editor)\(c, async \(\) => \{ \}\)/m)
  })

  it('expõe ações explícitas de ciclo de vida', () => {
    expect(source).toContain("/admin/users/:id{[0-9]+}/delete")
    expect(source).toContain("/admin/authors/:id{[0-9]+}/disable")
    expect(source).toContain("/admin/authors/:id{[0-9]+}/delete")
  })

  it('usa o campo CSRF padronizado em todos os formulários da equipe', () => {
    expect(usersSource).not.toContain('name="csrf_token"')
    expect(authorsSource).not.toContain('name="csrf_token"')
    expect(usersSource).toContain('name="csrf"')
    expect(authorsSource).toContain('name="csrf"')
  })
})
