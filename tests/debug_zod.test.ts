
import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// Copiando o NOVO schema para teste isolado
const createPostSchema = z.object({
  hat: z.string()
    .max(60, 'Chapéu deve ter no máximo 60 caracteres')
    .transform(val => val.trim().toUpperCase())
    .optional(),
  title: z.string().min(1, 'Título é obrigatório').max(500),
})

const updatePostSchema = createPostSchema.partial()

describe('Debug Schema Hat', () => {
  it('deve transformar hat no create', () => {
    const result = createPostSchema.safeParse({
      title: 'Title',
      hat: 'teste'
    })
    
    expect(result.success).toBe(true)
    if(result.success) {
      console.log('Create result:', result.data)
      expect(result.data.hat).toBe('TESTE')
    }
  })

  it('deve transformar hat no update', () => {
    const result = updatePostSchema.safeParse({
      hat: 'teste'
    })
    
    expect(result.success).toBe(true)
    if(result.success) {
      console.log('Update result:', result.data)
      // AQUI PODE ESTAR O PROBLEMA
      // Se o .or(z.literal('')) interferir, pode não transformar
      expect(result.data.hat).toBe('TESTE') 
    }
  })
  
  it('deve aceitar string vazia no update', () => {
    const result = updatePostSchema.safeParse({
      hat: ''
    })
    expect(result.success).toBe(true)
    if(result.success) {
      console.log('Update empty result:', result.data)
    }
  })
})
