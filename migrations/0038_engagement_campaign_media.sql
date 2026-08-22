-- Posicionamento responsivo da imagem nas campanhas de engajamento

ALTER TABLE engagement_campaigns ADD COLUMN image_position_x INTEGER NOT NULL DEFAULT 50;
ALTER TABLE engagement_campaigns ADD COLUMN image_position_y INTEGER NOT NULL DEFAULT 50;

