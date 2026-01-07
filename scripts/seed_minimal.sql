-- Seed mínimo para testes locais

-- User admin com PBKDF2 (senha: AdminPass123!)
DELETE FROM users WHERE email IN ('fabioservi@gmail.com', 'admin@portal.local');
INSERT INTO users (email, password_hash, name, role) VALUES
  ('admin@portal.local', 'pbkdf2_sha256$210000$Q4-buaO7hDhdffjnapj0Lg$Mp0T2mq6bFyArpK0tAEcJX1mcySwdV-zVw2dkXB3dzg', 'Admin', 'admin');

-- Categories
INSERT OR IGNORE INTO categories (slug, name, is_active) VALUES
  ('brasil', 'Brasil', 1),
  ('economia', 'Economia', 1),
  ('tecnologia', 'Tecnologia', 1);

-- Author
INSERT OR IGNORE INTO authors (slug, name, is_active) VALUES
  ('redacao', 'Redação', 1);

-- Settings
INSERT OR IGNORE INTO settings (key, value_json, scope) VALUES
  ('site_name', '"Portal Demo"', 'public'),
  ('home_sections', '["brasil", "economia"]', 'public');
