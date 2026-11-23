INSERT OR IGNORE INTO neural_agents (id, category_id, workflow_id)
SELECT 'reporter-editorial-' || slug, id, 'diario-editorial-' || slug FROM categories;

INSERT OR IGNORE INTO neural_missions (id, agent_id)
SELECT 'editorial-' || c.slug, a.id FROM neural_agents a JOIN categories c ON c.id = a.category_id
WHERE a.id = 'reporter-editorial-' || c.slug AND a.workflow_id = 'diario-editorial-' || c.slug;

CREATE TRIGGER IF NOT EXISTS neural_register_new_category
AFTER INSERT ON categories
BEGIN
  INSERT OR IGNORE INTO neural_agents (id, category_id, workflow_id)
  VALUES ('reporter-editorial-' || NEW.slug, NEW.id, 'diario-editorial-' || NEW.slug);

  INSERT OR IGNORE INTO neural_missions (id, agent_id)
  SELECT 'editorial-' || NEW.slug, id FROM neural_agents
  WHERE id = 'reporter-editorial-' || NEW.slug AND category_id = NEW.id
    AND workflow_id = 'diario-editorial-' || NEW.slug;
END;
