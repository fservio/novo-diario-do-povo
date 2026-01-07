-- ============================================================================
-- Migration: 0002_ads_engine.sql
-- Adicionar schema completo para Ads Engine
-- ============================================================================

-- Verificar se tabela já existe (idempotente)
CREATE TABLE IF NOT EXISTS ads_slots_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  template TEXT NOT NULL,
  provider TEXT NOT NULL,
  sizes_json TEXT NOT NULL,
  lazy INTEGER NOT NULL DEFAULT 1,
  min_height INTEGER NOT NULL DEFAULT 250,
  is_active INTEGER NOT NULL DEFAULT 1,
  
  -- GAM specific
  gam_unit_path TEXT,
  gam_targeting_json TEXT,
  
  -- AdSense specific
  adsense_slot_id TEXT,
  adsense_format TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ads_slots_new_template_active ON ads_slots_new(template, is_active);

-- Se ads_slots antiga existe e ads_slots_new foi criada, migrar dados
INSERT OR IGNORE INTO ads_slots_new (id, name, template, provider, sizes_json, lazy, min_height, is_active, created_at, updated_at)
SELECT id, 
       slot_id as name,
       template,
       'gam' as provider,
       sizes_json,
       lazy,
       250 as min_height,
       is_active,
       created_at,
       updated_at
FROM ads_slots WHERE EXISTS (SELECT 1 FROM ads_slots);

-- Drop old table se existir
DROP TABLE IF EXISTS ads_slots;

-- Rename new table
ALTER TABLE ads_slots_new RENAME TO ads_slots;

-- Índice final
CREATE INDEX IF NOT EXISTS idx_ads_slots_template_active ON ads_slots(template, is_active);
