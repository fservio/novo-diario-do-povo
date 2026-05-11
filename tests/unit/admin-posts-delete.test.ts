/**
 * Tests: Admin Posts Deletion
 */

import { describe, it, expect, vi } from 'vitest'

describe('Admin Posts Deletion', () => {
    it('deletePost remove dependências conhecidas antes do post', async () => {
        const mockDB = {
            prepare: vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnValue({
                    run: vi.fn().mockResolvedValue({ success: true })
                })
            })
        }

        const { deletePost } = await import('../../packages/core/db/posts')

        await deletePost(mockDB as any, 1)

        expect(mockDB.prepare).toHaveBeenCalledWith('DELETE FROM posts_tags WHERE post_id = ?')
        expect(mockDB.prepare).toHaveBeenCalledWith('DELETE FROM post_revisions WHERE post_id = ?')
        expect(mockDB.prepare).toHaveBeenCalledWith('DELETE FROM live_blog_updates WHERE post_id = ?')
        expect(mockDB.prepare).toHaveBeenCalledWith('DELETE FROM post_views WHERE post_id = ?')
        expect(mockDB.prepare).toHaveBeenCalledWith('DELETE FROM paywall_views WHERE post_id = ?')
        expect(mockDB.prepare).toHaveBeenCalledWith('DELETE FROM liveblog_entries WHERE liveblog_id IN (SELECT id FROM liveblogs WHERE post_id = ?)')
        expect(mockDB.prepare).toHaveBeenCalledWith('DELETE FROM liveblogs WHERE post_id = ?')
        expect(mockDB.prepare).toHaveBeenCalledWith('DELETE FROM hub_blocks WHERE hub_id IN (SELECT id FROM hubs WHERE post_id = ?)')
        expect(mockDB.prepare).toHaveBeenCalledWith('DELETE FROM hubs WHERE post_id = ?')
        expect(mockDB.prepare).toHaveBeenLastCalledWith('DELETE FROM posts WHERE id = ?')
    })

    it('o código-fonte de index.ts contém a nova rota de exclusão', async () => {
        // Verificação via leitura do arquivo (já que não podemos instanciar o app facilmente aqui sem muitos mocks)
        const fs = await import('fs')
        const path = await import('path')
        const indexContent = fs.readFileSync(path.join(__dirname, '../../functions/index.ts'), 'utf-8')

        expect(indexContent).toContain("app.post('/admin/posts/:id/delete'")
        expect(indexContent).toContain("await deletePost(c.env.DB, id)")
    })

    it('o código-fonte de packages/core/admin/posts.ts contém os botões de exclusão', async () => {
        const fs = await import('fs')
        const path = await import('path')
        const postsUiContent = fs.readFileSync(path.join(__dirname, '../../packages/core/admin/posts.ts'), 'utf-8')

        expect(postsUiContent).toContain("action=\"/admin/posts/${post.id}/delete\"")
        expect(postsUiContent).toContain("confirm('Tem certeza que deseja excluir")
    })

    it('a tela de edição não renderiza formulário de exclusão aninhado no formulário de salvar', async () => {
        const fs = await import('fs')
        const path = await import('path')
        const postsUiContent = fs.readFileSync(path.join(__dirname, '../../packages/core/admin/posts.ts'), 'utf-8')

        expect(postsUiContent).toContain('form="deletePostForm"')
        expect(postsUiContent).toContain('id="deletePostForm"')
        expect(postsUiContent).toContain('id="postEditorForm"')
    })
})
