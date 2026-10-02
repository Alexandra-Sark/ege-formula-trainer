CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  nickname text NOT NULL CHECK (char_length(nickname) BETWEEN 2 AND 40),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS legal_acceptances (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('terms','consent')),
  document_version text NOT NULL,
  document_sha256 text NOT NULL,
  accepted_at timestamptz NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  method text NOT NULL DEFAULT 'checkbox-and-email-code',
  PRIMARY KEY (user_id, document_type, document_version, document_sha256)
);
CREATE TABLE IF NOT EXISTS auth_challenges (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('register','login')),
  nickname text,
  code_hash text NOT NULL,
  legal jsonb,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS auth_expiry_idx ON auth_challenges(expires_at);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS rate_limits (
  key_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS progress_events (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  payload_hash text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('answer','session')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,event_id)
);
CREATE TABLE IF NOT EXISTS task_progress (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_uid text NOT NULL,
  correct integer NOT NULL DEFAULT 0 CHECK (correct >= 0),
  wrong integer NOT NULL DEFAULT 0 CHECK (wrong >= 0),
  self_reviewed integer NOT NULL DEFAULT 0 CHECK (self_reviewed >= 0),
  last_seen timestamptz,
  PRIMARY KEY (user_id,task_uid)
);
CREATE TABLE IF NOT EXISTS user_progress (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sessions integer NOT NULL DEFAULT 0 CHECK (sessions >= 0)
);
CREATE TABLE IF NOT EXISTS proof_drafts (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_uid text NOT NULL,
  content text NOT NULL CHECK (char_length(content) <= 12000),
  revision integer NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,task_uid)
);
CREATE TABLE IF NOT EXISTS progress_imports (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  import_id uuid NOT NULL,
  payload_hash text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);
