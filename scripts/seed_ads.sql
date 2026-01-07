-- ============================================================================
-- Seed: Ads Slots & Settings Defaults
-- ============================================================================

-- Settings Ads (public)
INSERT OR IGNORE INTO settings (key, value_json, scope, updated_at) VALUES
('ads.provider_mode', '"off"', 'public', datetime('now')),
('ads.adsense.client_id', '""', 'public', datetime('now')),
('ads.gam.network_code', '""', 'public', datetime('now')),
('ads.consent.enabled', 'false', 'public', datetime('now')),
('ads.csp_allow_unsafe_eval', 'false', 'public', datetime('now')),
-- CSP by directive (hosts without https://)
('ads.csp.script_hosts', '["*.googlesyndication.com", "*.google.com", "*.doubleclick.net", "*.googletagservices.com"]', 'public', datetime('now')),
('ads.csp.frame_hosts', '["*.googlesyndication.com", "*.google.com", "*.doubleclick.net"]', 'public', datetime('now')),
('ads.csp.connect_hosts', '["*.googlesyndication.com", "*.google.com", "*.doubleclick.net"]', 'public', datetime('now')),
('ads.csp.img_hosts', '["*.googlesyndication.com", "*.google.com", "*.doubleclick.net"]', 'public', datetime('now')),
-- Legacy fallback (mantido para compatibilidade)
('ads.csp_allowlist', '["*.googlesyndication.com", "*.google.com", "*.doubleclick.net", "*.googletagservices.com", "securepubads.g.doubleclick.net", "googleads.g.doubleclick.net", "tpc.googlesyndication.com"]', 'public', datetime('now')),
('ads.subscriber_mode.enabled', 'true', 'public', datetime('now')),
('ads.subscriber_mode.article_disable_sticky', 'true', 'public', datetime('now')),
('ads.subscriber_mode.article_max_inread', '1', 'public', datetime('now')),
-- Cover of the Day settings
('cover_of_day.r2_key', '"default-cover.jpg"', 'public', datetime('now')),
('cover_of_day.alt', '"Capa do Jornal"', 'public', datetime('now')),
('cover_of_day.aspect_ratio', '"3/4"', 'public', datetime('now')),
-- Home sections (CMS-driven nav and blocks)
('home.fixed_sections', '[{"slug":"brasil","title":"Brasil","enabled":true},{"slug":"economia","title":"Economia","enabled":true},{"slug":"politica","title":"Política","enabled":true},{"slug":"cidades","title":"Cidades","enabled":true},{"slug":"esporte","title":"Esporte","enabled":true}]', 'public', datetime('now'));

-- Ads Slots defaults
INSERT OR IGNORE INTO ads_slots (name, template, provider, sizes_json, lazy, min_height, is_active, gam_unit_path, adsense_format) VALUES
('home_top_leaderboard', 'home', 'gam', '[[970,250],[728,90],[320,100]]', 0, 250, 1, '/home/top', 'horizontal'),
('home_infeed_1', 'home', 'gam', '[[300,250]]', 1, 250, 1, '/home/infeed1', 'rectangle'),
('home_infeed_2', 'home', 'gam', '[[300,250]]', 1, 250, 1, '/home/infeed2', 'rectangle'),
('home_sidebar_1', 'home', 'gam', '[[300,600],[300,250]]', 1, 600, 1, '/home/sidebar1', 'vertical'),
('article_top', 'article', 'gam', '[[728,90],[320,100]]', 0, 90, 1, '/article/top', 'horizontal'),
('article_inread_1', 'article', 'gam', '[[300,250]]', 1, 250, 1, '/article/inread1', 'rectangle'),
('article_footer', 'article', 'gam', '[[728,90],[320,100]]', 1, 90, 1, '/article/footer', 'horizontal');
