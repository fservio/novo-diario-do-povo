CREATE TABLE IF NOT EXISTS neural_dispatch (
  mission_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  queued_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (mission_id, execution_id),
  FOREIGN KEY (mission_id, execution_id) REFERENCES neural_dossiers(mission_id, execution_id)
);

CREATE TRIGGER IF NOT EXISTS neural_queue_dossier
AFTER INSERT ON neural_dossiers
BEGIN
  INSERT INTO neural_dispatch (mission_id, execution_id) VALUES (NEW.mission_id, NEW.execution_id);
END;
