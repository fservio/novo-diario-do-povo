CREATE TABLE IF NOT EXISTS neural_dossiers (
  mission_id TEXT NOT NULL REFERENCES neural_missions(id),
  execution_id TEXT NOT NULL,
  dossier_json TEXT NOT NULL CHECK (json_valid(dossier_json)),
  PRIMARY KEY (mission_id, execution_id)
);
