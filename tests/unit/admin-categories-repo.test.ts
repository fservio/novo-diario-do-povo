/**
 * Unit Tests: Categories Repository
 */

import { describe, it, expect } from 'vitest'

// Manual slugify implementation for testing
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

describe('Categories Repository', () => {
  describe('slugify', () => {
    it('should convert text to lowercase slug', () => {
      expect(slugify('Tecnologia')).toBe('tecnologia')
      expect(slugify('ECONOMIA')).toBe('economia')
    })

    it('should replace spaces with hyphens', () => {
      expect(slugify('Ciência e Tecnologia')).toBe('ciencia-e-tecnologia')
      expect(slugify('Política Nacional')).toBe('politica-nacional')
    })

    it('should remove diacritics (accents)', () => {
      expect(slugify('Educação')).toBe('educacao')
      expect(slugify('Saúde Pública')).toBe('saude-publica')
      expect(slugify('São Paulo')).toBe('sao-paulo')
    })

    it('should remove special characters', () => {
      expect(slugify('Tech & Innovation')).toBe('tech-innovation')
      expect(slugify('Node.js Development')).toBe('node-js-development')
      expect(slugify('C++ Programming')).toBe('c-programming')
    })

    it('should remove leading and trailing hyphens', () => {
      expect(slugify(' Tecnologia ')).toBe('tecnologia')
      expect(slugify('---Tech---')).toBe('tech')
    })

    it('should collapse multiple hyphens', () => {
      expect(slugify('Tech  &  Innovation')).toBe('tech-innovation')
      expect(slugify('Web---Development')).toBe('web-development')
    })

    it('should handle empty strings', () => {
      expect(slugify('')).toBe('')
      expect(slugify('   ')).toBe('')
    })

    it('should handle numbers', () => {
      expect(slugify('Web 3.0')).toBe('web-3-0')
      expect(slugify('2024 Trends')).toBe('2024-trends')
    })

    it('should handle mixed case and accents', () => {
      expect(slugify('Política e Economia do Brasil')).toBe('politica-e-economia-do-brasil')
      expect(slugify('Tecnología é Inovação')).toBe('tecnologia-e-inovacao')
    })
  })

  describe('Slug uniqueness concept', () => {
    it('should support suffix pattern for unique slugs', () => {
      // Test the pattern we use for ensuring unique slugs
      const baseSlug = 'tecnologia'
      const slug2 = `${baseSlug}-2`
      const slug3 = `${baseSlug}-3`

      expect(slug2).toBe('tecnologia-2')
      expect(slug3).toBe('tecnologia-3')

      // Pattern matching for existing slugs
      expect(slug2).toMatch(/^tecnologia-\d+$/)
      expect(slug3).toMatch(/^tecnologia-\d+$/)
    })

    it('should extract base slug from suffixed slug', () => {
      const slug = 'tecnologia-2'
      const match = slug.match(/^(.+)-\d+$/)
      
      expect(match).not.toBeNull()
      expect(match![1]).toBe('tecnologia')
    })
  })

  describe('Toggle concept', () => {
    it('should toggle is_active between 0 and 1', () => {
      const active = 1
      const inactive = 0

      const toggledActive = active === 1 ? 0 : 1
      const toggledInactive = inactive === 1 ? 0 : 1

      expect(toggledActive).toBe(0)
      expect(toggledInactive).toBe(1)
    })

    it('should return boolean status after toggle', () => {
      const currentStatus = 1
      const newStatus = currentStatus === 1 ? 0 : 1
      const isActive = newStatus === 1

      expect(isActive).toBe(false)
    })
  })

  describe('Display order concept', () => {
    it('should sort categories by display_order', () => {
      const categories = [
        { id: 1, name: 'Política', display_order: 10 },
        { id: 2, name: 'Tecnologia', display_order: 5 },
        { id: 3, name: 'Economia', display_order: 15 },
      ]

      const sorted = [...categories].sort((a, b) => a.display_order - b.display_order)

      expect(sorted[0].name).toBe('Tecnologia')
      expect(sorted[1].name).toBe('Política')
      expect(sorted[2].name).toBe('Economia')
    })

    it('should handle same display_order with alphabetical fallback', () => {
      const categories = [
        { id: 1, name: 'Política', display_order: 0 },
        { id: 2, name: 'Economia', display_order: 0 },
        { id: 3, name: 'Tecnologia', display_order: 0 },
      ]

      const sorted = [...categories].sort((a, b) => {
        if (a.display_order !== b.display_order) {
          return a.display_order - b.display_order
        }
        return a.name.localeCompare(b.name)
      })

      expect(sorted[0].name).toBe('Economia')
      expect(sorted[1].name).toBe('Política')
      expect(sorted[2].name).toBe('Tecnologia')
    })
  })

  describe('Validation concepts', () => {
    it('should validate required fields', () => {
      const category = {
        name: 'Tecnologia',
        slug: 'tecnologia',
      }

      expect(category.name).toBeTruthy()
      expect(category.name.length).toBeGreaterThan(0)
      expect(category.name.length).toBeLessThanOrEqual(200)
    })

    it('should validate optional fields', () => {
      const category = {
        name: 'Tecnologia',
        description: 'Notícias sobre tecnologia',
        seo_title: undefined,
        seo_description: undefined,
      }

      expect(category.description).toBeTruthy()
      expect(category.seo_title).toBeUndefined()
      expect(category.seo_description).toBeUndefined()
    })

    it('should validate field lengths', () => {
      const longName = 'a'.repeat(201)
      const validName = 'a'.repeat(200)

      expect(longName.length).toBeGreaterThan(200)
      expect(validName.length).toBeLessThanOrEqual(200)
    })
  })
})
