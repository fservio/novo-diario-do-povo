/**
 * Tests: Admin Posts Zod Validation
 */

import { describe, it, expect } from 'vitest'
import { createPostSchema, updatePostSchema, scheduleSchema } from '../../packages/core/admin/posts'

describe('Admin Posts Zod Validation', () => {
  describe('createPostSchema', () => {
    it('valida post válido', () => {
      const valid = {
        title: 'Título do Post',
        content: '<p>Conteúdo do post</p>',
        category_id: 1,
        author_id: 1,
      }
      
      const result = createPostSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })
    
    it('rejeita título vazio', () => {
      const invalid = {
        title: '',
        content: '<p>Conteúdo</p>',
        category_id: 1,
        author_id: 1,
      }
      
      const result = createPostSchema.safeParse(invalid)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('title')
      }
    })
    
    it('rejeita conteúdo vazio', () => {
      const invalid = {
        title: 'Título',
        content: '',
        category_id: 1,
        author_id: 1,
      }
      
      const result = createPostSchema.safeParse(invalid)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('content')
      }
    })
    
    it('rejeita category_id inválido', () => {
      const invalid = {
        title: 'Título',
        content: '<p>Conteúdo</p>',
        category_id: -1,
        author_id: 1,
      }
      
      const result = createPostSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })
    
    it('rejeita author_id inválido', () => {
      const invalid = {
        title: 'Título',
        content: '<p>Conteúdo</p>',
        category_id: 1,
        author_id: 0,
      }
      
      const result = createPostSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })
    
    it('aceita campos opcionais', () => {
      const valid = {
        title: 'Título',
        slug: 'titulo-customizado',
        excerpt: 'Resumo do post',
        content: '<p>Conteúdo</p>',
        category_id: 1,
        author_id: 1,
        cover_media_id: 5,
        seo_title: 'SEO Title',
        seo_description: 'SEO Description',
        is_premium: 1,
        paywall_tier: 'metered',
        tags: [1, 2, 3],
      }
      
      const result = createPostSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })
    
    it('valida template enum', () => {
      const valid = {
        title: 'Título',
        content: '<p>Conteúdo</p>',
        category_id: 1,
        author_id: 1,
        template: 'liveblog',
      }
      
      const result = createPostSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })
    
    it('rejeita template inválido', () => {
      const invalid = {
        title: 'Título',
        content: '<p>Conteúdo</p>',
        category_id: 1,
        author_id: 1,
        template: 'invalid',
      }
      
      const result = createPostSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })
    
    it('valida paywall_tier enum', () => {
      const tiers = ['free', 'metered', 'hard']
      
      tiers.forEach(tier => {
        const valid = {
          title: 'Título',
          content: '<p>Conteúdo</p>',
          category_id: 1,
          author_id: 1,
          paywall_tier: tier,
        }
        
        const result = createPostSchema.safeParse(valid)
        expect(result.success).toBe(true)
      })
    })
    
    it('rejeita URL canônica inválida', () => {
      const invalid = {
        title: 'Título',
        content: '<p>Conteúdo</p>',
        category_id: 1,
        author_id: 1,
        seo_canonical: 'not-a-url',
      }
      
      const result = createPostSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })
  })
  
  describe('updatePostSchema', () => {
    it('permite atualização parcial', () => {
      const valid = {
        title: 'Novo Título',
      }
      
      const result = updatePostSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })
    
    it('permite atualização vazia', () => {
      const result = updatePostSchema.safeParse({})
      expect(result.success).toBe(true)
    })
    
    it('valida campos quando presentes', () => {
      const invalid = {
        category_id: -1,
      }
      
      const result = updatePostSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })
  })
  
  describe('scheduleSchema', () => {
    it('valida data futura', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      
      const valid = {
        scheduled_at: futureDate,
      }
      
      const result = scheduleSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })
    
    it('rejeita data no passado', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      
      const invalid = {
        scheduled_at: pastDate,
      }
      
      const result = scheduleSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })
    
    it('rejeita data presente', () => {
      const now = new Date().toISOString()
      
      const invalid = {
        scheduled_at: now,
      }
      
      const result = scheduleSchema.safeParse(invalid)
      expect(result.success).toBe(false)
    })
  })
})
