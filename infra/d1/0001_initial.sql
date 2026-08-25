CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  phase TEXT NOT NULL,
  archived_at TEXT,
  updated_at TEXT NOT NULL,
  unresolved_count INTEGER NOT NULL DEFAULT 0,
  total_items INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS projects_updated_at ON projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS projects_active ON projects(archived_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS projects_phase ON projects(phase, updated_at DESC);

CREATE TABLE IF NOT EXISTS upload_sessions (
  session_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('script', 'cut', 'document')),
  key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  content_type TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  etag TEXT,
  multipart_upload_id TEXT
);

CREATE INDEX IF NOT EXISTS upload_sessions_project ON upload_sessions(project_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  monitor_id TEXT
);
