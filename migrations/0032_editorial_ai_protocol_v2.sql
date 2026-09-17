-- Protocolo editorial v2: direção de pauta e metadados de qualidade das versões

ALTER TABLE editorial_ai_workspaces ADD COLUMN editorial_format TEXT NOT NULL DEFAULT 'news'
  CHECK (editorial_format IN ('note', 'news', 'report', 'explainer', 'rewrite'));
ALTER TABLE editorial_ai_workspaces ADD COLUMN editorial_depth TEXT NOT NULL DEFAULT 'standard'
  CHECK (editorial_depth IN ('brief', 'standard', 'deep'));
ALTER TABLE editorial_ai_workspaces ADD COLUMN primary_angle TEXT;
ALTER TABLE editorial_ai_workspaces ADD COLUMN target_audience TEXT;
ALTER TABLE editorial_ai_workspaces ADD COLUMN geographic_scope TEXT;
ALTER TABLE editorial_ai_workspaces ADD COLUMN required_information TEXT;
ALTER TABLE editorial_ai_workspaces ADD COLUMN key_questions TEXT;
ALTER TABLE editorial_ai_workspaces ADD COLUMN target_word_count INTEGER
  CHECK (target_word_count IS NULL OR target_word_count BETWEEN 200 AND 2500);

ALTER TABLE editorial_ai_revisions ADD COLUMN revision_kind TEXT NOT NULL DEFAULT 'draft'
  CHECK (revision_kind IN ('draft', 'copydesk'));
ALTER TABLE editorial_ai_revisions ADD COLUMN editorial_plan TEXT;
ALTER TABLE editorial_ai_revisions ADD COLUMN reporting_gaps_json TEXT;
ALTER TABLE editorial_ai_revisions ADD COLUMN quality_assessment TEXT;
