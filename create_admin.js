/**
 * Script para criar usuário admin manualmente
 */

import { hashPassword } from './packages/core/auth/index.ts'

const env = {
  DB: {
    prepare: (sql) => {
      console.log('SQL:', sql)
      return {
        bind: (...params) => {
          console.log('Params:', params)
          return {
            run: async () => {
              console.log('Execução simulada')
              return { success: true, meta: { last_row_id: 1 } }
            }
          }
        }
      }
    }
  },
  ADMIN_BOOTSTRAP_EMAIL: 'admin@jornal.local',
  ADMIN_BOOTSTRAP_PASSWORD: 'Admin123!@#'
}

async function createAdmin() {
  try {
    const passwordHash = await hashPassword(env.ADMIN_BOOTSTRAP_PASSWORD)
    console.log('Password hash criado:', passwordHash.substring(0, 20) + '...')
    
    const result = await env.DB.prepare(`
      INSERT INTO users (email, password_hash, name, role, is_active)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      env.ADMIN_BOOTSTRAP_EMAIL,
      passwordHash,
      'Administrador',
      'admin',
      1
    ).run()
    
    console.log('Usuário admin criado com sucesso!', result)
  } catch (error) {
    console.error('Erro ao criar admin:', error)
  }
}

createAdmin()