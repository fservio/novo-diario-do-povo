-- Manual focal point for the 4:5 editorial crop

ALTER TABLE instagram_publications ADD COLUMN image_position_x INTEGER NOT NULL DEFAULT 50;
ALTER TABLE instagram_publications ADD COLUMN image_position_y INTEGER NOT NULL DEFAULT 50;
