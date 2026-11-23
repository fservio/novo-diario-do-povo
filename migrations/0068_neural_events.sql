CREATE TABLE neural_agents (
  id TEXT PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  workflow_id TEXT NOT NULL UNIQUE
);

CREATE TABLE neural_missions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES neural_agents(id),
  workspace_id INTEGER REFERENCES editorial_ai_workspaces(id) ON DELETE SET NULL,
  post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL
);

CREATE TABLE neural_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_event_id TEXT NOT NULL UNIQUE,
  mission_id TEXT NOT NULL REFERENCES neural_missions(id),
  execution_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  stage TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX neural_events_execution ON neural_events (mission_id, execution_id, occurred_at, id);
CREATE INDEX neural_events_rate ON neural_events (mission_id, received_at);

-- Política resolves by slug in the target database.
INSERT INTO neural_agents (id, category_id, workflow_id)
SELECT 'reporter_politica', id, 'politica-documental-staging' FROM categories WHERE slug = 'politica';

INSERT INTO neural_missions (id, agent_id)
SELECT 'politica-distrital-misto-2026-11', id FROM neural_agents WHERE id = 'reporter_politica';

CREATE VIEW neural_executions AS
SELECT events.mission_id, events.execution_id, MAX(events.occurred_at) AS last_activity_at,
  CASE
    WHEN MAX(events.event_type = 'execution.failed') THEN 'failed'
    WHEN MAX(events.event_type = 'execution.completed') THEN 'completed'
    WHEN MAX(events.event_type = 'dossier.ready') THEN 'dossier_ready'
    WHEN MAX(events.event_type = 'execution.started') THEN 'running'
    ELSE 'unknown'
  END AS status
FROM neural_events AS events
GROUP BY events.mission_id, events.execution_id;
